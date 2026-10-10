// Ad sets: one brief turned into ads in every format, plus the public share page.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Router } from 'express';
import { db, insert, update, newId, now, parseJson } from '../db.js';
import { requireAuth } from '../auth.js';
import { PLAN, VOICE, LANGUAGE, MUSIC_TRACK } from '../catalog.js';
import { STYLE, FORMATS, FORMAT_IDS, LENGTHS, cleanEndCard, cleanElements } from '../ads/design.js';
import { HttpError, usage, NEEDS_PLAN_MESSAGE } from '../services.js';
import { shotOf } from '../ads/brief.js';
import { enqueueAdSet, adsetDir, adFile, adThumb } from '../ads/jobs.js';
import { renderClosingPreview, loadLogo } from '../ads/render.js';
import { soundtrackEnabled, MUSIC_MOOD } from '../ads/soundtrack.js';
import { motionEnabled, filmedScenes } from '../ads/motion.js';
import { assetFile } from '../ads/assets.js';
import { reviseAdSet, undoRevision, revisionList, reviseEnabled, outdatedAds, generateAds } from '../ads/revise.js';
import { plainDashes } from '../text.js';

export { adsetDir };

const router = Router();
router.use(requireAuth);

// ---------- shapes ----------
const adName = (ad, brand, adset) => {
  const slug = (s) => String(s || '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const size = ad.format.replace(':', 'x');
  return `${slug(brand?.name)}-${slug(parseJson(adset.brief, {}).product)}-${ad.kind === 'video' ? `${ad.length}s` : `image${ad.variant + 1}`}-${size}.${ad.kind === 'video' ? 'mp4' : 'jpg'}`;
};

function publicAd(ad, base, outdated = false) {
  return {
    id: ad.id,
    kind: ad.kind,
    format: ad.format,
    length: ad.length,
    variant: ad.variant,
    status: ad.status,
    error: ad.error,
    duration: ad.duration,
    outdated: ad.status === 'ready' && outdated, // shows an older version until the next Generate
    platforms: FORMATS[ad.format]?.platforms || [],
    file: `${base}/${ad.id}/file?v=${encodeURIComponent(ad.updated_at || '')}`,
    thumb: `${base}/${ad.id}/thumb?v=${encodeURIComponent(ad.updated_at || '')}`,
    download: `${base}/${ad.id}/file?download=1`,
  };
}

export function publicAdSetSummary(a) {
  const counts = db.get("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready FROM ads WHERE adset_id = ?", a.id);
  const cover = db.get("SELECT id, updated_at FROM ads WHERE adset_id = ? AND status = 'ready' ORDER BY CASE format WHEN '9:16' THEN 0 WHEN '4:5' THEN 1 ELSE 2 END, kind DESC LIMIT 1", a.id);
  return {
    id: a.id,
    brandId: a.brand_id,
    name: a.name,
    status: a.status,
    stage: a.stage,
    progress: a.progress,
    error: a.error,
    ads: { total: counts.total || 0, ready: counts.ready || 0 },
    cover: cover ? `/api/ads/${cover.id}/thumb?v=${encodeURIComponent(cover.updated_at || '')}` : null,
    createdAt: a.created_at,
  };
}

function publicAdSet(a) {
  const brand = db.get('SELECT id, name FROM brands WHERE id = ?', a.brand_id);
  const ads = db.all('SELECT * FROM ads WHERE adset_id = ? ORDER BY kind DESC, length, variant, format', a.id);
  const outdated = outdatedAds(a);
  return {
    ...publicAdSetSummary(a),
    brand,
    brief: parseJson(a.brief, {}),
    options: parseJson(a.options, {}),
    copy: parseJson(a.copy, null),
    items: ads.map((ad) => publicAd(ad, '/api/ads', outdated.has(ad.id))),
    pending: ['queued', 'processing'].includes(a.status) ? 0 : outdated.size, // ads Generate would make
    share: a.share_token ? { token: a.share_token, path: `/share/${a.share_token}` } : null,
    revisions: revisionList(a),
    filmed: filmedScenes(a), // AI-directed: each scene's filmed clip (asset id), by video length
    elements: cleanElements(parseJson(a.options, {}).elements), // every video element, defaults filled in
  };
}

const owned = (req, id = req.params.id) => {
  const a = db.get('SELECT * FROM adsets WHERE id = ? AND user_id = ?', id, req.user.id);
  if (!a) throw new HttpError(404, 'Ad set not found.');
  return a;
};

// ---------- input ----------
function cleanBrief(b = {}) {
  const text = (v, max) => plainDashes(String(v || '').trim()).slice(0, max);
  const brief = {
    product: text(b.product, 120),
    description: text(b.description, 2000),
    offer: text(b.offer, 120),
    cta: text(b.cta, 30),
    url: text(b.url, 200),
    audience: text(b.audience, 300),
  };
  if (!brief.product) throw new HttpError(400, 'Name the product or service the ads are for.');
  if (brief.description.length < 20) throw new HttpError(400, 'Describe the product in a sentence or two, so the copy can sell it.');
  return brief;
}

function cleanOptions(o = {}, brandId) {
  const formats = (Array.isArray(o.formats) ? o.formats : FORMAT_IDS).filter((f) => FORMATS[f]);
  const lengths = (Array.isArray(o.lengths) ? o.lengths : [15]).map(Number).filter((l) => LENGTHS.includes(l));
  const statics = Math.max(0, Math.min(3, Number(o.statics ?? 2) || 0));
  if (!formats.length) throw new HttpError(400, 'Choose at least one format.');
  if (!lengths.length && !statics) throw new HttpError(400, 'Choose a video length or image ads.');
  const assetIds = Array.isArray(o.assetIds)
    ? o.assetIds.filter((id) => db.get("SELECT 1 FROM assets WHERE id = ? AND brand_id = ? AND kind != 'logo'", id, brandId))
    : [];
  // 'ai' = a soundtrack composed for each video (ElevenLabs Music), the default when available.
  const fallbackMusic = soundtrackEnabled() ? 'ai' : 'bright-pluck';
  const music = typeof o.music === 'string' && o.music.startsWith('upload:') ? o.music
    : o.music === 'ai' ? fallbackMusic
      : MUSIC_TRACK[o.music] ? o.music : fallbackMusic;
  return {
    style: STYLE[o.style] ? o.style : 'clean',
    formats: FORMAT_IDS.filter((f) => formats.includes(f)),
    lengths: [...new Set(lengths)].sort((x, y) => x - y),
    statics,
    voiceover: Boolean(o.voiceover),
    voice: VOICE[o.voice] ? o.voice : 'nova',
    music,
    musicMood: MUSIC_MOOD[o.musicMood] ? o.musicMood : 'auto',
    motion: Boolean(o.motion) && motionEnabled(), // animate photos into clips with AI (older ad sets)
    aiScenes: Boolean(o.aiScenes) && lengths.length > 0 && motionEnabled(), // AI-directed scenes: a storyboard to review, then filmed
    language: LANGUAGE[o.language] ? o.language : 'en',
    assetIds,
  };
}

// ---------- routes ----------
router.get('/', (req, res) => {
  const rows = db.all('SELECT * FROM adsets WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', req.user.id);
  const brands = Object.fromEntries(db.all('SELECT id, name FROM brands WHERE user_id = ?', req.user.id).map((b) => [b.id, b.name]));
  res.json({ adsets: rows.map((a) => ({ ...publicAdSetSummary(a), brandName: brands[a.brand_id] || '' })) });
});

router.post('/', (req, res) => {
  const u = usage(req.user);
  if (u.needsPlan) throw new HttpError(402, NEEDS_PLAN_MESSAGE);
  if (u.adsetsUsed >= u.adsetsLimit) {
    throw new HttpError(402, `You've made all ${u.adsetsLimit} ad sets in your ${PLAN[u.plan].name} plan this month. Upgrade to make more.`);
  }
  const body = req.body || {};
  const brand = db.get('SELECT * FROM brands WHERE id = ? AND user_id = ?', body.brandId, req.user.id);
  if (!brand) throw new HttpError(400, 'Choose a brand.');
  if (!db.get("SELECT 1 FROM assets WHERE brand_id = ? AND kind != 'logo' AND status != 'failed' LIMIT 1", brand.id)) {
    throw new HttpError(400, 'Upload at least one product photo or video to this brand first.');
  }
  const brief = cleanBrief(body.brief);
  const options = cleanOptions(body.options, brand.id);
  const adset = insert('adsets', {
    id: newId('set'),
    user_id: req.user.id,
    brand_id: brand.id,
    name: String(body.name || '').trim().slice(0, 80) || brief.product,
    brief: JSON.stringify(brief),
    options: JSON.stringify(options),
    status: 'queued',
    stage: 'Queued',
    progress: 0,
    created_at: now(),
    updated_at: now(),
  });
  enqueueAdSet(adset.id);
  res.status(201).json({ adset: publicAdSet(adset) });
});

router.get('/:id', (req, res) => res.json({ adset: publicAdSet(owned(req)) }));

// Edit the copy (headlines, sublines, voiceover, CTA, badge, captions) before re-rendering.
router.patch('/:id/copy', (req, res) => {
  const a = owned(req);
  if (['queued', 'processing'].includes(a.status)) throw new HttpError(409, 'Wait for the ads to finish before editing.');
  const copy = parseJson(a.copy, null);
  if (!copy) throw new HttpError(409, 'There is no copy to edit yet.');
  const edit = req.body?.copy || {};
  const t = (v, fallback, max) => (typeof v === 'string' ? plainDashes(v.trim()).slice(0, max) : fallback);
  const newAssets = new Set(); // photos newly picked for scenes
  copy.cta = t(edit.cta, copy.cta, 24) || copy.cta;
  copy.badge = t(edit.badge, copy.badge, 14);
  copy.music = t(edit.music, copy.music || '', 300);
  if (Array.isArray(edit.videos)) {
    for (const v of copy.videos) {
      const ev = edit.videos.find((x) => Number(x.length) === v.length);
      if (!ev?.scenes) continue;
      v.scenes = v.scenes.map((sc, i) => {
        const e = ev.scenes[i] || {};
        const next = {
          ...sc,
          headline: t(e.headline, sc.headline, 80) || sc.headline,
          subline: t(e.subline, sc.subline, 120),
          voiceover: t(e.voiceover, sc.voiceover, 300),
        };
        // The shot to film with AI (any scene can have one; null shows its photo or clip as it is).
        if (e.shot === null) delete next.shot;
        else if (e.shot && typeof e.shot === 'object') {
          const shot = shotOf({ frame: t(e.shot.frame, '', 600), action: t(e.shot.action, '', 400) });
          if (shot) next.shot = shot;
          else delete next.shot;
        }
        if (e.assetId && e.assetId !== sc.assetId && db.get("SELECT 1 FROM assets WHERE id = ? AND brand_id = ? AND kind != 'logo' AND status = 'ready' AND shot_key IS NULL", e.assetId, a.brand_id)) {
          next.assetId = e.assetId;
          newAssets.add(e.assetId);
        }
        return next;
      });
    }
  }
  if (Array.isArray(edit.statics)) {
    copy.statics = copy.statics.map((s, i) => ({ ...s, headline: t(edit.statics[i]?.headline, s.headline, 80) || s.headline, subline: t(edit.statics[i]?.subline, s.subline, 140) }));
  }
  if (edit.captions && typeof edit.captions === 'object') {
    for (const k of Object.keys(copy.captions)) {
      if (k === 'hashtags') {
        if (Array.isArray(edit.captions.hashtags)) copy.captions.hashtags = edit.captions.hashtags.map((h) => String(h).replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 8);
      } else copy.captions[k] = t(edit.captions[k], copy.captions[k], 600);
    }
  }
  copy.edited = true;
  // The closing card's logo size and background (kept with the ad set's settings).
  const closing = cleanEndCard(req.body?.endCard);
  // Ad sets made from picked assets render only those, so add newly picked ones.
  const options = parseJson(a.options, {});
  if (newAssets.size && options.assetIds?.length) options.assetIds = [...new Set([...options.assetIds, ...newAssets])];
  options.aiScenes = motionEnabled() && copy.videos.some((v) => v.scenes.some((sc) => sc.shot)); // scenes with a shot are filmed on Generate
  if (closing) options.endCard = closing;
  // Every other video element (logo screens, text, colours, motion).
  if (req.body?.elements && typeof req.body.elements === 'object') options.elements = cleanElements(req.body.elements, cleanElements(options.elements));
  update('adsets', a.id, { copy: JSON.stringify(copy), options: JSON.stringify(options), updated_at: now() });
  res.json({ adset: publicAdSet(db.get('SELECT * FROM adsets WHERE id = ?', a.id)) });
});

// Generate: render the ads the latest changes affect (or all of them when everything is current).
// With newCopy, start over with fresh copy.
router.post(['/:id/generate', '/:id/rerender'], (req, res) => {
  const a = owned(req);
  if (['queued', 'processing'].includes(a.status)) throw new HttpError(409, 'These ads are already being made.');
  if (req.body?.newCopy) {
    db.run('DELETE FROM ads WHERE adset_id = ?', a.id);
    fs.rmSync(adsetDir(a.id), { recursive: true, force: true });
    update('adsets', a.id, { copy: null, status: 'queued', stage: 'Queued', progress: 0, error: null, updated_at: now() });
    enqueueAdSet(a.id);
  } else {
    generateAds(a);
  }
  res.json({ adset: publicAdSet(db.get('SELECT * FROM adsets WHERE id = ?', a.id)) });
});

// Ask for changes in plain words; Claude edits the copy and settings, then the changed ads re-render.
router.post('/:id/revise', async (req, res) => {
  const a = owned(req);
  if (['queued', 'processing'].includes(a.status)) throw new HttpError(409, 'Wait for these ads to finish, then ask for more changes.');
  if (!a.copy) throw new HttpError(409, 'These ads have no copy to change yet.');
  if (!reviseEnabled()) throw new HttpError(503, "The AI editor isn't available right now. You can still change the words with Edit copy.");
  if (usage(req.user).needsPlan) throw new HttpError(402, NEEDS_PLAN_MESSAGE);
  const request = plainDashes(String(req.body?.request || '').trim()).slice(0, 1000);
  if (request.length < 3) throw new HttpError(400, "Say what you'd like changed.");
  const result = await reviseAdSet(a, request);
  res.json({ ...result, adset: publicAdSet(db.get('SELECT * FROM adsets WHERE id = ?', a.id)) });
});

router.post('/:id/revisions/:revisionId/undo', (req, res) => {
  const a = owned(req);
  if (['queued', 'processing'].includes(a.status)) throw new HttpError(409, 'Wait for these ads to finish, then undo.');
  undoRevision(a, req.params.revisionId);
  res.json({ adset: publicAdSet(db.get('SELECT * FROM adsets WHERE id = ?', a.id)) });
});

// The closing scene with given settings, for the storyboard's live preview.
router.get('/:id/closing.png', async (req, res) => {
  const a = owned(req);
  const brand = db.get('SELECT * FROM brands WHERE id = ?', a.brand_id);
  const options = parseJson(a.options, {});
  const logoAsset = brand?.logo_asset_id ? db.get('SELECT * FROM assets WHERE id = ?', brand.logo_asset_id) : null;
  const png = await renderClosingPreview({
    brand, logo: await loadLogo(logoAsset), cta: parseJson(a.copy, {})?.cta || 'Learn more', url: parseJson(a.brief, {}).url,
    settings: cleanEndCard({ logoSize: req.query.logoSize, background: req.query.background }), style: options.style,
    elements: { ...cleanElements(options.elements), button: req.query.button !== '0', link: req.query.link !== '0' },
    format: options.formats?.includes('9:16') ? '9:16' : options.formats?.[0] || '9:16',
  });
  res.type('png').set('Cache-Control', 'private, max-age=300').send(png);
});

router.post('/:id/share', (req, res) => {
  const a = owned(req);
  const token = req.body?.enabled === false ? null : a.share_token || crypto.randomBytes(12).toString('base64url');
  update('adsets', a.id, { share_token: token });
  res.json({ adset: publicAdSet(db.get('SELECT * FROM adsets WHERE id = ?', a.id)) });
});

router.delete('/:id', (req, res) => {
  const a = owned(req);
  db.run('DELETE FROM adsets WHERE id = ?', a.id);
  fs.rmSync(adsetDir(a.id), { recursive: true, force: true });
  res.json({ ok: true });
});

// ---------- files ----------
function sendAd(res, ad, adset, { thumb, download }) {
  if (ad.status !== 'ready') throw new HttpError(404, 'This ad is not ready yet.');
  if (thumb) return res.sendFile(adThumb(ad));
  if (download) {
    const brand = db.get('SELECT name FROM brands WHERE id = ?', adset.brand_id);
    res.attachment(adName(ad, brand, adset));
  }
  res.sendFile(adFile(ad));
}

export const adRoutes = Router();
adRoutes.use(requireAuth);
const ownedAd = (req) => {
  const ad = db.get('SELECT ads.* FROM ads JOIN adsets ON adsets.id = ads.adset_id WHERE ads.id = ? AND adsets.user_id = ?', req.params.id, req.user.id);
  if (!ad) throw new HttpError(404, 'Ad not found.');
  return ad;
};
adRoutes.get('/:id/file', (req, res) => {
  const ad = ownedAd(req);
  sendAd(res, ad, db.get('SELECT * FROM adsets WHERE id = ?', ad.adset_id), { download: req.query.download === '1' });
});
adRoutes.get('/:id/thumb', (req, res) => {
  const ad = ownedAd(req);
  sendAd(res, ad, null, { thumb: true });
});

// ---------- public share page ----------
export const shareRoutes = Router();
const shared = (req) => {
  const a = /^[\w-]{10,40}$/.test(req.params.token) && db.get('SELECT * FROM adsets WHERE share_token = ?', req.params.token);
  if (!a) throw new HttpError(404, 'This link is no longer active.');
  return a;
};

shareRoutes.get('/:token', (req, res) => {
  const a = shared(req);
  const brand = db.get('SELECT * FROM brands WHERE id = ?', a.brand_id);
  const base = `/api/share/${req.params.token}/ads`;
  const ads = db.all("SELECT * FROM ads WHERE adset_id = ? AND status = 'ready' ORDER BY kind DESC, length, variant, format", a.id);
  const copy = parseJson(a.copy, null);
  res.json({
    brand: { name: brand?.name, colors: parseJson(brand?.colors, []), logo: brand?.logo_asset_id ? `/api/share/${req.params.token}/logo` : null },
    adset: { name: a.name, product: parseJson(a.brief, {}).product, status: a.status, createdAt: a.created_at, captions: copy?.captions || null, cta: copy?.cta || null },
    items: ads.map((ad) => publicAd(ad, base)),
  });
});

shareRoutes.get('/:token/logo', (req, res) => {
  const a = shared(req);
  const logo = db.get('SELECT assets.* FROM assets JOIN brands ON brands.logo_asset_id = assets.id WHERE brands.id = ?', a.brand_id);
  if (!logo || logo.status !== 'ready') throw new HttpError(404, 'No logo.');
  res.sendFile(assetFile(logo));
});

const sharedAd = (req) => {
  const a = shared(req);
  const ad = db.get('SELECT * FROM ads WHERE id = ? AND adset_id = ?', req.params.adId, a.id);
  if (!ad) throw new HttpError(404, 'Ad not found.');
  return { a, ad };
};
shareRoutes.get('/:token/ads/:adId/file', (req, res) => {
  const { a, ad } = sharedAd(req);
  sendAd(res, ad, a, { download: req.query.download === '1' });
});
shareRoutes.get('/:token/ads/:adId/thumb', (req, res) => {
  const { a, ad } = sharedAd(req);
  sendAd(res, ad, a, { thumb: true });
});

export default router;
