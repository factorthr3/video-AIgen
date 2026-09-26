// Orchestrates a video from settings to MP4: script → images → voice → audio
// mix → frame render. Runs jobs through a small in-process queue (rendering is
// CPU-bound, so one at a time by default) and persists progress to the DB so
// the UI can poll it and restarts can resume.
import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR, resolveImageProvider, resolveTtsProvider } from '../config.js';
import { PLAN } from '../catalog.js';
import { db, update, now, parseJson } from '../db.js';
import { writeScript } from './script.js';
import { generateSceneImages } from './images.js';
import { speak } from './tts.js';
import { timeWords, chunkWords } from './captions.js';
import { buildAudioTrack, renderVideo } from './render.js';
import { musicTrack } from './music.js';

const SCENE_GAP = 0.25; // breath between scenes
const TAIL = 0.9; // hold on the last image after narration ends
const CONCURRENCY = Number(process.env.RENDER_CONCURRENCY || 1);

export const videoDir = (id) => path.join(MEDIA_DIR, id);
export const videoFile = (id) => path.join(videoDir(id), 'video.mp4');
export const thumbFile = (id) => path.join(videoDir(id), 'thumb.jpg');

const listeners = new Set();
export const onVideoFinished = (fn) => listeners.add(fn);

function setStage(id, stage, progress, extra = {}) {
  update('videos', id, { stage, progress: Math.round(progress * 1000) / 1000, updated_at: now(), ...extra });
}

// Stage weights for the overall progress bar.
const W = { script: 0.1, images: 0.35, voice: 0.2, render: 0.35 };

async function runJob(videoId) {
  const video = db.get('SELECT * FROM videos WHERE id = ?', videoId);
  if (!video) return;
  const settings = parseJson(video.settings, {});
  const owner = db.get('SELECT plan FROM users WHERE id = ?', video.user_id);
  const dir = videoDir(videoId);
  fs.mkdirSync(dir, { recursive: true });
  update('videos', videoId, { status: 'processing', error: null, updated_at: now() });

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

  // 3. Voiceover, one clip per scene
  const base = W.script + W.images;
  const clips = [];
  for (let i = 0; i < scenes.length; i++) {
    setStage(videoId, 'Recording voiceover', base + W.voice * (i / scenes.length));
    clips.push(await speak({
      text: scenes[i].narration, voiceId: settings.voice, language, niche: settings.niche,
      outBase: path.join(dir, `voice-${String(i).padStart(2, '0')}`),
    }));
  }

  // Scene timeline follows the narration exactly.
  let t = 0;
  const timeline = scenes.map((scene, i) => {
    const slot = clips[i].duration + (i === scenes.length - 1 ? TAIL : SCENE_GAP);
    const entry = { ...scene, image: images.files[i], start: t, duration: slot, speechDuration: clips[i].duration };
    t += slot;
    return entry;
  });
  const totalDuration = t;

  setStage(videoId, 'Mixing audio', base + W.voice);
  const audioFile = path.join(dir, 'audio.m4a');
  await buildAudioTrack({
    clips: clips.map((c, i) => ({ file: c.file, slotDuration: timeline[i].duration })),
    totalDuration,
    musicFile: await musicTrack(settings.music),
    out: audioFile,
  });

  // 4. Render
  const renderBase = base + W.voice;
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

  // Clean up intermediates but keep scene images (shown in the editor).
  for (const f of fs.readdirSync(dir)) if (/^voice-.*\.wav$|^audio\.m4a$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });

  const voiceProvider = clips.find((c) => c.provider !== 'system')?.provider || clips[0]?.provider;
  update('videos', videoId, {
    status: 'ready', stage: null, progress: 1, duration: totalDuration, updated_at: now(),
    providers: JSON.stringify({
      script: script.edited ? `${script.source} (edited)` : script.source, scriptModel: script.model || null,
      images: images.provider, imageFallbacks: images.failures.length,
      voice: voiceProvider, voiceErrors: clips.filter((c) => c.error).length,
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
