// Orchestrates a video from settings to MP4: script → images → voice →
// AI video clips → audio mix → frame render. Jobs run through a small
// in-process queue; the remote stages overlap across jobs while the CPU-bound
// render runs one at a time. Progress is persisted so the UI can poll it and
// restarts can resume.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, MEDIA_DIR, resolveImageProvider, resolveTtsProvider } from '../config.js';
import { PLAN } from '../catalog.js';
import { db, update, now, parseJson } from '../db.js';
import { writeScript } from './script.js';
import { generateSceneImages } from './images.js';
import { speak } from './tts.js';
import { timeWords, chunkWords } from './captions.js';
import { buildAudioTrack, renderVideo } from './render.js';
import { musicTrack } from './music.js';
import { generateSceneClips } from './clips.js';

const SCENE_GAP = 0.25; // breath between scenes
const TAIL = 0.9; // hold on the last image after narration ends
const CONCURRENCY = Number(process.env.JOB_CONCURRENCY || 3); // jobs in flight (mostly waiting on APIs)
const RENDER_SLOTS = Number(process.env.RENDER_CONCURRENCY || 1); // CPU-bound final renders at once

export const videoDir = (id) => path.join(MEDIA_DIR, id);
export const videoFile = (id) => path.join(videoDir(id), 'video.mp4');
export const thumbFile = (id) => path.join(videoDir(id), 'thumb.jpg');

const listeners = new Set();
export const onVideoFinished = (fn) => listeners.add(fn);

function setStage(id, stage, progress, extra = {}) {
  update('videos', id, { stage, progress: Math.round(progress * 1000) / 1000, updated_at: now(), ...extra });
}

// Stage weights for the overall progress bar.
const WEIGHTS = {
  still: { script: 0.1, images: 0.35, voice: 0.2, clips: 0, render: 0.35 },
  video: { script: 0.05, images: 0.2, voice: 0.1, clips: 0.4, render: 0.25 },
};

// Simple semaphore so only RENDER_SLOTS renders use the CPU at once.
let renderSlotsFree = RENDER_SLOTS;
const renderWaiters = [];
async function withRenderSlot(fn) {
  if (renderSlotsFree > 0) renderSlotsFree--;
  else await new Promise((resolve) => renderWaiters.push(resolve));
  try {
    return await fn();
  } finally {
    const next = renderWaiters.shift();
    if (next) next();
    else renderSlotsFree++;
  }
}

async function runJob(videoId) {
  const video = db.get('SELECT * FROM videos WHERE id = ?', videoId);
  if (!video) return;
  const settings = parseJson(video.settings, {});
  const owner = db.get('SELECT plan FROM users WHERE id = ?', video.user_id);
  const dir = videoDir(videoId);
  fs.mkdirSync(dir, { recursive: true });
  update('videos', videoId, { status: 'processing', error: null, updated_at: now() });
  const useClips = settings.motion !== 'still' && Boolean(config.fal.key);
  const W = WEIGHTS[useClips ? 'video' : 'still'];

  // 1. Script — skipped when re-rendering an edited script.
  let script = parseJson(video.script, null);
  if (!script?.scenes?.length) {
    setStage(videoId, 'Writing script', 0.02);
    const usedTitles = video.series_id
      ? db.all("SELECT title FROM videos WHERE series_id = ? AND id != ? AND title IS NOT NULL ORDER BY created_at", video.series_id, videoId).map((r) => r.title)
      : [];
    script = await writeScript({ ...settings, usedTitles });
    update('videos', videoId, {
      title: script.title,
      description: script.description,
      hashtags: JSON.stringify(script.hashtags || []),
      script: JSON.stringify(script),
    });
  }
  const scenes = script.scenes;
  // Library scripts are English, so voice and caption them in English.
  const language = script.source === 'library' ? 'en' : settings.language;

  // 2. Images
  setStage(videoId, 'Generating visuals', W.script);
  const images = await generateSceneImages({
    scenes, artStyle: settings.artStyle, niche: settings.niche, videoId, dir,
    onProgress: (p) => setStage(videoId, 'Generating visuals', W.script + W.images * p),
  });

  // 3. Voiceover, one audio clip per scene
  let progress = W.script + W.images;
  // Clips are cached per line (text + voice + engine), so a re-render only pays
  // for narration that actually changed.
  const ttsProvider = resolveTtsProvider();
  const voiceKey = (text) => crypto.createHash('sha1')
    .update(JSON.stringify([ttsProvider, config.elevenlabs.model, config.openai.ttsModel, settings.voice, language, text]))
    .digest('hex').slice(0, 16);
  const voices = [];
  const voiceFiles = new Set();
  for (let i = 0; i < scenes.length; i++) {
    setStage(videoId, 'Recording voiceover', progress + W.voice * (i / scenes.length));
    const base = path.join(dir, `voicecache-${voiceKey(scenes[i].narration)}`);
    voiceFiles.add(path.basename(base));
    if (fs.existsSync(`${base}.wav`) && fs.existsSync(`${base}.json`)) {
      voices.push({ ...JSON.parse(fs.readFileSync(`${base}.json`, 'utf8')), file: `${base}.wav` });
      continue;
    }
    const voice = await speak({ text: scenes[i].narration, voiceId: settings.voice, language, niche: settings.niche, outBase: base });
    // Don't cache a fallback voice, so a later re-render can get the premium one.
    if (!voice.error) {
      fs.writeFileSync(`${base}.json`, JSON.stringify({ duration: voice.duration, provider: voice.provider, model: voice.model, words: voice.words }));
    }
    voices.push(voice);
  }
  progress += W.voice;

  // Scene timeline follows the narration exactly.
  let t = 0;
  const timeline = scenes.map((scene, i) => {
    const slot = voices[i].duration + (i === scenes.length - 1 ? TAIL : SCENE_GAP);
    const entry = { ...scene, image: images.files[i], start: t, duration: slot, speechDuration: voices[i].duration, wordTimes: voices[i].words };
    t += slot;
    return entry;
  });
  const totalDuration = t;

  // 4. AI video clips: each scene's image animated to the length of its narration.
  let clips = null;
  if (useClips) {
    setStage(videoId, 'Animating scenes', progress);
    const clipsStart = progress;
    clips = await generateSceneClips({
      timeline, dir,
      onProgress: (p) => setStage(videoId, 'Animating scenes', clipsStart + W.clips * p),
    });
    timeline.forEach((entry, i) => { entry.clip = clips.files[i]; });
    progress += W.clips;
  }

  // 5. Mix + render (CPU-bound, so these take turns across jobs).
  const renderBase = progress;
  setStage(videoId, 'Waiting to render', renderBase);
  await withRenderSlot(async () => {
    setStage(videoId, 'Mixing audio', renderBase);
    const audioFile = path.join(dir, 'audio.m4a');
    await buildAudioTrack({
      clips: voices.map((v, i) => ({ file: v.file, slotDuration: timeline[i].duration })),
      totalDuration,
      musicFile: await musicTrack(settings.music),
      out: audioFile,
    });

    setStage(videoId, 'Rendering video', renderBase);
    const words = timeWords(timeline, language);
    const chunks = chunkWords(words, settings.captionStyle);
    await renderVideo({
      scenes: timeline, chunks,
      captionStyle: settings.captionStyle, language,
      watermark: PLAN[owner?.plan]?.watermark ?? true,
      audioFile, out: videoFile(videoId), thumbOut: thumbFile(videoId),
      onProgress: (p) => setStage(videoId, 'Rendering video', renderBase + W.render * p),
    });
  });

  // Clean up intermediates. Scene images, clips and current voice lines are kept for re-renders.
  for (const f of fs.readdirSync(dir)) {
    const stale = /^voicecache-/.test(f) && !voiceFiles.has(f.replace(/\.(wav|json)$/, ''));
    if (stale || /^voice-.*\.wav$|^audio\.m4a$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  }

  const voiceClip = voices.find((v) => v.provider !== 'system') || voices[0];
  const voiceProvider = voiceClip ? [voiceClip.provider, voiceClip.model].filter(Boolean).join(' · ') : null;
  const clipCount = clips ? clips.files.filter(Boolean).length : 0;
  update('videos', videoId, {
    status: 'ready', stage: null, progress: 1, duration: totalDuration, updated_at: now(),
    providers: JSON.stringify({
      script: script.edited ? `${script.source} (edited)` : script.source, scriptModel: script.model || null,
      images: [images.provider, images.model].filter(Boolean).join(' · '), imageFallbacks: images.failures.length,
      imageError: images.failures[0] || null,
      voice: voiceProvider, voiceErrors: voices.filter((v) => v.error).length,
      voiceError: voices.find((v) => v.error)?.error || null,
      video: clips ? `fal · ${clips.model.replace(/^fal-ai\//, '')}` : 'pan & zoom',
      clips: clips ? `${clipCount}/${scenes.length}` : null,
      clipErrors: clips?.failures.length || 0,
      clipError: clips?.failures[0] || null,
    }),
  });
}

// ---------- queue ----------
const queue = [];
let active = 0;

export function enqueueVideo(videoId) {
  if (!queue.includes(videoId)) queue.push(videoId);
  pump();
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    const id = queue.shift();
    active++;
    runJob(id)
      .then(() => {
        const video = db.get('SELECT * FROM videos WHERE id = ?', id);
        for (const fn of listeners) Promise.resolve(fn(video)).catch((e) => console.error('[pipeline] listener failed:', e));
      })
      .catch((err) => {
        console.error(`[pipeline] video ${id} failed:`, err);
        update('videos', id, { status: 'failed', stage: null, error: String(err.message || err).slice(0, 500), updated_at: now() });
      })
      .finally(() => {
        active--;
        pump();
      });
  }
}

export const queueDepth = () => queue.length + active;

// Anything left mid-flight by a restart goes back on the queue.
export function resumePendingJobs() {
  const pending = db.all("SELECT id FROM videos WHERE status IN ('queued', 'processing') ORDER BY created_at");
  for (const { id } of pending) {
    update('videos', id, { status: 'queued', stage: 'Queued', progress: 0 });
    enqueueVideo(id);
  }
  if (pending.length) console.log(`[pipeline] resumed ${pending.length} job(s)`);
}

export function describeProviders() {
  return { images: resolveImageProvider(), voice: resolveTtsProvider() };
}
