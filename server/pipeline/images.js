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

async function openaiImage(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.openai.imageModel, prompt, size: '1024x1536', quality: config.openai.imageQuality, n: 1 }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI images ${res.status}: ${body.error?.message || 'request failed'}`);
  const item = body.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer());
  throw new Error('OpenAI images returned no image');
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
  return { files, provider, failures };
}
