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
    baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    imageModel: env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst',
    imageQuality: env.OPENAI_IMAGE_QUALITY || 'high',
    imageSize: env.OPENAI_IMAGE_SIZE || '',
    ttsModel: env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  },
  elevenlabs: {
    key: env.ELEVENLABS_API_KEY || '',
    baseUrl: (env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/$/, ''),
    // Ad soundtracks (Music API, paid ElevenLabs plans). Falls back to older models.
    musicModel: env.ELEVENLABS_MUSIC_MODEL || 'music_v2_5',
    model: env.ELEVENLABS_MODEL || 'eleven_v3',
  },
  // AI video clips (image-to-video) via fal.ai's queue API.
  fal: {
    key: env.FAL_KEY || '',
    baseUrl: (env.FAL_QUEUE_URL || 'https://queue.fal.run').replace(/\/$/, ''),
    videoModel: env.FAL_VIDEO_MODEL || 'fal-ai/kling-video/v3/pro/image-to-video', // "AI video": every scene
    hookModel: env.FAL_HOOK_MODEL || 'fal-ai/ltx-2.3/image-to-video/fast', // "AI video hook": opening scene(s)
    // Clip lengths the model accepts, e.g. "5,10". Default: any whole second from 3 to 15 (Kling v3).
    durations: (env.FAL_VIDEO_DURATIONS || '').split(',').map(Number).filter(Boolean),
  },
  // AI video clips via Google's Gemini API (Veo). Paid only: Veo has no free tier.
  gemini: {
    key: env.GEMINI_API_KEY || '',
    baseUrl: (env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
    videoModel: env.GOOGLE_VIDEO_MODEL || 'veo-3.1-lite-generate-preview',
    // 720p allows 4/6/8-second clips; 1080p and 4k require 8 seconds.
    resolution: env.GOOGLE_VIDEO_RESOLUTION || '720p',
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
    // x264: lower CRF = higher quality (18 is visually near-lossless); slower preset = smaller file at the same quality.
    crf: String(env.RENDER_CRF || 18),
    preset: env.RENDER_PRESET || 'medium',
  },
  ffmpeg: env.FFMPEG_PATH || 'ffmpeg',
  ffprobe: env.FFPROBE_PATH || 'ffprobe',
  schedulerEnabled: env.SCHEDULER !== 'off',
  // Stripe billing. Inactive until STRIPE_SECRET_KEY is set.
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    currency: (env.STRIPE_CURRENCY || 'usd').toLowerCase(),
  },
  // Paystack billing. Inactive until PAYSTACK_SECRET_KEY is set.
  paystack: {
    secretKey: env.PAYSTACK_SECRET_KEY || '',
    baseUrl: env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
    // The currency Paystack charges in. Blank = the account's own (ZAR, NGN, GHS, KES, USD or XOF).
    currency: (env.PAYSTACK_CURRENCY || '').toUpperCase(),
    // Prices are in USD and converted at the day's rate; this fixes the rate (units per 1 USD)...
    exchangeRate: Number(env.PAYSTACK_EXCHANGE_RATE) || 0,
    // ...and this fixes exact amounts in the charge currency: "free=99,starter=310,daily=640,pro=1130".
    prices: Object.fromEntries((env.PAYSTACK_PRICES || '').split(',').map((pair) => pair.split('=').map((x) => x.trim()))
      .filter(([id, amount]) => id && Number(amount) > 0).map(([id, amount]) => [id, Number(amount)])),
  },
  // Which processor sells plans when both are configured: "paystack" or "stripe".
  billingProvider: env.BILLING_PROVIDER || '',
  // Full access without a subscription (the owner, staff, testers).
  adminEmails: (env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  // "open" = anyone can sign up; "invite" = only ALLOWED_EMAILS (comma list) can.
  signupMode: env.SIGNUP_MODE === 'invite' ? 'invite' : 'open',
  allowedEmails: (env.ALLOWED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  // No payment processor yet: free plan switching is only allowed in dev, or
  // when explicitly enabled, so a public deploy can't be upgraded for free.
  demoBilling: env.DEMO_BILLING ? env.DEMO_BILLING === 'true' : !isProd,
};

export function providerStatus() {
  return {
    copy: config.anthropic.enabled ? { provider: 'claude', model: config.anthropic.model } : { provider: 'template' },
    voice: { provider: resolveTtsProvider() },
    music: { provider: config.elevenlabs.key ? 'elevenlabs' : null, model: config.elevenlabs.musicModel },
    googleSignIn: Boolean(config.google.clientId),
    demoBilling: config.demoBilling,
    signupMode: config.signupMode,
  };
}

export function resolveTtsProvider() {
  if (config.ttsProvider !== 'auto') return config.ttsProvider;
  if (config.elevenlabs.key) return 'elevenlabs';
  if (config.openai.key) return 'openai';
  return 'system'; // macOS `say` or espeak-ng; degrades to silent narration if neither exists
}
