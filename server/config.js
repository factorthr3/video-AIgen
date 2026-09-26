// Central configuration. Every external provider is optional: when its key is
// missing, the pipeline falls back to a local implementation so the app still
// produces real videos end-to-end.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

// Load .env ourselves: `node --watch --env-file-if-exists` restart-loops when the file is missing.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const DATA_DIR = path.resolve(ROOT, env.DATA_DIR || 'data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const FONTS_DIR = path.join(ROOT, 'assets', 'fonts');
for (const dir of [DATA_DIR, MEDIA_DIR, CACHE_DIR, UPLOAD_DIR]) fs.mkdirSync(dir, { recursive: true });

// A stable secret for session signing + token encryption. Generated once and
// persisted so restarts don't log everyone out or orphan encrypted tokens.
function loadSecret() {
  if (env.APP_SECRET) return env.APP_SECRET;
  const file = path.join(DATA_DIR, '.secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

// API_PORT wins in dev (the web dev server owns PORT); PORT is used by hosts like Railway.
const port = Number(env.API_PORT || env.PORT || 4100);

export const config = {
  isProd,
  port,
  // Public origin users see. In dev that's the Vite server, which proxies /api.
  appUrl: (env.APP_URL || (isProd ? `http://localhost:${port}` : 'http://localhost:5173')).replace(/\/$/, ''),
  secret: loadSecret(),

  anthropic: {
    enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    model: env.CLAUDE_MODEL || 'claude-opus-5',
  },
  openai: {
    key: env.OPENAI_API_KEY || '',
    imageModel: env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    imageQuality: env.OPENAI_IMAGE_QUALITY || 'medium',
    ttsModel: env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  },
  elevenlabs: {
    key: env.ELEVENLABS_API_KEY || '',
    model: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
  },
  imageProvider: env.IMAGE_PROVIDER || 'auto', // auto | openai | pollinations | procedural
  ttsProvider: env.TTS_PROVIDER || 'auto', // auto | elevenlabs | openai | system | silent

  google: { clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '' },
  tiktok: { clientKey: env.TIKTOK_CLIENT_KEY || '', clientSecret: env.TIKTOK_CLIENT_SECRET || '' },
  instagram: { appId: env.INSTAGRAM_APP_ID || '', appSecret: env.INSTAGRAM_APP_SECRET || '' },
  // Instagram fetches the video from a URL, so it must be publicly reachable.
  publicMediaUrl: (env.PUBLIC_MEDIA_URL || '').replace(/\/$/, ''),

  render: {
    width: Number(env.RENDER_WIDTH || 1080),
    height: Number(env.RENDER_HEIGHT || 1920),
    fps: Number(env.RENDER_FPS || 30),
  },
  ffmpeg: env.FFMPEG_PATH || 'ffmpeg',
  ffprobe: env.FFPROBE_PATH || 'ffprobe',
  schedulerEnabled: env.SCHEDULER !== 'off',
  // No payment processor yet: free plan switching is only allowed in dev, or
  // when explicitly enabled, so a public deploy can't be upgraded for free.
  demoBilling: env.DEMO_BILLING ? env.DEMO_BILLING === 'true' : !isProd,
};

export function providerStatus() {
  const img = resolveImageProvider();
  const tts = resolveTtsProvider();
  return {
    script: config.anthropic.enabled ? { provider: 'claude', model: config.anthropic.model } : { provider: 'library' },
    images: { provider: img },
    voice: { provider: tts },
    social: {
      youtube: Boolean(config.google.clientId),
      tiktok: Boolean(config.tiktok.clientKey),
      instagram: Boolean(config.instagram.appId),
    },
    googleSignIn: Boolean(config.google.clientId),
    demoBilling: config.demoBilling,
  };
}

export function resolveImageProvider() {
  if (config.imageProvider !== 'auto') return config.imageProvider;
  return config.openai.key ? 'openai' : 'procedural';
}

export function resolveTtsProvider() {
  if (config.ttsProvider !== 'auto') return config.ttsProvider;
  if (config.elevenlabs.key) return 'elevenlabs';
  if (config.openai.key) return 'openai';
  return 'system'; // macOS `say` or espeak-ng; degrades to silent narration if neither exists
}
