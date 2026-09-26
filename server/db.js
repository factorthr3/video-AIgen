// SQLite via Node's built-in driver — no native build step, one file on disk.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './config.js';

// Databases created before the rebrand were called nrrtv.db; carry them over.
const dbFile = path.join(DATA_DIR, 'blackcell.db');
const legacyDb = path.join(DATA_DIR, 'nrrtv.db');
if (!fs.existsSync(dbFile) && fs.existsSync(legacyDb)) {
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(legacyDb + suffix)) fs.renameSync(legacyDb + suffix, dbFile + suffix);
  }
}
const sqlite = new DatabaseSync(dbFile);
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  niche TEXT NOT NULL,
  custom_topic TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  voice TEXT NOT NULL,
  art_style TEXT NOT NULL,
  caption_style TEXT NOT NULL DEFAULT 'bold',
  music TEXT NOT NULL DEFAULT 'none',
  duration INTEGER NOT NULL DEFAULT 60,
  schedule_days TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  schedule_time TEXT NOT NULL DEFAULT '18:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  auto_post INTEGER NOT NULL DEFAULT 1,
  account_ids TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id TEXT REFERENCES series(id) ON DELETE SET NULL,
  origin TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT,
  progress REAL NOT NULL DEFAULT 0,
  title TEXT,
  description TEXT,
  hashtags TEXT NOT NULL DEFAULT '[]',
  script TEXT,
  settings TEXT NOT NULL,
  duration REAL,
  error TEXT,
  providers TEXT,
  auto_post INTEGER NOT NULL DEFAULT 0,
  publish_at TEXT,
  auto_posted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_id TEXT,
  username TEXT NOT NULL,
  avatar_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  external_id TEXT,
  url TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT,
  purpose TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_videos_series ON videos(series_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_video ON posts(video_id);
`);

// Additive migrations for databases created by earlier versions.
function ensureColumn(table, column, definition) {
  const exists = sqlite.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('videos', 'publish_at', 'TEXT');
ensureColumn('videos', 'auto_posted', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('posts', 'note', 'TEXT');
ensureColumn('series', 'motion', "TEXT NOT NULL DEFAULT 'video'");
ensureColumn('users', 'stripe_customer_id', 'TEXT');
ensureColumn('users', 'stripe_subscription_id', 'TEXT');
ensureColumn('users', 'subscription_status', 'TEXT');
ensureColumn('users', 'current_period_end', 'TEXT');
ensureColumn('users', 'cancel_at_period_end', 'INTEGER NOT NULL DEFAULT 0');

const stmtCache = new Map();
function stmt(sql) {
  let s = stmtCache.get(sql);
  if (!s) stmtCache.set(sql, (s = sqlite.prepare(sql)));
  return s;
}

export const db = {
  get: (sql, ...params) => stmt(sql).get(...params),
  all: (sql, ...params) => stmt(sql).all(...params),
  run: (sql, ...params) => stmt(sql).run(...params),
  transaction(fn) {
    sqlite.exec('BEGIN');
    try {
      const result = fn();
      sqlite.exec('COMMIT');
      return result;
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  },
};

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
export const now = () => new Date().toISOString();

// Insert/update helpers that take plain objects.
export function insert(table, row) {
  const keys = Object.keys(row);
  db.run(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => row[k]));
  return row;
}

export function update(table, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  db.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => fields[k]), id);
}

export const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
};
