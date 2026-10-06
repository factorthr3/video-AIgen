// AI motion: for brands without footage, Google Veo turns their product photos
// into short, subtle video clips (a slow camera move, light, steam, a little
// life) that the ads then use like uploaded footage. Clips are saved to the
// brand's library, so later ad sets reuse them instead of making new ones.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from '../config.js';
import { db, newId, parseJson } from '../db.js';
import { ASSETS_INCOMING, assetFile, cropFor, addGeneratedClip, imageForClaude } from './assets.js';
import { claude, modelParams } from './brief.js';

export const motionEnabled = () => Boolean(config.gemini.key);
export const MOTION_PHOTOS = 3; // photos animated per ad set, at most
const CLIP_SECONDS = 6;
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

const DIRECTOR = `You are the director of photography on a premium product commercial. Each photo will become a ${CLIP_SECONDS}-second video shot made by an image-to-video model that starts from the photo exactly. Write one shot description per photo.

The shot must look like real footage filmed on set, not AI:
- One continuous shot. A single slow, smooth camera move (a gentle push-in, a slow lateral slide with parallax, a small arc or a slow tilt) or a locked-off frame.
- Small, natural movement that belongs in the scene: steam, condensation running, liquid settling, bubbles, light and shadows shifting, leaves or fabric moving, a person's natural small movements (a breath, a smile, a glance, a sip) when people are in the photo.
- The product never changes: its shape, label, logo and any text stay exactly as photographed. Nothing new appears (no text, no new products, no new people) and nothing transforms or morphs.
- Match the photo's light and mood, and say so (e.g. soft window light, warm golden hour, clean studio light).
Write it as a cinematographer's shot description in plain words, 2 to 3 sentences. No camera brand names, no lens jargon beyond "shallow depth of field".`;

// When Claude isn't available: a safe, subtle move for the kind of photo.
function templatePrompt(photo) {
  const category = parseJson(photo.analysis, null)?.category;
  const keep = 'The product, its label and logo stay exactly as in the photo. Photorealistic commercial footage, shallow depth of field.';
  if (category === 'people') return `A gentle, slow handheld drift. The person makes small natural movements, a breath and a slight smile, in the same light as the photo. ${keep}`;
  if (category === 'lifestyle') return `A slow, smooth lateral camera slide with subtle parallax. Light shifts softly across the scene and small things move naturally. ${keep}`;
  return `A slow, smooth push-in on the product. Soft light glides across its surface with gentle reflections while the background stays softly out of focus. ${keep}`;
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

// ---------- Veo ----------
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

async function veo({ image, aspect, prompt }) {
  const base = config.gemini.baseUrl;
  const headers = { 'x-goog-api-key': config.gemini.key, 'Content-Type': 'application/json' };
  const parameters = { aspectRatio: aspect, durationSeconds: CLIP_SECONDS, resolution: config.gemini.resolution, negativePrompt: NEGATIVE };
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

// ---------- making clips ----------
const clipOf = (photoId, aspect) => db.get("SELECT * FROM assets WHERE parent_id = ? AND motion_aspect = ? AND status != 'failed' ORDER BY created_at DESC LIMIT 1", photoId, aspect);

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
export async function animatePhotos({ brand, brief, photos, aspects, onProgress }) {
  const jobs = photos.flatMap((photo) => aspects.map((aspect) => ({ photo, aspect })));
  const todo = jobs.filter((j) => !clipOf(j.photo.id, j.aspect));
  const prompts = await shotPrompts({ brand, brief, photos: [...new Set(todo.map((j) => j.photo))] });
  let done = jobs.length - todo.length;
  onProgress?.(done, jobs.length);
  await inPool(todo, 2, async (j) => {
    try {
      const video = await veo({ image: await startFrame(j.photo, j.aspect), aspect: j.aspect, prompt: prompts[j.photo.id] || templatePrompt(j.photo) });
      const file = path.join(ASSETS_INCOMING, `${newId('veo')}.mp4`);
      fs.writeFileSync(file, video);
      addGeneratedClip({ photo: j.photo, file, aspect: j.aspect });
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
