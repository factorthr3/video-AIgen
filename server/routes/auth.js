import { Router } from 'express';
import { config } from '../config.js';
import { db, update } from '../db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, currentUser, publicUser, createUser,
  createOAuthState, consumeOAuthState,
} from '../auth.js';
import { usage } from '../services.js';

const router = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Small in-memory limiter for credential endpoints: 10 attempts / 10 min / IP.
const attempts = new Map();
function rateLimit(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < 600_000);
  if (recent.length >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 10_000) attempts.clear();
  next();
}

router.post('/signup', rateLimit, async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!EMAIL.test(email || '')) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Use at least 8 characters for your password.' });
  if (db.get('SELECT id FROM users WHERE email = ?', email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.' });
  }
  const user = createUser({ email, name: name?.trim(), passwordHash: await hashPassword(password) });
  createSession(res, user.id);
  res.json({ user: publicUser(user), usage: usage(user) });
});

router.post('/login', rateLimit, async (req, res) => {
  const { email, password } = req.body || {};
  const user = email && db.get('SELECT * FROM users WHERE email = ?', String(email).toLowerCase());
  if (!user || !(await verifyPassword(password || '', user.password_hash))) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  createSession(res, user.id);
  res.json({ user: publicUser(user), usage: usage(user) });
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.json({ user: null });
  res.json({ user: publicUser(user), usage: usage(user) });
});

// ---- Google sign-in (same OAuth client as YouTube, basic scopes only) ----
const googleRedirect = () => `${config.appUrl}/api/auth/google/callback`;

router.get('/google', (req, res) => {
  if (!config.google.clientId) return res.redirect(`${config.appUrl}/login?error=google_not_configured`);
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: googleRedirect(),
    response_type: 'code',
    scope: 'openid email profile',
    state: createOAuthState('google-login'),
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  try {
    if (!consumeOAuthState(req.query.state, 'google-login')) throw new Error('Sign-in expired, please try again.');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code), client_id: config.google.clientId, client_secret: config.google.clientSecret,
        redirect_uri: googleRedirect(), grant_type: 'authorization_code',
      }),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(token.error_description || 'Google sign-in failed');
    const profile = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })).json();
    if (!profile.email_verified) throw new Error('Your Google email is not verified.');

    let user = db.get('SELECT * FROM users WHERE google_id = ?', profile.sub)
      || db.get('SELECT * FROM users WHERE email = ?', profile.email.toLowerCase());
    if (user) {
      update('users', user.id, { google_id: profile.sub, avatar_url: user.avatar_url || profile.picture || null });
    } else {
      user = createUser({ email: profile.email, name: profile.name, googleId: profile.sub, avatarUrl: profile.picture });
    }
    createSession(res, user.id);
    res.redirect(`${config.appUrl}/app`);
  } catch (err) {
    res.redirect(`${config.appUrl}/login?error=${encodeURIComponent(err.message)}`);
  }
});

export default router;
