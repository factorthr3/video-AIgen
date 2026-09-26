import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { config, providerStatus, ROOT, UPLOAD_DIR } from './config.js';
import { catalog, PLAN, VOICE, LANGUAGE } from './catalog.js';
import { db, update } from './db.js';
import { requireAuth, publicUser } from './auth.js';
import { HttpError, usage } from './services.js';
import { resumePendingJobs, queueDepth, videoFile } from './pipeline/index.js';
import { musicTrack, MUSIC_IDS } from './pipeline/music.js';
import { voicePreview } from './pipeline/tts.js';
import { publicMediaSig } from './social/index.js';
import { startScheduler } from './scheduler.js';
import authRoutes from './routes/auth.js';
import seriesRoutes from './routes/series.js';
import videoRoutes from './routes/videos.js';
import accountRoutes from './routes/accounts.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, queue: queueDepth() }));
app.get('/api/catalog', (req, res) => res.json({ ...catalog(), providers: providerStatus() }));

app.use('/api/auth', authRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/accounts', accountRoutes);

// Voice samples for the series wizard (cached per provider/voice/language).
app.get('/api/voices/:id/preview', requireAuth, async (req, res) => {
  if (!VOICE[req.params.id]) throw new HttpError(404, 'Unknown voice.');
  const language = LANGUAGE[req.query.language] ? req.query.language : 'en';
  res.type('audio/mp4').sendFile(await voicePreview(req.params.id, language));
});

app.get('/api/music/:id/preview', requireAuth, async (req, res) => {
  const file = await musicTrack(req.params.id);
  if (!file) throw new HttpError(404, 'Unknown track.');
  res.type('audio/mp4').sendFile(file);
});

// Custom background music.
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase().slice(0, 6)}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^audio\//.test(file.mimetype)),
});
app.post('/api/uploads/music', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'Upload an audio file (MP3, WAV or M4A, up to 15 MB).');
  res.status(201).json({ id: `upload:${req.file.filename}`, name: req.file.originalname });
});

// Plans. No payment processor is wired up yet, so switching is instant (dev /
// DEMO_BILLING only). Replace with Stripe Checkout + webhook before launch.
app.post('/api/billing/plan', requireAuth, (req, res) => {
  const plan = PLAN[req.body?.plan];
  if (!plan) throw new HttpError(400, 'Unknown plan.');
  if (!config.demoBilling && plan.price > 0) throw new HttpError(501, 'Paid plans are not available yet: payments have not been set up on this server.');
  update('users', req.user.id, { plan: plan.id });
  const user = db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  res.json({ user: publicUser(user), usage: usage(user) });
});

// Public, signed video URL used by Instagram to fetch Reels.
app.get('/api/public-media/:id/:sig.mp4', (req, res) => {
  const expected = publicMediaSig(req.params.id);
  const ok = req.params.sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(req.params.sig), Buffer.from(expected));
  const file = videoFile(req.params.id);
  if (!ok || !fs.existsSync(file)) return res.status(404).end();
  res.type('video/mp4').sendFile(file);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Production: serve the built web app with SPA fallback.
const dist = path.join(ROOT, 'web', 'dist');
if (config.isProd && fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Deliberate errors (HttpError, body-parser, upload limits) carry a user-facing message.
  const known = err instanceof HttpError || err.expose || err.code === 'LIMIT_FILE_SIZE';
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (!known) console.error(err);
  res.status(status).json({ error: known ? err.message : 'Something went wrong on our side.' });
});

app.listen(config.port, () => {
  const p = providerStatus();
  console.log(`Nrrtv API on http://localhost:${config.port}  (app: ${config.appUrl})`);
  console.log(`  scripts: ${p.script.provider}${p.script.model ? ` (${p.script.model})` : ''} · images: ${p.images.provider} · voice: ${p.voice.provider}`);
  resumePendingJobs();
  if (config.schedulerEnabled) startScheduler();
  // Warm the synthesised music beds in the background.
  (async () => {
    for (const id of MUSIC_IDS) await musicTrack(id).catch((e) => console.error('[music]', e.message));
  })();
});
