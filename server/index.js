import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { config, providerStatus, ROOT, UPLOAD_DIR } from './config.js';
import { catalog, PLAN, VOICE, LANGUAGE } from './catalog.js';
import { db, update } from './db.js';
import { requireAuth, publicUser, destroySession } from './auth.js';
import { HttpError, usage } from './services.js';
import { resumePendingJobs, queueDepth, videoFile, videoDir } from './pipeline/index.js';
import { musicTrack, MUSIC_IDS } from './pipeline/music.js';
import { voicePreview } from './pipeline/tts.js';
import { publicMediaSig } from './social/index.js';
import {
  provider as billingProvider, testMode, isAdmin, billingInfo, displayPlans, choosePlan, portalUrl, cancelPlan, cancelSubscriptionNow,
  handleStripeWebhook, handlePaystackWebhook, confirmPaystackReturn, paystackEnabled, warmUp as warmUpBilling,
} from './billing/index.js';
import { startScheduler } from './scheduler.js';
import authRoutes from './routes/auth.js';
import seriesRoutes from './routes/series.js';
import videoRoutes from './routes/videos.js';
import accountRoutes from './routes/accounts.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// Webhooks are verified against the raw body, so they come before the JSON parser.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const type = await handleStripeWebhook(req.body, req.headers['stripe-signature']);
  res.json({ received: true, type });
});
app.post('/api/paystack/webhook', express.raw({ type: () => true }), async (req, res) => {
  const event = await handlePaystackWebhook(req.body, req.headers['x-paystack-signature']);
  res.json({ received: true, event });
});

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, queue: queueDepth() }));
app.get('/api/catalog', (req, res) => res.json({ ...catalog(), plans: displayPlans(), providers: { ...providerStatus(), billing: billingInfo() } }));

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

// Plans. With payments on: subscribe via hosted checkout ({ url }) or switch
// an existing subscription. Admins (outside test mode), and dev/DEMO_BILLING
// without payments, switch instantly.
app.post('/api/billing/plan', requireAuth, async (req, res) => {
  const plan = PLAN[req.body?.plan];
  if (!plan) throw new HttpError(400, 'Unknown plan.');
  const instant = billingProvider() ? isAdmin(req.user) && !testMode() : config.demoBilling;
  if (!instant) {
    if (!billingProvider()) throw new HttpError(501, 'Paid plans are not available yet: payments have not been set up on this server.');
    const result = await choosePlan(req.user, plan.id);
    if (result.url) return res.json({ url: result.url });
  } else {
    update('users', req.user.id, { plan: plan.id });
  }
  const user = db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  res.json({ user: publicUser(user), usage: usage(user) });
});

// The processor's hosted page to update the card (Stripe: also invoices and cancelling).
app.post('/api/billing/portal', requireAuth, async (req, res) => {
  if (!billingProvider()) throw new HttpError(501, 'Billing is not set up on this server.');
  res.json({ url: await portalUrl(req.user) });
});

// Stop renewing; the plan runs to the end of the paid period.
app.post('/api/billing/cancel', requireAuth, async (req, res) => {
  if (!billingProvider()) throw new HttpError(501, 'Billing is not set up on this server.');
  await cancelPlan(req.user);
  const user = db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  res.json({ user: publicUser(user), usage: usage(user) });
});

// Paystack sends the customer back here after checkout.
app.get('/api/paystack/return', async (req, res) => {
  const reference = String(req.query.reference || req.query.trxref || '');
  let outcome = 'failed';
  if (paystackEnabled() && reference) {
    try {
      outcome = (await confirmPaystackReturn(reference)).ok ? 'success' : 'failed';
    } catch (err) {
      console.error('[paystack] return:', err.message);
      outcome = 'error';
    }
  }
  res.redirect(`/app/billing?checkout=${outcome}`);
});

// Close the account: stop billing, delete content and personal data.
app.delete('/api/account', requireAuth, async (req, res) => {
  if (req.body?.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
  await cancelSubscriptionNow(req.user);
  const videoIds = db.all('SELECT id FROM videos WHERE user_id = ?', req.user.id).map((v) => v.id);
  db.run('DELETE FROM users WHERE id = ?', req.user.id); // cascades to sessions, series, videos, accounts, posts
  for (const id of videoIds) fs.rmSync(videoDir(id), { recursive: true, force: true });
  destroySession(req, res);
  res.json({ ok: true });
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
  console.log(`BlackCell API on http://localhost:${config.port}  (app: ${config.appUrl})`);
  console.log(`  scripts: ${p.script.provider}${p.script.model ? ` (${p.script.model})` : ''} · images: ${p.images.provider} · voice: ${p.voice.provider}`);
  console.log(`  payments: ${billingProvider() ? `${billingProvider()}${testMode() ? ' (test mode)' : ''}` : 'off'}`);
  warmUpBilling();
  resumePendingJobs();
  if (config.schedulerEnabled) startScheduler();
  // Warm the synthesised music beds in the background.
  (async () => {
    for (const id of MUSIC_IDS) await musicTrack(id).catch((e) => console.error('[music]', e.message));
  })();
});
