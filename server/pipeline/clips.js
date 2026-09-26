// Stage 3b: turn scene images into real AI video clips (image-to-video) via
// Google's Gemini API (Veo) or fal.ai. The still becomes the clip's first
// frame, so the art style stays consistent, and each clip is sized to its
// narration. Used for every scene ("AI video") or just the opening hook
// ("AI video hook"). A scene whose clip fails keeps its still image.
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { config } from '../config.js';

const DEFAULT_MOTION = 'Subtle, natural motion in the scene; slow, smooth cinematic camera push-in.';
const NEGATIVE = 'blur, distortion, low quality, text, subtitles, captions, watermark, logo, morphing faces, extra limbs';
const POLL_MS = 5000;
const TIMEOUT_MS = 12 * 60_000;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// How each fal image-to-video family wants its request.
const ADAPTERS = [
  {
    match: /kling-video/,
    durations: range(3, 15),
    body: ({ image, prompt, duration }) => ({ start_image_url: image, prompt, negative_prompt: NEGATIVE, duration, generate_audio: false }),
    durationType: 'string',
  },
  {
    match: /ltx/,
    durations: [6, 8, 10, 12, 14, 16, 18, 20],
    body: ({ image, prompt, duration }) => ({ image_url: image, prompt, duration, resolution: '1080p', aspect_ratio: '9:16', generate_audio: false }),
    durationType: 'number',
  },
];
const GENERIC = { durations: [5, 10], body: ({ image, prompt, duration }) => ({ image_url: image, prompt, duration }), durationType: 'string' };
// Veo: 720p takes 4/6/8-second clips; 1080p and 4k only 8.
const VEO = { durations: config.gemini.resolution === '720p' ? [4, 6, 8] : [8], fixed: true };
const adapterFor = (provider, model) => (provider === 'google' ? VEO : ADAPTERS.find((a) => a.match.test(model)) || GENERIC);

// Shortest clip the model offers that covers the scene; hold the last frame if even the longest is short.
function clipSeconds(adapter, needed) {
  const override = adapter.fixed ? [] : config.fal.durations; // FAL_VIDEO_DURATIONS applies to fal models only
  const options = [...(override.length ? override : adapter.durations)].sort((a, b) => a - b);
  return options.find((d) => d >= needed) ?? options.at(-1);
}

// JPEG keeps requests small (~0.5 MB) without a separate upload step.
async function imageJpegBase64(file) {
  const img = await loadImage(await fs.readFile(file));
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  return (await canvas.encode('jpeg', 90)).toString('base64');
}
const imageDataUri = async (file) => `data:image/jpeg;base64,${await imageJpegBase64(file)}`;

const falHeaders = () => ({ Authorization: `Key ${config.fal.key}`, 'Content-Type': 'application/json' });

async function falJson(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...falHeaders(), ...init.headers }, signal: AbortSignal.timeout(60_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map((d) => [d.loc?.at(-1), d.msg].filter(Boolean).join(': ') || JSON.stringify(d)).join('; ') : body.detail || body.error || body.message;
    const err = new Error(`fal ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail || body).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// ---------- Google Veo (Gemini API) ----------
async function geminiJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'x-goog-api-key': config.gemini.key, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Veo ${res.status}: ${body.error?.message || 'request failed'}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function generateVeoClip({ model, imageFile, prompt, seconds, out }) {
  const data = await imageJpegBase64(imageFile);
  const submitWith = (image) => geminiJson(`${config.gemini.baseUrl}/models/${model}:predictLongRunning`, {
    method: 'POST',
    body: JSON.stringify({
      instances: [{ prompt, image }],
      parameters: { aspectRatio: '9:16', durationSeconds: String(seconds), resolution: config.gemini.resolution, numberOfVideos: 1 },
    }),
  });
  let operation;
  try {
    operation = await submitWith({ inlineData: { mimeType: 'image/jpeg', data } });
  } catch (err) {
    // Older API revisions take the image as bytesBase64Encoded; try that shape once.
    if (err.status !== 400 || !/image|inline|field/i.test(err.message)) throw err;
    operation = await submitWith({ bytesBase64Encoded: data, mimeType: 'image/jpeg' });
  }
  const started = Date.now();
  const operationName = operation.name; // poll the name from the submission, whatever later replies contain
  while (!operation.done) {
    if (Date.now() - started > TIMEOUT_MS) throw new Error('Veo clip timed out');
    await new Promise((r) => setTimeout(r, 10_000));
    operation = await geminiJson(`${config.gemini.baseUrl}/${operationName}`);
  }
  if (operation.error) throw new Error(`Veo: ${operation.error.message || 'generation failed'}`);
  const response = operation.response?.generateVideoResponse;
  const uri = response?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const reason = response?.raiMediaFilteredReasons?.join('; ');
    throw new Error(reason ? `Veo blocked the clip: ${reason}` : 'Veo returned no video');
  }
  const video = await fetch(uri, { headers: { 'x-goog-api-key': config.gemini.key }, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!video.ok) throw new Error(`Downloading Veo clip failed (${video.status})`);
  await fs.writeFile(out, Buffer.from(await video.arrayBuffer()));
}

// ---------- fal.ai ----------
async function generateClip({ provider, model, imageFile, prompt, seconds, out }) {
  if (provider === 'google') return generateVeoClip({ model, imageFile, prompt, seconds, out });
  const adapter = adapterFor(provider, model);
  const image = await imageDataUri(imageFile);
  const submitWith = (type) => falJson(`${config.fal.baseUrl}/${model}`, {
    method: 'POST',
    body: JSON.stringify(adapter.body({ image, prompt, duration: type === 'string' ? String(seconds) : seconds })),
  });
  let submit;
  try {
    submit = await submitWith(adapter.durationType);
  } catch (err) {
    // Models disagree on whether duration is "6" or 6; retry once with the other type.
    if (err.status !== 422 || !/duration/i.test(err.message)) throw err;
    submit = await submitWith(adapter.durationType === 'string' ? 'number' : 'string');
  }
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

const hashFile = async (file) => crypto.createHash('sha1').update(await fs.readFile(file)).digest('hex');

/**
 * timeline: [{ image, duration, visual, motion? }] (scene slots, in seconds)
 * indexes:  which scenes to animate (all of them, or just the hook)
 * Returns { files: [clipPath | null], failures: [message], model, requested }.
 */
export async function generateSceneClips({ timeline, dir, provider, model, indexes = timeline.map((_, i) => i), onProgress }) {
  const files = new Array(timeline.length).fill(null);
  const failures = [];
  if (!provider || !indexes.length) return { files, failures, model, requested: indexes.length };
  const adapter = adapterFor(provider, model);

  // Re-renders reuse a clip when the image, prompt and model are unchanged
  // and the clip is long enough for the (possibly re-timed) scene.
  const manifestFile = `${dir}/clips.json`;
  const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : [];
  const manifest = [];
  let done = 0;

  const makeOne = async (i) => {
    const scene = timeline[i];
    const prompt = scene.motion?.trim() || `${scene.visual}. ${DEFAULT_MOTION}`;
    const imageHash = await hashFile(scene.image);
    const key = `${model}|${imageHash}|${prompt}`;
    const seconds = clipSeconds(adapter, scene.duration);
    const cached = previous.find((c) => c.key === key && c.seconds + 0.75 >= scene.duration && existsSync(c.file)); // brief last-frame hold is fine
    try {
      if (cached) {
        files[i] = cached.file;
        manifest.push(cached);
      } else {
        const out = `${dir}/clip-${String(i).padStart(2, '0')}-${imageHash.slice(0, 8)}-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 6)}.mp4`;
        await generateClip({ provider, model, imageFile: scene.image, prompt, seconds, out });
        files[i] = out;
        manifest.push({ key, seconds, file: out });
      }
    } catch (err) {
      console.error(`[clips] scene ${i + 1} failed:`, err.message);
      failures.push(err.message);
    }
    onProgress?.(++done / indexes.length);
  };

  // Clips take a minute or more each on the provider side, so run several at once.
  const queue = [...indexes];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) await makeOne(queue.shift());
  }));

  // Keep clips of this video's current images (so switching modes back and
  // forth doesn't pay twice); drop the rest (e.g. images replaced by an edit).
  const liveImages = new Set(await Promise.all(timeline.map((s) => hashFile(s.image))));
  const kept = [
    ...manifest,
    ...previous.filter((p) => !manifest.some((m) => m.file === p.file) && liveImages.has(p.key.split('|')[1]) && existsSync(p.file)),
  ];
  const keep = new Set(kept.map((c) => c.file));
  for (const f of await fs.readdir(dir)) {
    if (/^clip-.*\.mp4$/.test(f) && !keep.has(`${dir}/${f}`)) await fs.rm(`${dir}/${f}`, { force: true });
  }
  await fs.writeFile(manifestFile, JSON.stringify(kept));
  return { files, failures, model, requested: indexes.length };
}
