// Stage 3b: turn each scene's image into a real AI video clip (image-to-video)
// via fal.ai's queue API. The still becomes the clip's first frame, so the art
// style stays consistent, and each clip is sized to its narration. A scene
// whose clip fails keeps its still image (animated with pan & zoom).
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { config } from '../config.js';

const DEFAULT_MOTION = 'Subtle, natural motion in the scene; slow, smooth cinematic camera push-in.';
const NEGATIVE = 'blur, distortion, low quality, text, subtitles, captions, watermark, logo, morphing faces, extra limbs';
const POLL_MS = 5000;
const TIMEOUT_MS = 12 * 60_000;

// Shortest clip the model offers that covers the scene; hold the last frame if even the longest is short.
function clipSeconds(needed) {
  const options = config.fal.durations.length ? [...config.fal.durations].sort((a, b) => a - b) : null;
  if (options) return options.find((d) => d >= needed) ?? options.at(-1);
  return Math.min(15, Math.max(3, Math.ceil(needed)));
}

// JPEG data URI keeps the request small (~0.5 MB) without a separate upload step.
async function imageDataUri(file) {
  const img = await loadImage(await fs.readFile(file));
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  return `data:image/jpeg;base64,${(await canvas.encode('jpeg', 90)).toString('base64')}`;
}

const falHeaders = () => ({ Authorization: `Key ${config.fal.key}`, 'Content-Type': 'application/json' });

async function falJson(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...falHeaders(), ...init.headers }, signal: AbortSignal.timeout(60_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map((d) => d.msg || JSON.stringify(d)).join('; ') : body.detail || body.error || body.message;
    throw new Error(`fal ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail || body).slice(0, 300)}`);
  }
  return body;
}

async function generateClip({ imageFile, prompt, seconds, out }) {
  const submit = await falJson(`${config.fal.baseUrl}/${config.fal.videoModel}`, {
    method: 'POST',
    body: JSON.stringify({
      start_image_url: await imageDataUri(imageFile),
      prompt,
      negative_prompt: NEGATIVE,
      duration: String(seconds),
      generate_audio: false, // narration and music are added by Nrrtv
    }),
  });
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > TIMEOUT_MS) throw new Error('fal clip timed out');
    await new Promise((r) => setTimeout(r, POLL_MS));
    const status = await falJson(submit.status_url);
    if (status.status === 'COMPLETED') break;
    if (status.status && !['IN_QUEUE', 'IN_PROGRESS'].includes(status.status)) throw new Error(`fal status ${status.status}`);
  }
  const result = await falJson(submit.response_url);
  const url = result.video?.url;
  if (!url) throw new Error('fal returned no video');
  const video = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!video.ok) throw new Error(`Downloading clip failed (${video.status})`);
  await fs.writeFile(out, Buffer.from(await video.arrayBuffer()));
}

/**
 * timeline: [{ image, duration, visual, motion? }] (scene slots, in seconds)
 * Returns { files: [clipPath | null], failures: [message], model }.
 */
export async function generateSceneClips({ timeline, dir, onProgress }) {
  const files = new Array(timeline.length).fill(null);
  const failures = [];
  if (!config.fal.key) return { files, failures, model: null };

  // Re-renders reuse a clip when the image, prompt and model are unchanged
  // and the clip is long enough for the (possibly re-timed) scene.
  const manifestFile = `${dir}/clips.json`;
  const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : [];
  const manifest = [];
  let done = 0;

  const makeOne = async (i) => {
    const scene = timeline[i];
    const prompt = scene.motion?.trim() || `${scene.visual}. ${DEFAULT_MOTION}`;
    const imageHash = crypto.createHash('sha1').update(await fs.readFile(scene.image)).digest('hex');
    const key = `${config.fal.videoModel}|${imageHash}|${prompt}`;
    const seconds = clipSeconds(scene.duration);
    const cached = previous.find((c) => c.key === key && c.seconds + 0.75 >= scene.duration && existsSync(c.file)); // brief last-frame hold is fine
    try {
      if (cached) {
        files[i] = cached.file;
        manifest.push(cached);
      } else {
        const out = `${dir}/clip-${String(i).padStart(2, '0')}-${imageHash.slice(0, 8)}.mp4`;
        await generateClip({ imageFile: scene.image, prompt, seconds, out });
        files[i] = out;
        manifest.push({ key, seconds, file: out });
      }
    } catch (err) {
      console.error(`[clips] scene ${i + 1} failed:`, err.message);
      failures.push(err.message);
    }
    onProgress?.(++done / timeline.length);
  };

  // Clips take a minute or more each on the provider side, so run several at once.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, timeline.length) }, async () => {
    while (next < timeline.length) await makeOne(next++);
  }));

  // Drop clips no longer referenced (e.g. after the script was edited).
  const keep = new Set(manifest.map((c) => c.file));
  for (const f of await fs.readdir(dir)) {
    if (/^clip-.*\.mp4$/.test(f) && !keep.has(`${dir}/${f}`)) await fs.rm(`${dir}/${f}`, { force: true });
  }
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  return { files, failures, model: config.fal.videoModel };
}
