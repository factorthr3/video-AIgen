// Runs an ad set: write the copy (once), then render every ad (each video
// length in each format, plus the static variants). Rendering is CPU-bound,
// so one ad renders at a time across all jobs; copywriting overlaps.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from '../config.js';
import { db, insert, update, newId, now, parseJson } from '../db.js';
import { speak } from '../pipeline/tts.js';
import { musicTrack } from '../pipeline/music.js';
import { writeCopy, SCENES_FOR } from './brief.js';
import { renderVideoAd, renderStaticAd, buildAdAudio, loadLogo, END_CARD } from './render.js';
import { soundtrack, musicBrief } from './soundtrack.js';
import { motionEnabled, motionCandidates, motionAspects, animatePhotos } from './motion.js';

export const ADSETS_DIR = path.join(DATA_DIR, 'adsets');
export const adsetDir = (id) => path.join(ADSETS_DIR, id);
export const adFile = (ad) => path.join(adsetDir(ad.adset_id), `${ad.id}.${ad.kind === 'video' ? 'mp4' : 'jpg'}`);
export const adThumb = (ad) => path.join(adsetDir(ad.adset_id), `${ad.id}-thumb.jpg`);

const JOBS = Number(process.env.JOB_CONCURRENCY || 2);

/** A fingerprint of everything an ad is rendered from; it changes exactly when the ad would look or sound different. */
export function adSignature(copy, options, ad) {
  const parts = { style: options.style, cta: copy.cta, badge: copy.badge };
  if (ad.kind === 'image') parts.image = copy.statics?.[ad.variant] || copy.statics?.[0] || null;
  else {
    parts.video = copy.videos?.find((v) => v.length === ad.length) || null;
    parts.voice = options.voiceover ? options.voice : null;
    parts.music = options.music;
    if (options.music === 'ai') parts.soundtrack = musicBrief({ mood: options.musicMood, copyBrief: copy.music, style: options.style });
  }
  return crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

// ---------- one render at a time ----------
let renderFree = true;
const renderWaiters = [];
async function withRender(fn) {
  if (renderFree) renderFree = false;
  else await new Promise((resolve) => renderWaiters.push(resolve));
  try {
    return await fn();
  } finally {
    const next = renderWaiters.shift();
    if (next) next();
    else renderFree = true;
  }
}

// ---------- queue ----------
const queue = [];
let active = 0;

export function enqueueAdSet(id) {
  if (!queue.includes(id)) queue.push(id);
  pump();
}

function pump() {
  while (active < JOBS && queue.length) {
    const id = queue.shift();
    active++;
    runAdSet(id)
      .catch((err) => {
        console.error(`[ads] ad set ${id} failed:`, err);
        update('adsets', id, { status: 'failed', stage: null, error: String(err.message || err).slice(0, 400), updated_at: now() });
      })
      .finally(() => {
        active--;
        pump();
      });
  }
}

export function resumeAdSets() {
  const rows = db.all("SELECT id FROM adsets WHERE status IN ('queued', 'processing') ORDER BY created_at");
  for (const { id } of rows) enqueueAdSet(id);
  if (rows.length) console.log(`[ads] resumed ${rows.length} ad set(s)`);
}

/** Ads to make for these options (video lengths x formats, statics x formats). */
export function plannedAds(options) {
  const list = [];
  for (const length of options.lengths) for (const format of options.formats) list.push({ kind: 'video', format, length, variant: 0 });
  for (let v = 0; v < options.statics; v++) for (const format of options.formats) list.push({ kind: 'image', format, length: null, variant: v });
  return list;
}

function setStage(id, stage, progress) {
  update('adsets', id, { status: 'processing', stage, progress: Math.round(progress * 1000) / 1000, updated_at: now() });
}

// ---------- the job ----------
async function runAdSet(id) {
  const adset = db.get('SELECT * FROM adsets WHERE id = ?', id);
  if (!adset) return;
  const brand = db.get('SELECT * FROM brands WHERE id = ?', adset.brand_id);
  if (!brand) throw new Error('This brand was deleted.');
  const brief = parseJson(adset.brief, {});
  const options = parseJson(adset.options, {});
  const chosen = options.assetIds?.length
    ? db.all(`SELECT * FROM assets WHERE brand_id = ? AND status = 'ready' AND kind != 'logo' AND id IN (${options.assetIds.map(() => '?').join(',')})`, brand.id, ...options.assetIds)
    : db.all("SELECT * FROM assets WHERE brand_id = ? AND status = 'ready' AND kind != 'logo' ORDER BY created_at", brand.id);
  if (!chosen.length) throw new Error('Add at least one photo or video to this brand, then try again.');
  // Keep the order the client picked them in (the storyboard leans on it without Claude).
  if (options.assetIds?.length) chosen.sort((x, y) => options.assetIds.indexOf(x.id) - options.assetIds.indexOf(y.id));
  const assets = new Map(chosen.map((a) => [a.id, a]));
  const logoAsset = brand.logo_asset_id ? db.get('SELECT * FROM assets WHERE id = ?', brand.logo_asset_id) : null;
  fs.mkdirSync(adsetDir(id), { recursive: true });

  // 1. AI motion: no footage? Turn the best photos into short clips first (reused from the library when they exist).
  let copy = parseJson(adset.copy, null);
  let motionNote = null;
  if (!copy && options.motion && motionEnabled()) {
    const photos = motionCandidates(chosen);
    if (photos.length) {
      setStage(id, 'Bringing your photos to life', 0.02);
      const { clips, failed, total } = await animatePhotos({
        brand, brief, photos, aspects: motionAspects(options.formats),
        onProgress: (n, t) => setStage(id, `Bringing your photos to life (${n} of ${t} clips)`, 0.02 + 0.06 * (n / t)),
      });
      const fresh = clips.filter((c) => !assets.has(c.id));
      chosen.unshift(...fresh); // footage leads the storyboard
      for (const c of fresh) assets.set(c.id, c);
      if (fresh.length && options.assetIds?.length) {
        options.assetIds = [...fresh.map((c) => c.id), ...options.assetIds];
        update('adsets', id, { options: JSON.stringify(options) });
      }
      if (failed) motionNote = `${failed} of ${total} AI motion clips couldn't be made, so those scenes use your photos instead.`;
    }
  }
  // An AI clip exists in up to two orientations; storyboards use one and each format gets the best fit.
  const twins = new Map(); // photo id -> { '9:16': clip, '16:9': clip }
  for (const a of assets.values()) if (a.parent_id) twins.set(a.parent_id, { ...twins.get(a.parent_id), [a.motion_aspect]: a });
  const forFormat = (scenes, format) => scenes.map((sc) => {
    const a = assets.get(sc.assetId);
    const twin = a?.parent_id && twins.get(a.parent_id)?.[format === '16:9' ? '16:9' : '9:16'];
    return twin && twin.id !== a.id ? { ...sc, assetId: twin.id } : sc;
  });

  // 2. Copy and storyboard (kept across re-renders until "new copy").
  if (!copy) {
    setStage(id, 'Writing the copy', 0.08);
    const storyboardAssets = chosen.filter((a) => !a.parent_id || (twins.get(a.parent_id)['9:16'] || a) === a);
    copy = await writeCopy({ brand, brief, assets: storyboardAssets, lengths: options.lengths, statics: options.statics, voiceover: options.voiceover, language: options.language });
    if (motionNote) copy.motionNote = motionNote;
    update('adsets', id, { copy: JSON.stringify(copy) });
  }

  // 3. The ads to make.
  if (!db.get('SELECT 1 FROM ads WHERE adset_id = ? LIMIT 1', id)) {
    for (const p of plannedAds(options)) insert('ads', { id: newId('ad'), adset_id: id, ...p, status: 'queued', created_at: now() });
  }
  const todo = db.all("SELECT * FROM ads WHERE adset_id = ? AND status != 'ready' ORDER BY kind DESC, length, variant, format", id);
  const total = db.get('SELECT COUNT(*) AS n FROM ads WHERE adset_id = ?', id).n;
  const logo = await loadLogo(logoAsset);
  const bed = options.music === 'ai' ? null : await musicTrack(options.music);
  const audioFor = new Map(); // length -> { file, scenes } shared across formats
  let musicNote = null;

  let done = total - todo.length;
  const progress = (extra = 0) => 0.1 + 0.9 * ((done + extra) / total);
  for (const ad of todo) {
    setStage(id, ad.kind === 'video' ? `Rendering the ${ad.length}s ${ad.format} video` : `Designing the ${ad.format} image ad`, progress());
    update('ads', ad.id, { status: 'processing', error: null, updated_at: now() });
    try {
      if (ad.kind === 'video') {
        const video = copy.videos.find((v) => v.length === ad.length);
        if (!video) throw new Error(`No ${ad.length}s storyboard.`);
        if (!audioFor.has(ad.length)) {
          setStage(id, options.music === 'ai' ? `Composing the ${ad.length}s soundtrack` : `Preparing the ${ad.length}s video`, progress());
          const prepared = await prepareTimeline({ id, copy, video, options, bed });
          if (prepared.musicNote) musicNote = prepared.musicNote;
          audioFor.set(ad.length, prepared);
        }
        const { scenes, audio, endCard } = audioFor.get(ad.length);
        await withRender(() => renderVideoAd({
          brand, logo, assets, scenes: forFormat(scenes, ad.format), endCard, copy, format: ad.format, style: options.style, url: brief.url,
          audioFile: audio, out: adFile(ad), thumbOut: adThumb(ad),
          onProgress: (p) => setStage(id, `Rendering the ${ad.length}s ${ad.format} video`, progress(p)),
        }));
        update('ads', ad.id, { status: 'ready', duration: scenes.reduce((s, x) => s + x.duration, 0) + endCard, rendered_sig: adSignature(copy, options, ad), updated_at: now() });
      } else {
        const variant = copy.statics[ad.variant] || copy.statics[0];
        await withRender(() => renderStaticAd({
          brand, logo, asset: assets.get(variant?.assetId) || chosen[0], headline: variant?.headline || brief.product, subline: variant?.subline || '',
          copy, format: ad.format, style: options.style, out: adFile(ad), thumbOut: adThumb(ad),
        }));
        update('ads', ad.id, { status: 'ready', rendered_sig: adSignature(copy, options, ad), updated_at: now() });
      }
    } catch (err) {
      console.error(`[ads] ${ad.id} failed:`, err.message);
      update('ads', ad.id, { status: 'failed', error: String(err.message).slice(0, 300), updated_at: now() });
    }
    done++;
  }
  for (const a of audioFor.values()) fs.rmSync(a.audio, { force: true });
  // Tell the client if the composed soundtrack couldn't be made this time.
  if (options.music === 'ai' && audioFor.size) {
    const latest = parseJson(db.get('SELECT copy FROM adsets WHERE id = ?', id).copy, {});
    update('adsets', id, { copy: JSON.stringify({ ...latest, musicNote }) });
  }
  const failed = db.get("SELECT COUNT(*) AS n FROM ads WHERE adset_id = ? AND status = 'failed'", id).n;
  update('adsets', id, {
    status: failed === total ? 'failed' : 'ready', stage: null, progress: 1,
    error: failed ? `${failed} of ${total} ads couldn't be made.` : null, updated_at: now(),
  });
}

// Scene timings for one video length (from the voiceover when there is one) and its audio.
async function prepareTimeline({ id, copy, video, options, bed }) {
  const dir = adsetDir(id);
  const endCard = END_CARD[video.length] || 2.4;
  let scenes;
  const voices = [];
  if (options.voiceover) {
    let t = 0;
    scenes = [];
    for (const sc of video.scenes) {
      let duration = Math.max(1.6, (video.length - endCard) / video.scenes.length);
      if (sc.voiceover) {
        const key = crypto.createHash('sha1').update(JSON.stringify([options.voice, options.language, sc.voiceover])).digest('hex').slice(0, 14);
        const base = path.join(dir, `voice-${key}`);
        const v = fs.existsSync(`${base}.wav`) && fs.existsSync(`${base}.json`)
          ? { file: `${base}.wav`, ...JSON.parse(fs.readFileSync(`${base}.json`, 'utf8')) }
          : await speak({ text: sc.voiceover, voiceId: options.voice, language: options.language, outBase: base });
        if (!v.error && !fs.existsSync(`${base}.json`)) fs.writeFileSync(`${base}.json`, JSON.stringify({ duration: v.duration }));
        voices.push({ file: v.file, start: t + 0.15 });
        duration = Math.max(1.4, v.duration + 0.45);
      }
      scenes.push({ ...sc, duration });
      t += duration;
    }
  } else {
    const each = Math.max(1.2, (video.length - endCard) / video.scenes.length);
    scenes = video.scenes.map((sc) => ({ ...sc, duration: each }));
  }
  const total = scenes.reduce((s, x) => s + x.duration, 0) + endCard;
  // A soundtrack composed to this exact length, or the chosen music bed.
  let music = bed;
  let musicNote = null;
  let fade = 1.2;
  if (options.music === 'ai') {
    // Each ad set keeps the track each video length was made with, so re-rendering
    // with the same music settings and timing plays exactly the same soundtrack.
    const brief = musicBrief({ mood: options.musicMood, copyBrief: copy.music, style: options.style });
    const key = JSON.stringify([brief, Math.round(total * 100)]);
    const metaFile = path.join(dir, `soundtrack-${video.length}.json`);
    const kept = fs.existsSync(metaFile) ? parseJson(fs.readFileSync(metaFile, 'utf8'), null) : null;
    if (kept?.key === key && fs.existsSync(path.join(dir, kept.file))) {
      music = path.join(dir, kept.file);
      fade = 0.4;
    } else {
      try {
        const composed = await soundtrack({ brief, seconds: total });
        fade = 0.4; // composed to end on time
        const file = `soundtrack-${video.length}${path.extname(composed)}`;
        fs.copyFileSync(composed, path.join(dir, file));
        fs.writeFileSync(metaFile, JSON.stringify({ key, file }));
        music = path.join(dir, file);
      } catch (err) {
        console.error('[ads] soundtrack failed:', err.message);
        musicNote = /paid|subscription|plan|permission|401|403/i.test(err.message)
          ? 'The AI soundtrack needs a paid ElevenLabs plan with Music access, so a standard music bed was used.'
          : 'The AI soundtrack could not be composed this time, so a standard music bed was used. Generate again to try again.';
        music = await musicTrack('bright-pluck');
      }
    }
  }
  const audio = path.join(dir, `audio-${video.length}-${crypto.randomBytes(3).toString('hex')}.m4a`);
  await buildAdAudio({ duration: total, music, voices, fade, out: audio });
  return { scenes, audio, endCard, musicNote };
}

export { SCENES_FOR };
