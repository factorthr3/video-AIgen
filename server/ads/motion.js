// AI motion: for brands without footage, an image-to-video model turns their
// product photos into short, subtle video clips (a slow camera move, light,
// steam, a little life) that the ads then use like uploaded footage. Seedance
// 1.5 Pro via fal.ai makes them (best value in our side-by-side tests), with
// Google Veo as the backup. Clips are saved to the brand's library, so later
// ad sets reuse them instead of making new ones.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from '../config.js';
import { db, newId, parseJson } from '../db.js';
import { ASSETS_INCOMING, assetFile, assetThumb, cropFor, addGeneratedClip, imageForClaude } from './assets.js';
import { claude, modelParams, SCENES_FOR } from './brief.js';
import { END_CARD } from './render.js';

export const motionEnabled = () => Boolean(config.fal.key || config.gemini.key);
export const MOTION_PHOTOS = 3; // photos animated per ad set, at most
const VEO_SECONDS = [4, 6, 8]; // the clip lengths Veo makes at 720p

/**
 * Clip length for social ads: just longer than the longest scene the videos
 * cut to (a cut every 2 to 4 seconds), so no unused footage is paid for.
 * 6s and 15s sets get 4-second clips; 30s sets get 5.
 */
export function clipSeconds(lengths) {
  const longest = Math.max(0, ...lengths.map((l) => (l - (END_CARD[l] || 2.4)) / (SCENES_FOR[l] || 4)));
  return Math.min(12, Math.max(4, Math.ceil(longest + 0.8)));
}
const FRAME = { '9:16': [720, 1280], '16:9': [1280, 720] };
const NEGATIVE = 'text, captions, subtitles, watermark, changed or warped label, distorted logo, morphing, melting, objects appearing or disappearing, deformed hands, extra fingers, cartoon, CGI look, low quality, blur, flicker, cuts';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Clip orientations an ad set needs: vertical for 9:16, 4:5 and 1:1; landscape for 16:9. */
export function motionAspects(formats) {
  const out = [];
  if (formats.some((f) => f !== '16:9')) out.push('9:16');
  if (formats.includes('16:9')) out.push('16:9');
  return out;
}

/** Photos worth animating, best first: real photos, not cut-outs, graphics or images with text baked in. */
export function motionCandidates(assets) {
  return assets
    .map((a, i) => ({ a, i, an: parseJson(a.analysis, null) }))
    .filter(({ a, an }) => a.kind === 'image' && !a.has_alpha && !a.parent_id && !an?.hasText && !['graphic', 'logo'].includes(an?.category))
    .sort((x, y) => (y.an?.quality || 3) - (x.an?.quality || 3) || x.i - y.i)
    .slice(0, MOTION_PHOTOS)
    .map(({ a }) => a);
}

// ---------- shot descriptions ----------
const ShotSchema = z.object({
  shots: z.array(z.object({
    assetId: z.string(),
    prompt: z.string().describe('The shot description for the video model, 2 to 3 sentences'),
  })),
});

const DIRECTOR = `You are the director of photography on a premium product commercial for social media. Each photo will become one short shot (about 4 seconds) in a fast-paced ad on TikTok, Reels or Shorts, made by an image-to-video model that starts from the photo exactly. Write one shot description per photo.

Social feeds are scrolled fast, so the movement must be visible from the very first frame: no slow fade-in or still start, and the most striking moment comes early.

The shot must look like real footage filmed on set, not AI:
- One continuous shot. A single smooth, confident camera move (a push-in, a lateral slide with parallax, a small arc or a tilt), already moving as the shot begins.
- Small, natural movement that belongs in the scene: steam, condensation running, liquid settling, bubbles, light and shadows shifting, leaves or fabric moving, a person's natural small movements (a breath, a smile, a glance, a sip) when people are in the photo.
- The product never changes: its shape, label, logo and any text stay exactly as photographed. Nothing new appears (no text, no new products, no new people) and nothing transforms or morphs.
- Match the photo's light and mood, and say so (e.g. soft window light, warm golden hour, clean studio light).
Write it as a cinematographer's shot description in plain words, 2 to 3 sentences. No camera brand names, no lens jargon beyond "shallow depth of field".`;

// When Claude isn't available: a safe, subtle move for the kind of photo.
function templatePrompt(photo) {
  const category = parseJson(photo.analysis, null)?.category;
  const keep = 'Movement is visible from the first frame. The product, its label and logo stay exactly as in the photo. Photorealistic commercial footage, shallow depth of field.';
  if (category === 'people') return `A smooth handheld drift. The person moves naturally straight away, a breath and a smile, in the same light as the photo. ${keep}`;
  if (category === 'lifestyle') return `A smooth lateral camera slide with parallax, already moving. Light shifts across the scene and small things move naturally. ${keep}`;
  return `A smooth, confident push-in on the product, already moving. Light glides across its surface with gentle reflections while the background stays softly out of focus. ${keep}`;
}

async function shotPrompts({ brand, brief, photos }) {
  if (!config.anthropic.enabled || !photos.length) return {};
  try {
    const content = [];
    for (const p of photos) {
      content.push({ type: 'text', text: `Photo ${p.id}:` }, await imageForClaude(assetFile(p), 768));
    }
    content.push({ type: 'text', text: `These photos are for ${brand.name}'s ads for ${brief.product}: ${brief.description}\nWrite a shot description for each photo, by its ID.` });
    const response = await claude().beta.messages.parse(modelParams({
      max_tokens: 3000,
      system: DIRECTOR,
      messages: [{ role: 'user', content }],
      output_config: { format: betaZodOutputFormat(ShotSchema) },
    }));
    const ids = new Set(photos.map((p) => p.id));
    return Object.fromEntries((response.parsed_output?.shots || []).filter((s) => ids.has(s.assetId) && s.prompt.trim()).map((s) => [s.assetId, s.prompt.trim()]));
  } catch (err) {
    console.error('[motion] shot descriptions failed, using templates:', err.message);
    return {};
  }
}

// ---------- the models ----------
/** The photo cropped around its subject to the clip's shape, as the first frame. */
async function startFrame(photo, aspect) {
  const [w, h] = FRAME[aspect];
  const img = await loadImage(fs.readFileSync(assetFile(photo)));
  const { sx, sy, sw, sh } = cropFor(photo, w / h);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return canvas.encode('jpeg', 92);
}

/** Seedance 1.5 Pro (or another fal image-to-video model) via fal.ai's queue API. */
async function seedance({ image, aspect, prompt, seconds }) {
  const headers = { Authorization: `Key ${config.fal.key}`, 'Content-Type': 'application/json' };
  const submit = await fetch(`${config.fal.baseUrl}/${config.fal.motionModel}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      image_url: `data:image/jpeg;base64,${image.toString('base64')}`,
      duration: String(seconds),
      resolution: config.fal.motionResolution,
      aspect_ratio: aspect,
      generate_audio: false, // the ads have their own soundtrack
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const job = await submit.json().catch(() => ({}));
  if (!submit.ok) throw new Error(`fal ${submit.status}: ${JSON.stringify(job.detail ?? job).slice(0, 200)}`);
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > 10 * 60_000) throw new Error('Seedance took too long.');
    await sleep(5000);
    const res = await fetch(job.status_url, { headers, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!res?.ok) {
      if (res && res.status < 500 && res.status !== 429) throw new Error(`fal status ${res.status}`);
      continue;
    }
    if ((await res.json()).status === 'COMPLETED') break;
  }
  const res = await fetch(job.response_url, { headers, signal: AbortSignal.timeout(30_000) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.video?.url) throw new Error(`fal ${res.status}: ${JSON.stringify(out.detail ?? out).slice(0, 200)}`);
  const video = await fetch(out.video.url, { signal: AbortSignal.timeout(180_000) });
  if (!video.ok) throw new Error(`fal download ${video.status}`);
  return Buffer.from(await video.arrayBuffer());
}

let veoNegative = true; // Veo 3.1 Lite rejects negative prompts; remember once it says so
async function veo({ image, aspect, prompt, seconds }) {
  const base = config.gemini.baseUrl;
  const headers = { 'x-goog-api-key': config.gemini.key, 'Content-Type': 'application/json' };
  const parameters = { aspectRatio: aspect, durationSeconds: VEO_SECONDS.find((s) => s >= seconds) || 8, resolution: config.gemini.resolution, ...(veoNegative ? { negativePrompt: NEGATIVE } : {}) };
  let op;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}/models/${config.gemini.videoModel}:predictLongRunning`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ instances: [{ prompt, image: { bytesBase64Encoded: image.toString('base64'), mimeType: 'image/jpeg' } }], parameters }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      op = await res.json();
      break;
    }
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    if (res.status === 429 && attempt < 5) {
      await sleep(15_000 * (attempt + 1)); // per-minute quota
      continue;
    }
    if (res.status === 400 && parameters.negativePrompt && /negative/i.test(detail)) {
      delete parameters.negativePrompt; // not every model takes one
      veoNegative = false;
      continue;
    }
    throw new Error(`Veo ${res.status}: ${detail}`);
  }
  const started = Date.now();
  while (!op.done) {
    if (Date.now() - started > 10 * 60_000) throw new Error('Veo took too long.');
    await sleep(8000);
    const res = await fetch(`${base}/${op.name}`, { headers, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (res?.ok) op = await res.json();
    else if (res && res.status < 500 && res.status !== 429) throw new Error(`Veo status ${res.status}`);
  }
  if (op.error) throw new Error(`Veo: ${op.error.message || 'failed'}`);
  const result = op.response?.generateVideoResponse;
  const uri = result?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error(`Veo made no video${result?.raiMediaFilteredReasons?.length ? `: ${result.raiMediaFilteredReasons[0]}` : '.'}`);
  const video = await fetch(uri, { headers: { 'x-goog-api-key': config.gemini.key }, redirect: 'follow', signal: AbortSignal.timeout(180_000) });
  if (!video.ok) throw new Error(`Veo download ${video.status}`);
  return Buffer.from(await video.arrayBuffer());
}

/** Seedance first; Veo if fal isn't set up or the clip can't be made there. */
async function makeClip(shot) {
  if (config.fal.key) {
    try {
      return await seedance(shot);
    } catch (err) {
      if (!config.gemini.key) throw err;
      console.error('[motion] Seedance failed, trying Veo:', err.message);
    }
  }
  return veo(shot);
}

// ---------- making clips ----------
const clipOf = (photoId, aspect) => db.get("SELECT * FROM assets WHERE parent_id = ? AND motion_aspect = ? AND shot_key IS NULL AND status != 'failed' ORDER BY created_at DESC LIMIT 1", photoId, aspect);

async function inPool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

/**
 * Clips for these photos in each orientation: reused from the brand library
 * when they exist, otherwise made with Veo. Returns the ready clips and how
 * many couldn't be made.
 */
export async function animatePhotos({ brand, brief, photos, aspects, seconds = 4, onProgress }) {
  const jobs = photos.flatMap((photo) => aspects.map((aspect) => ({ photo, aspect })));
  const todo = jobs.filter((j) => !clipOf(j.photo.id, j.aspect));
  const prompts = await shotPrompts({ brand, brief, photos: [...new Set(todo.map((j) => j.photo))] });
  let done = jobs.length - todo.length;
  onProgress?.(done, jobs.length);
  await inPool(todo, 2, async (j) => {
    try {
      const video = await makeClip({ image: await startFrame(j.photo, j.aspect), aspect: j.aspect, prompt: prompts[j.photo.id] || templatePrompt(j.photo), seconds });
      const file = path.join(ASSETS_INCOMING, `${newId('veo')}.mp4`);
      fs.writeFileSync(file, video);
      addGeneratedClip({ brand, photo: j.photo, file, aspect: j.aspect });
    } catch (err) {
      console.error(`[motion] clip from ${j.photo.id} (${j.aspect}) failed:`, err.message);
    }
    onProgress?.(++done, jobs.length);
  });
  // New clips are processed like uploads (trimmed, normalised, reviewed by Claude); wait for them.
  const deadline = Date.now() + 6 * 60_000;
  const clips = [];
  for (const j of jobs) {
    let clip = clipOf(j.photo.id, j.aspect);
    while (clip?.status === 'processing' && Date.now() < deadline) {
      await sleep(1500);
      clip = db.get('SELECT * FROM assets WHERE id = ?', clip.id);
    }
    if (clip?.status === 'ready') clips.push(clip);
  }
  return { clips, failed: jobs.length - clips.length, total: jobs.length };
}

// ---------- AI-directed scenes ----------
// Each storyboard scene is filmed as one shot: an opening frame built around the
// brand's product photo (an image model), then animated with the scene's action
// (Seedance, or Veo as the backup). Filmed shots are keyed by their text,
// reference and shape, so editing one scene only re-films that scene.

const shapeFor = (format) => (format === '16:9' ? '16:9' : '9:16');
/** Clip length for a scene in a video of this length (a second longer with a voiceover, which can stretch scenes). */
const sceneSeconds = (length, options) => clipSeconds([length]) + (options.voiceover ? 1 : 0);

export function shotKey(scene, aspect, seconds) {
  const parts = [scene.shot?.frame, scene.shot?.action, scene.assetId, aspect, seconds, config.gemini.key ? config.gemini.frameModel : 'photo', config.fal.key ? config.fal.motionModel : 'veo'];
  return crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 20);
}
/** The shot key a scene of a `length`-second video uses in a format. */
export const sceneKey = (scene, format, length, options) => shotKey(scene, shapeFor(format), sceneSeconds(length, options));
const filmedShot = (brandId, key) => db.get("SELECT * FROM assets WHERE brand_id = ? AND shot_key = ? AND status != 'failed' ORDER BY created_at DESC LIMIT 1", brandId, key);

/** An image cover-cropped to the clip's exact frame, as JPEG. */
async function fitFrame(buffer, aspect) {
  const [w, h] = FRAME[aspect];
  const img = await loadImage(buffer);
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
  return canvas.encode('jpeg', 92);
}

/** The reference photo as JPEG (a video's thumbnail stands in for the video). */
async function referenceImage(asset) {
  const file = asset.kind === 'video' ? assetThumb(asset) : assetFile(asset);
  const img = await loadImage(fs.readFileSync(file));
  const scale = Math.min(1, 1536 / Math.max(img.width, img.height));
  const canvas = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // flatten cut-outs
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.encode('jpeg', 90);
}

/** The opening frame of a shot: a new photo built around the product, or the reference photo itself without an image model. */
async function sceneFrame({ shot, reference, aspect }) {
  if (!config.gemini.key) {
    if (!reference || reference.kind !== 'image') throw new Error('No image model and no photo for this scene.');
    return startFrame(reference, aspect);
  }
  const parts = [];
  if (reference) parts.push({ inlineData: { mimeType: 'image/jpeg', data: (await referenceImage(reference)).toString('base64') } });
  parts.push({
    text: `${reference ? 'Use the product from the reference photo exactly as it is: the same shape, colours, materials, label, logo and details. ' : ''}New photo: ${shot.frame} `
      + `Photorealistic commercial photography with natural light and real shadows, sharp focus on the subject, ${aspect === '9:16' ? 'vertical 9:16' : 'horizontal 16:9'} composition with the subject in the centre. `
      + 'No added text, captions, watermarks or extra logos.',
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${config.gemini.baseUrl}/models/${config.gemini.frameModel}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': config.gemini.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => ({}));
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(10_000 * (attempt + 1));
      continue;
    }
    const image = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!res.ok || !image) throw new Error(`Frame: ${res.status} ${data.error?.message || data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'no image'}`.slice(0, 200));
    return fitFrame(Buffer.from(image.inlineData.data, 'base64'), aspect);
  }
}

const actionPrompt = (shot) => `${shot.action} Photorealistic, smooth and natural motion that starts straight away; the product keeps its exact shape, colours, label and logo throughout. No text appears.`;

/**
 * Film every AI-directed scene of the ad set's videos in the shapes its formats
 * need (reusing shots filmed before). Returns shot key -> clip, and how many
 * couldn't be filmed (those scenes fall back to their reference photo).
 */
export async function filmScenes({ brand, copy, options, assets, onProgress }) {
  const jobs = new Map();
  for (const video of copy.videos || []) {
    if (!options.lengths.includes(video.length)) continue;
    const seconds = sceneSeconds(video.length, options);
    for (const scene of video.scenes) {
      if (!scene.shot) continue;
      for (const aspect of motionAspects(options.formats)) {
        const key = shotKey(scene, aspect, seconds);
        if (!jobs.has(key)) jobs.set(key, { key, scene, aspect, seconds });
      }
    }
  }
  const all = [...jobs.values()];
  const todo = all.filter((j) => !filmedShot(brand.id, j.key));
  let done = all.length - todo.length;
  onProgress?.(done, all.length);
  await inPool(todo, 3, async (j) => {
    try {
      let reference = assets.get(j.scene.assetId) || db.get("SELECT * FROM assets WHERE id = ? AND brand_id = ? AND status = 'ready'", j.scene.assetId, brand.id) || null;
      // An older AI motion clip stands in for its photo: film from the photo itself.
      if (reference?.parent_id && !reference.shot_key) reference = db.get("SELECT * FROM assets WHERE id = ? AND status = 'ready'", reference.parent_id) || reference;
      const image = await sceneFrame({ shot: j.scene.shot, reference, aspect: j.aspect });
      const video = await makeClip({ image, aspect: j.aspect, prompt: actionPrompt(j.scene.shot), seconds: j.seconds });
      const file = path.join(ASSETS_INCOMING, `${newId('shot')}.mp4`);
      fs.writeFileSync(file, video);
      addGeneratedClip({ brand, photo: reference, file, aspect: j.aspect, shotKey: j.key });
    } catch (err) {
      console.error(`[scenes] shot ${j.key} (${j.aspect}) failed:`, err.message);
    }
    onProgress?.(++done, all.length);
  });
  const deadline = Date.now() + 8 * 60_000;
  const clips = new Map();
  for (const j of all) {
    let clip = filmedShot(brand.id, j.key);
    while (clip?.status === 'processing' && Date.now() < deadline) {
      await sleep(1500);
      clip = db.get('SELECT * FROM assets WHERE id = ?', clip.id);
    }
    if (clip?.status === 'ready') clips.set(j.key, clip);
  }
  return { clips, failed: all.length - clips.size, total: all.length };
}

/** For the storyboard: the filmed clip of each scene (vertical when there is one), by video length. */
export function filmedScenes(adset) {
  const copy = parseJson(adset.copy, null);
  const options = parseJson(adset.options, {});
  if (!options.aiScenes || !copy?.videos) return null;
  const format = options.formats?.find((f) => f !== '16:9') || '16:9';
  const ready = (clip) => (clip?.status === 'ready' ? clip.id : null);
  return Object.fromEntries(copy.videos.map((v) => [v.length, v.scenes.map((sc) => (sc.shot ? ready(filmedShot(adset.brand_id, sceneKey(sc, format, v.length, options))) : null))]));
}
