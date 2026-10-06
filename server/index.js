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
import { musicTrack, MUSIC_IDS } from './pipeline/music.js';
import { voicePreview } from './pipeline/tts.js';
import { resumeAdSets, adsetDir } from './ads/jobs.js';
import { resumeAssetProcessing, removeBrandAssetFiles } from './ads/assets.js';
import {
  provider as billingProvider, testMode, isAdmin, billingInfo, displayPlans, choosePlan, portalUrl, cancelPlan, cancelSubscriptionNow,
  handleStripeWebhook, handlePaystackWebhook, confirmPaystackReturn, paystackEnabled, warmUp as warmUpBilling,
} from './billing/index.js';
import authRoutes from './routes/auth.js';
import brandRoutes, { assetRoutes } from './routes/brands.js';
import adsetRoutes, { adRoutes, shareRoutes } from './routes/adsets.js';

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

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/catalog', (req, res) => res.json({ ...catalog(), plans: displayPlans(), providers: { ...providerStatus(), billing: billingInfo() } }));

app.use('/api/auth', authRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/adsets', adsetRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/share', shareRoutes); // public: client review links

// Voiceover samples (cached per provider/voice/language).
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
  const brandIds = db.all('SELECT id FROM brands WHERE user_id = ?', req.user.id).map((b) => b.id);
  const adsetIds = db.all('SELECT id FROM adsets WHERE user_id = ?', req.user.id).map((a) => a.id);
  for (const id of brandIds) removeBrandAssetFiles(id);
  db.run('DELETE FROM users WHERE id = ?', req.user.id); // cascades to sessions, brands, assets, ad sets, ads
  for (const id of adsetIds) fs.rmSync(adsetDir(id), { recursive: true, force: true });
  destroySession(req, res);
  res.json({ ok: true });
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
  console.log(`  copy: ${p.copy.provider}${p.copy.model ? ` (${p.copy.model})` : ''} · voiceover: ${p.voice.provider}`);
  console.log(`  payments: ${billingProvider() ? `${billingProvider()}${testMode() ? ' (test mode)' : ''}` : 'off'}`);
  warmUpBilling();
  resumeAssetProcessing();
  resumeAdSets();
  // Warm the synthesised music beds in the background.
  (async () => {
    for (const id of MUSIC_IDS) await musicTrack(id).catch((e) => console.error('[music]', e.message));
  })();
});
