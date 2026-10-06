// Email/password + optional Google sign-in, cookie sessions, and at-rest
// encryption for third-party OAuth tokens.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';
import { db, insert, newId, now } from './db.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'blackcell_session';
const SESSION_DAYS = 30;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored?.startsWith('scrypt$')) return false;
  const [, salt, key] = stored.split('$');
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  insert('sessions', { token_hash: sha256(token), user_id: userId, expires_at: expires.toISOString() });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.appUrl.startsWith('https://'),
    expires,
    path: '/',
  });
}

export function destroySession(req, res) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function currentUser(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const row = db.get(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    sha256(token), now(),
  );
  return row || null;
}

export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please sign in.' });
  req.user = user;
  next();
}

export function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, avatarUrl: u.avatar_url, plan: u.plan, createdAt: u.created_at,
    admin: config.adminEmails.includes(String(u.email).toLowerCase()),
  };
}

export function createUser({ email, name, passwordHash = null, googleId = null, avatarUrl = null }) {
  return insert('users', {
    id: newId('usr'),
    email: email.toLowerCase(),
    name: name || email.split('@')[0],
    password_hash: passwordHash,
    google_id: googleId,
    avatar_url: avatarUrl,
    plan: 'free',
    created_at: now(),
  });
}

// ---- OAuth state (CSRF protection for every OAuth redirect) ----
export function createOAuthState(purpose, userId = null) {
  const state = crypto.randomBytes(24).toString('base64url');
  db.run("DELETE FROM oauth_states WHERE created_at < ?", new Date(Date.now() - 3600_000).toISOString());
  insert('oauth_states', { state, user_id: userId, purpose, created_at: now() });
  return state;
}

export function consumeOAuthState(state, purpose) {
  const row = state && db.get('SELECT * FROM oauth_states WHERE state = ? AND purpose = ?', state, purpose);
  if (row) db.run('DELETE FROM oauth_states WHERE state = ?', state);
  return row || null;
}

// ---- Token encryption (AES-256-GCM keyed from the app secret) ----
const encKey = crypto.createHash('sha256').update(`tokens:${config.secret}`).digest();

export function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

export function decrypt(blob) {
  if (!blob) return null;
  const [, iv, tag, data] = blob.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
