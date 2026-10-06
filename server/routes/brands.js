// Brands (name, colours, font, logo) and their assets.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { db, insert, update, newId, now, parseJson } from '../db.js';
import { requireAuth } from '../auth.js';
import { PLAN } from '../catalog.js';
import { BRAND_FONT, hexToRgb } from '../ads/design.js';
import { HttpError, usage, NEEDS_PLAN_MESSAGE } from '../services.js';
import { ASSETS_INCOMING, addAsset, removeAsset, removeBrandAssetFiles, publicAsset, brandAssets, assetFile, assetThumb } from '../ads/assets.js';
import { adsetDir, publicAdSetSummary } from './adsets.js';

export const MAX_ASSET_MB = 500;

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.diskStorage({
    destination: ASSETS_INCOMING,
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase().slice(0, 6)}`),
  }),
  limits: { fileSize: MAX_ASSET_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^(image|video)\//.test(file.mimetype) || /\.(jpe?g|png|webp|gif|svg|avif|mp4|mov|m4v|webm)$/i.test(file.originalname)),
});

export function publicBrand(b) {
  const logo = b.logo_asset_id ? db.get('SELECT * FROM assets WHERE id = ?', b.logo_asset_id) : null;
  return {
    id: b.id,
    name: b.name,
    website: b.website,
    about: b.about,
    tone: b.tone,
    colors: parseJson(b.colors, []),
    font: b.font,
    logo: logo ? publicAsset(logo) : null,
    createdAt: b.created_at,
  };
}

function owned(req, id = req.params.id) {
  const b = db.get('SELECT * FROM brands WHERE id = ? AND user_id = ?', id, req.user.id);
  if (!b) throw new HttpError(404, 'Brand not found.');
  return b;
}

function cleanBrand(body, base = {}) {
  const text = (v, max, fallback) => (v === undefined ? fallback : String(v || '').trim().slice(0, max) || null);
  const name = text(body.name, 80, base.name);
  if (!name) throw new HttpError(400, 'Give the brand a name.');
  const colors = Array.isArray(body.colors)
    ? body.colors.map((c) => String(c).trim().toLowerCase()).filter((c) => hexToRgb(c)).slice(0, 3)
    : parseJson(base.colors, []);
  return {
    name,
    website: text(body.website, 200, base.website ?? null),
    about: text(body.about, 1000, base.about ?? null),
    tone: text(body.tone, 200, base.tone ?? null),
    colors: JSON.stringify(colors),
    font: BRAND_FONT[body.font] ? body.font : base.font || 'montserrat',
  };
}

router.get('/', (req, res) => {
  const rows = db.all('SELECT * FROM brands WHERE user_id = ? ORDER BY created_at', req.user.id);
  res.json({
    brands: rows.map((b) => ({
      ...publicBrand(b),
      assets: db.get("SELECT COUNT(*) AS n FROM assets WHERE brand_id = ? AND kind != 'logo'", b.id).n,
      adsets: db.get('SELECT COUNT(*) AS n FROM adsets WHERE brand_id = ?', b.id).n,
    })),
  });
});

router.post('/', (req, res) => {
  const u = usage(req.user);
  if (u.needsPlan) throw new HttpError(402, NEEDS_PLAN_MESSAGE);
  if (u.brandsUsed >= u.brandsLimit) {
    throw new HttpError(402, `Your ${PLAN[u.plan].name} plan includes ${u.brandsLimit} brand${u.brandsLimit === 1 ? '' : 's'}. Upgrade to add more.`);
  }
  const brand = insert('brands', { id: newId('br'), user_id: req.user.id, ...cleanBrand(req.body || {}), created_at: now() });
  res.status(201).json({ brand: publicBrand(brand) });
});

router.get('/:id', (req, res) => {
  const b = owned(req);
  const adsets = db.all('SELECT * FROM adsets WHERE brand_id = ? ORDER BY created_at DESC', b.id);
  res.json({ brand: publicBrand(b), assets: brandAssets(b.id).map(publicAsset), adsets: adsets.map(publicAdSetSummary) });
});

router.patch('/:id', (req, res) => {
  const b = owned(req);
  update('brands', b.id, cleanBrand(req.body || {}, b));
  res.json({ brand: publicBrand(db.get('SELECT * FROM brands WHERE id = ?', b.id)) });
});

router.delete('/:id', (req, res) => {
  const b = owned(req);
  removeBrandAssetFiles(b.id);
  for (const a of db.all('SELECT id FROM adsets WHERE brand_id = ?', b.id)) fs.rmSync(adsetDir(a.id), { recursive: true, force: true });
  db.run('DELETE FROM brands WHERE id = ?', b.id); // cascades to assets, ad sets and ads
  res.json({ ok: true });
});

// The logo replaces any previous one; its colours fill in the brand palette if unset.
router.post('/:id/logo', upload.single('file'), (req, res) => {
  const b = owned(req);
  if (!req.file) throw new HttpError(400, 'Choose an image file for the logo.');
  const previous = b.logo_asset_id ? db.get('SELECT * FROM assets WHERE id = ?', b.logo_asset_id) : null;
  const logo = addAsset(req.user, b, req.file, { logo: true });
  update('brands', b.id, { logo_asset_id: logo.id });
  if (previous) removeAsset(previous);
  res.status(201).json({ brand: publicBrand(db.get('SELECT * FROM brands WHERE id = ?', b.id)) });
});

router.post('/:id/assets', upload.array('files', 20), (req, res) => {
  const b = owned(req);
  if (!req.files?.length) throw new HttpError(400, 'Choose photos or videos to upload.');
  const added = req.files.map((f) => addAsset(req.user, b, f));
  res.status(201).json({ assets: added.map(publicAsset) });
});

// ---------- assets (owner only) ----------
export const assetRoutes = Router();
assetRoutes.use(requireAuth);

const ownedAsset = (req) => {
  const a = db.get('SELECT * FROM assets WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!a) throw new HttpError(404, 'Asset not found.');
  return a;
};

assetRoutes.delete('/:id', (req, res) => {
  removeAsset(ownedAsset(req));
  res.json({ ok: true });
});

assetRoutes.get('/:id/thumb', (req, res) => {
  const a = ownedAsset(req);
  if (a.status !== 'ready') throw new HttpError(404, 'Not ready yet.');
  res.sendFile(assetThumb(a));
});

assetRoutes.get('/:id/file', (req, res) => {
  const a = ownedAsset(req);
  if (a.status !== 'ready') throw new HttpError(404, 'Not ready yet.');
  res.sendFile(assetFile(a));
});

export default router;
