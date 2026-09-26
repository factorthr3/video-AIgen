// Stage 2: one image per scene. OpenAI images when a key is configured,
// Pollinations (free, keyless) when opted in, procedural art otherwise — and
// procedural art for any individual image request that fails.
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { config, resolveImageProvider } from '../config.js';
import { ART, NICHE } from '../catalog.js';
import { drawSceneArt, hashString } from './art.js';

function fullPrompt(visual, style) {
  return `${visual}. ${style.prompt}. Vertical 9:16 composition, subject centred with breathing room at the bottom, no text, no captions, no watermark, no logos.`;
}

// Newer GPT Image models accept custom sizes, so ask for native 9:16 (1088x1920,
// multiples of 16). gpt-image-1 only offers 1024x1536 portrait.
const imageSize = (model) => config.openai.imageSize || (model.startsWith('gpt-image-1') ? '1024x1536' : '1088x1920');
const LEGACY_IMAGE_MODEL = 'gpt-image-1';
let workingImageModel = null; // remembered after a fallback so we don't retry a model the account lacks

// New OpenAI accounts can be limited to a handful of images per minute. On a
// 429, wait as long as OpenAI asks (plus a little) and try again rather than
// degrading the video to procedural art.
async function postImage(model, prompt) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${config.openai.baseUrl}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.openai.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size: imageSize(model), quality: config.openai.imageQuality, n: 1 }),
      signal: AbortSignal.timeout(240_000),
    });
    const body = await res.json().catch(() => ({}));
    const quota = /quota|billing/i.test(body.error?.message || ''); // out of credit: retrying won't help
    if (res.status !== 429 || quota || attempt >= 8) return { res, body };
    const hinted = Number((body.error?.message || '').match(/try again in ([\d.]+)s/i)?.[1]);
    const waitMs = (Number.isFinite(hinted) ? hinted + 2 : 15) * 1000;
    console.warn(`[images] rate limited, retrying in ${Math.round(waitMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

async function openaiImage(prompt) {
  const models = workingImageModel ? [workingImageModel] : [...new Set([config.openai.imageModel, LEGACY_IMAGE_MODEL])];
  let lastError;
  for (const model of models) {
    const { res, body } = await postImage(model, prompt);
    if (res.ok) {
      workingImageModel = model;
      const item = body.data?.[0];
      if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
      if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer());
      throw new Error('OpenAI images returned no image');
    }
    lastError = new Error(`OpenAI images ${res.status} (${model}): ${body.error?.message || 'request failed'}`);
    // Only an unavailable/unsupported model is worth retrying on the legacy one.
    const modelProblem = [400, 403, 404].includes(res.status) && /model|size|quality/i.test(`${body.error?.param} ${body.error?.code} ${body.error?.message}`);
    if (!modelProblem) break;
    console.error(`[images] ${lastError.message} — trying ${LEGACY_IMAGE_MODEL}`);
  }
  throw lastError;
}

async function pollinationsImage(prompt, seed) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1920&nologo=true&seed=${seed % 1_000_000}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`Pollinations returned ${type || 'no content type'}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function generateSceneImages({ scenes, artStyle, niche, videoId, dir, onProgress }) {
  const provider = resolveImageProvider();
  const style = ART[artStyle] || ART.cinematic;
  const motifs = NICHE[niche]?.motifs || ['mountains', 'city', 'ocean'];
  const { width, height } = config.render;
  const files = new Array(scenes.length);
  const failures = [];
  let done = 0;

  // Re-renders reuse any image whose prompt and style are unchanged.
  const manifestFile = `${dir}/images.json`;
  const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  const manifest = {};

  const makeOne = async (i) => {
    const scene = scenes[i];
    const seed = hashString(`${videoId}:${i}:${scene.visual}`);
    const file = `${dir}/scene-${String(i).padStart(2, '0')}.png`;
    const key = `${artStyle}|${scene.visual}`;
    const cached = Object.entries(previous).find(([, v]) => v.key === key && existsSync(v.file));
    if (cached) {
      if (cached[1].file !== file) await fs.copyFile(cached[1].file, `${file}.tmp`);
      manifest[i] = { key, file, provider: cached[1].provider };
      files[i] = file;
      onProgress?.(++done / scenes.length);
      return;
    }
    let buffer = null;
    let used = provider;
    try {
      if (provider === 'openai') buffer = await openaiImage(fullPrompt(scene.visual, style));
      else if (provider === 'pollinations') buffer = await pollinationsImage(fullPrompt(scene.visual, style), seed);
    } catch (err) {
      failures.push(err.message);
    }
    if (!buffer) {
      buffer = await drawSceneArt({ width, height, style, motifs, visual: scene.visual, seed }).encode('png');
      used = 'procedural';
    }
    await fs.writeFile(`${file}.tmp`, buffer);
    manifest[i] = { key, file, provider: used };
    files[i] = file;
    onProgress?.(++done / scenes.length);
  };

  // Remote providers: a few requests in flight at once. Local art: sequential is plenty fast.
  const concurrency = provider === 'procedural' ? 1 : 3;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, scenes.length) }, async () => {
    while (next < scenes.length) await makeOne(next++);
  }));

  // Swap new images in only after all are done, so reuse never reads a half-updated set.
  for (const i of Object.keys(manifest)) {
    if (existsSync(`${files[i]}.tmp`)) await fs.rename(`${files[i]}.tmp`, files[i]);
  }
  for (const f of await fs.readdir(dir)) {
    const n = f.match(/^scene-(\d+)\.png$/);
    if (n && Number(n[1]) >= scenes.length) await fs.rm(`${dir}/${f}`, { force: true });
  }
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  return { files, provider, failures, model: provider === 'openai' ? workingImageModel : null };
}
