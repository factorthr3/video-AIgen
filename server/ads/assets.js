// Brand assets: product photos, videos and logos. Each upload is normalised
// once (images up to 2400px, videos to 1080p/30fps H.264 without audio), gets
// a thumbnail, and is read by Claude (what it shows, how good it is, and where
// the subject sits) so ads can pick the right shots and crop every format
// around the product.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { config, DATA_DIR } from '../config.js';
import { db, insert, update, newId, now, parseJson } from '../db.js';
import { ffmpeg, run } from '../pipeline/ffmpeg.js';
import { rgbToHex } from './design.js';

export const ASSETS_DIR = path.join(DATA_DIR, 'assets');
export const ASSETS_INCOMING = path.join(ASSETS_DIR, 'incoming');
fs.mkdirSync(ASSETS_INCOMING, { recursive: true });

const MAX_IMAGE = 2400;
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

export const assetFile = (a) => path.join(ASSETS_DIR, `${a.id}.${a.kind === 'video' ? 'mp4' : a.has_alpha ? 'png' : 'jpg'}`);
export const assetThumb = (a) => path.join(ASSETS_DIR, `${a.id}-thumb.${a.has_alpha ? 'png' : 'jpg'}`);

export function publicAsset(a) {
  const analysis = parseJson(a.analysis, null);
  return {
    id: a.id,
    brandId: a.brand_id,
    kind: a.kind,
    name: a.original_name,
    status: a.status,
    error: a.error,
    width: a.width,
    height: a.height,
    duration: a.duration,
    transparent: Boolean(a.has_alpha),
    description: analysis?.description || null,
    category: analysis?.category || null,
    quality: analysis?.quality || null,
    createdAt: a.created_at,
  };
}

export const brandAssets = (brandId) => db.all("SELECT * FROM assets WHERE brand_id = ? AND kind != 'logo' ORDER BY created_at DESC", brandId);

// ---------- uploads ----------
export function addAsset(user, brand, file, { logo = false } = {}) {
  const video = /^video\//.test(file.mimetype) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.originalname);
  if (logo && video) {
    fs.rmSync(file.path, { force: true });
    throw httpError(400, 'Upload your logo as an image (PNG or SVG with a transparent background works best).');
  }
  const asset = insert('assets', {
    id: newId('as'),
    user_id: user.id,
    brand_id: brand.id,
    kind: logo ? 'logo' : video ? 'video' : 'image',
    original_name: String(file.originalname || 'asset').slice(0, 120),
    source: file.path,
    status: 'processing',
    created_at: now(),
  });
  enqueue(asset.id);
  return asset;
}

export function removeAsset(asset) {
  db.run('DELETE FROM assets WHERE id = ?', asset.id);
  for (const f of [assetFile(asset), assetThumb(asset), asset.source]) if (f) fs.rmSync(f, { force: true });
  if (asset.kind === 'logo') db.run('UPDATE brands SET logo_asset_id = NULL WHERE logo_asset_id = ?', asset.id);
}

/** Files of every asset of a brand (for deleting a brand or an account). */
export function removeBrandAssetFiles(brandId) {
  for (const a of db.all('SELECT * FROM assets WHERE brand_id = ?', brandId)) {
    for (const f of [assetFile(a), assetThumb(a), a.source]) if (f) fs.rmSync(f, { force: true });
  }
}

// ---------- processing (one at a time; renders keep the CPU) ----------
const pending = [];
let busy = false;

function enqueue(id) {
  if (!pending.includes(id)) pending.push(id);
  if (!busy) next();
}

async function next() {
  const id = pending.shift();
  if (!id) {
    busy = false;
    return;
  }
  busy = true;
  try {
    await processAsset(id);
  } catch (err) {
    console.error(`[assets] ${id} failed:`, err.message);
    update('assets', id, { status: 'failed', error: "This file couldn't be read. Try a JPG, PNG or MP4." });
  }
  next();
}

async function probeVideo(file) {
  const out = JSON.parse(await run(config.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]));
  const stream = out.streams?.[0];
  const duration = parseFloat(out.format?.duration);
  if (!stream?.width || !Number.isFinite(duration)) throw new Error('no video stream');
  return { width: stream.width, height: stream.height, duration };
}

/**
 * Letterbox or pillarbox bars baked into a video, as an ffmpeg crop filter
 * (or null). Only even bars on one axis count, so dark footage isn't cropped.
 */
function detectBars(file, { width: W, height: H, duration }) {
  return new Promise((resolve) => {
    const proc = spawn(config.ffmpeg, [
      '-hide_banner', '-ss', String(Math.min(duration * 0.1, 2)), '-i', file, '-t', String(Math.min(5, duration)),
      '-an', '-vf', 'cropdetect=limit=24:round=2:reset=0', '-f', 'null', '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let log = '';
    proc.stderr.on('data', (d) => { log += d; });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const m = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].at(-1);
      if (!m) return resolve(null);
      const [w, h, x, y] = m.slice(1).map(Number);
      const letterbox = w >= W - 4 && h < H * 0.97 && h > H * 0.4 && Math.abs(H - h - 2 * y) <= 6;
      const pillarbox = h >= H - 4 && w < W * 0.97 && w > W * 0.4 && Math.abs(W - w - 2 * x) <= 6;
      resolve(letterbox || pillarbox ? `crop=${w}:${h}:${x}:${y},` : null);
    });
  });
}

async function decodeImage(file) {
  try {
    return await loadImage(fs.readFileSync(file));
  } catch {
    // Formats the canvas can't read (e.g. TIFF, BMP): convert with ffmpeg first.
    const png = `${file}.png`;
    await ffmpeg(['-i', file, '-frames:v', '1', png]);
    try {
      return await loadImage(fs.readFileSync(png));
    } finally {
      fs.rmSync(png, { force: true });
    }
  }
}

function hasTransparency(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4 * 7) if (data[i] < 250) return true;
  return false;
}

async function processAsset(id) {
  const asset = db.get('SELECT * FROM assets WHERE id = ?', id);
  if (!asset || asset.status !== 'processing') return;
  if (asset.kind === 'video') {
    const src = await probeVideo(asset.source);
    if (src.duration < 1) throw new Error('too short');
    const out = assetFile(asset);
    const bars = (await detectBars(asset.source, src)) || '';
    await ffmpeg([
      '-i', asset.source, '-an',
      '-vf', `${bars}scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', `${out}.part.mp4`,
    ]);
    fs.renameSync(`${out}.part.mp4`, out);
    const info = await probeVideo(out);
    await ffmpeg(['-ss', String(Math.min(1, info.duration / 3)), '-i', out, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', assetThumb(asset)]);
    fs.rmSync(asset.source, { force: true });
    update('assets', id, { status: 'ready', source: null, width: info.width, height: info.height, duration: Math.round(info.duration * 100) / 100 });
  } else {
    const img = await decodeImage(asset.source);
    const scale = Math.min(1, MAX_IMAGE / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const alpha = hasTransparency(ctx, w, h);
    const done = { ...asset, has_alpha: alpha ? 1 : 0 };
    fs.writeFileSync(assetFile(done), alpha ? await canvas.encode('png') : await canvas.encode('jpeg', 92));
    const tw = Math.min(480, w);
    const thumb = createCanvas(tw, Math.round((h * tw) / w));
    thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
    fs.writeFileSync(assetThumb(done), alpha ? await thumb.encode('png') : await thumb.encode('jpeg', 82));
    fs.rmSync(asset.source, { force: true });
    update('assets', id, { status: 'ready', source: null, width: w, height: h, has_alpha: alpha ? 1 : 0 });
    if (asset.kind === 'logo') setBrandColorsFromLogo(asset.brand_id, ctx, w, h);
  }
  // Claude's read of the asset is a bonus: ads still work without it.
  await analyzeAsset(id).catch((err) => console.error(`[assets] analysis of ${id} failed:`, err.message));
}

/** Restart processing interrupted by a restart; drop orphaned uploads. */
export function resumeAssetProcessing() {
  for (const a of db.all("SELECT id, source FROM assets WHERE status = 'processing'")) {
    if (a.source && fs.existsSync(a.source)) enqueue(a.id);
    else update('assets', a.id, { status: 'failed', error: 'The upload was interrupted. Please upload it again.' });
  }
  const known = new Set(db.all('SELECT source FROM assets WHERE source IS NOT NULL').map((r) => r.source));
  for (const f of fs.readdirSync(ASSETS_INCOMING)) {
    const full = path.join(ASSETS_INCOMING, f);
    if (!known.has(full)) fs.rmSync(full, { force: true });
  }
}

// ---------- brand colours from the logo ----------
// Quantise opaque, saturated pixels and keep the most common distinct colours.
export function extractColors(ctx, w, h, max = 3) {
  const data = ctx.getImageData(0, 0, w, h).data;
  const buckets = new Map();
  const step = Math.max(1, Math.floor((w * h) / 40000)) * 4;
  for (let i = 0; i < data.length; i += step) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    if (hi > 240 && lo > 225) continue; // near white (usually background)
    const sat = hi === 0 ? 0 : (hi - lo) / hi;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0, weight: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n++;
    bucket.weight += 0.35 + sat; // favour colourful pixels over greys
    buckets.set(key, bucket);
  }
  const picked = [];
  for (const b of [...buckets.values()].sort((x, y) => y.weight - x.weight)) {
    const c = [b.r / b.n, b.g / b.n, b.b / b.n];
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 70)) picked.push(c);
    if (picked.length >= max) break;
  }
  return picked.map(rgbToHex);
}

function setBrandColorsFromLogo(brandId, ctx, w, h) {
  const brand = db.get('SELECT colors FROM brands WHERE id = ?', brandId);
  // Only fill in colours the owner hasn't chosen.
  if (brand && !parseJson(brand.colors, []).length) {
    const colors = extractColors(ctx, w, h);
    if (colors.length) update('brands', brandId, { colors: JSON.stringify(colors) });
  }
}

// ---------- Claude's read of an asset ----------
const AnalysisSchema = z.object({
  description: z.string().describe('One sentence describing what is shown, focused on the product or brand (no opinions).'),
  category: z.enum(['product', 'lifestyle', 'people', 'detail', 'logo', 'graphic', 'other']).describe('product = the product itself is the hero; lifestyle = product in use or in a setting; people = people are the focus; detail = close-up texture or feature; graphic = designed artwork or screenshot'),
  subject: z.object({
    x: z.number().describe('Left edge of the main subject, 0 to 1 of the image width'),
    y: z.number().describe('Top edge, 0 to 1 of the image height'),
    width: z.number().describe('Width as a fraction of the image width'),
    height: z.number().describe('Height as a fraction of the image height'),
  }).describe('Bounding box of the main subject (the product, or the key person/object). Generous rather than tight.'),
  quality: z.number().describe('1 to 5: how well this works in a professional ad (5 = hero shot: sharp, well lit, clean composition; 1 = blurry, dark or cluttered)'),
  hasText: z.boolean().describe('True if the image has prominent text or a design baked in'),
});

let client;
const claude = () => (client ??= new Anthropic());

async function imageForClaude(file, maxSide = 1024) {
  const img = await loadImage(fs.readFileSync(file));
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; // flatten transparency
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: (await c.encode('jpeg', 80)).toString('base64') } };
}

async function videoFrames(file, duration) {
  const frames = [];
  for (const at of [0.15, 0.5, 0.85]) {
    const out = `${file}.frame${at}.jpg`;
    await ffmpeg(['-ss', (duration * at).toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=768:-2', '-q:v', '4', out]);
    try {
      frames.push(await imageForClaude(out, 768));
    } finally {
      fs.rmSync(out, { force: true });
    }
  }
  return frames;
}

export async function analyzeAsset(id) {
  if (!config.anthropic.enabled) return;
  const asset = db.get('SELECT * FROM assets WHERE id = ?', id);
  if (!asset || asset.status !== 'ready') return;
  const video = asset.kind === 'video';
  const images = video ? await videoFrames(assetFile(asset), asset.duration) : [await imageForClaude(assetFile(asset))];
  const params = {
    model: config.anthropic.model,
    max_tokens: 2000,
    system: 'You are the art director of an advertising studio. You review brand assets a client uploaded so the best ones can be used in social media ads.',
    messages: [{
      role: 'user',
      content: [
        ...images,
        { type: 'text', text: video
          ? `These are three frames (start, middle, end) from a ${Math.round(asset.duration)}-second video the brand uploaded. Describe the clip, and give the subject's bounding box in the middle frame.`
          : `This is ${asset.kind === 'logo' ? 'the brand\'s logo' : 'an image the brand uploaded'}. Review it.` },
      ],
    }],
    output_config: { format: betaZodOutputFormat(AnalysisSchema) },
  };
  if (/^claude-(opus|fable)-5/.test(config.anthropic.model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  const response = await claude().beta.messages.parse(params);
  const a = response.parsed_output;
  if (!a) return;
  const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const box = { x: clamp(a.subject.x), y: clamp(a.subject.y), width: clamp(a.subject.width), height: clamp(a.subject.height) };
  if (box.width < 0.05 || box.height < 0.05) Object.assign(box, { x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
  update('assets', id, {
    analysis: JSON.stringify({ ...a, subject: box, quality: Math.max(1, Math.min(5, Math.round(Number(a.quality) || 3))) }),
  });
}

// ---------- cropping ----------
/**
 * The source rectangle to show `asset` at `aspect` (w/h): as large as
 * possible, centred on the subject, and never cutting into it when avoidable.
 */
export function cropFor(asset, aspect) {
  const W = asset.width;
  const H = asset.height;
  // Without Claude's read, lean towards the upper middle, where faces and products usually sit.
  const subject = parseJson(asset.analysis, null)?.subject || { x: 0.25, y: 0.15, width: 0.5, height: 0.5 };
  let sw = W;
  let sh = W / aspect;
  if (sh > H) {
    sh = H;
    sw = H * aspect;
  }
  const cx = (subject.x + subject.width / 2) * W;
  const cy = (subject.y + subject.height / 2) * H;
  const sx = Math.max(0, Math.min(W - sw, cx - sw / 2));
  const sy = Math.max(0, Math.min(H - sh, cy - sh / 2));
  return { sx, sy, sw, sh, subject };
}
