// Gameplay library: clips of video game footage that "gameplay" videos play
// behind the narration. Admins' uploads are shared with everyone; other users'
// uploads are private to them. Each upload is normalised once (up to 1080p,
// 30 fps, H.264, no audio: game audio often carries licensed music) so renders
// can seek into it quickly, then cut into one continuous track per video.
import fs from 'node:fs';
import path from 'node:path';
import { config, DATA_DIR } from './config.js';
import { db, insert, update, newId, now } from './db.js';
import { isAdmin } from './billing/index.js';
import { ffmpeg, run } from './pipeline/ffmpeg.js';

export const GAMEPLAY_DIR = path.join(DATA_DIR, 'gameplay');
export const GAMEPLAY_INCOMING = path.join(GAMEPLAY_DIR, 'incoming');
fs.mkdirSync(GAMEPLAY_INCOMING, { recursive: true });

const clipFile = (id) => path.join(GAMEPLAY_DIR, `${id}.mp4`);
export const clipThumb = (id) => path.join(GAMEPLAY_DIR, `${id}.jpg`);
export const clipVideo = clipFile;

export const MIN_CLIP_SECONDS = 5;
const MIN_SEGMENT = 6; // shortest stretch of one clip before cutting to another

export const gameSlug = (name) => String(name || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
  .trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40);

// ---------- visibility ----------
const VISIBLE = "(shared = 1 OR user_id = ?)";

export function publicClip(c, user) {
  return {
    id: c.id,
    game: c.game,
    gameName: c.game_name,
    name: c.original_name,
    status: c.status,
    error: c.error,
    duration: c.duration,
    width: c.width,
    height: c.height,
    shared: Boolean(c.shared),
    credit: c.credit,
    mine: c.user_id === user.id,
    canDelete: c.user_id === user.id || isAdmin(user),
    createdAt: c.created_at,
  };
}

export const visibleClips = (user) => db.all(`SELECT * FROM gameplay_clips WHERE ${VISIBLE} ORDER BY game_name, created_at`, user.id);

export function visibleClip(user, id) {
  return db.get(`SELECT * FROM gameplay_clips WHERE id = ? AND ${VISIBLE}`, id, user.id);
}

/** Games with ready footage this user can use: [{ id, name, clips, seconds }]. */
export function gamesFor(user) {
  return db.all(
    `SELECT game AS id, MAX(game_name) AS name, COUNT(*) AS clips, SUM(duration) AS seconds
       FROM gameplay_clips WHERE status = 'ready' AND ${VISIBLE} GROUP BY game ORDER BY name`, user.id,
  );
}

export const gameName = (game) => db.get('SELECT game_name FROM gameplay_clips WHERE game = ? LIMIT 1', game)?.game_name || null;

export function hasGameplay(user, game) {
  return Boolean(game && db.get(`SELECT 1 FROM gameplay_clips WHERE game = ? AND status = 'ready' AND ${VISIBLE} LIMIT 1`, game, user.id));
}

// ---------- uploads ----------
export function addUpload(user, file, gameNameInput, creditInput) {
  const name = String(gameNameInput || '').trim().slice(0, 60);
  const game = gameSlug(name);
  if (!game) {
    fs.rmSync(file.path, { force: true });
    throw Object.assign(new Error('Name the game this footage is from.'), { status: 400, expose: true });
  }
  // Reuse the existing spelling of a game so "gta v" joins "GTA V".
  const existing = db.get('SELECT game_name FROM gameplay_clips WHERE game = ? LIMIT 1', game);
  const clip = insert('gameplay_clips', {
    id: newId('gp'),
    user_id: user.id,
    shared: isAdmin(user) ? 1 : 0,
    game,
    game_name: existing?.game_name || name,
    original_name: String(file.originalname || 'gameplay').slice(0, 120),
    credit: String(creditInput || '').trim().slice(0, 200) || null,
    source: file.path,
    status: 'processing',
    created_at: now(),
  });
  enqueueProcessing(clip.id);
  return clip;
}

export function setCredit(user, id, credit) {
  const clip = visibleClip(user, id);
  if (!clip) throw Object.assign(new Error('Clip not found.'), { status: 404, expose: true });
  if (clip.user_id !== user.id && !isAdmin(user)) throw Object.assign(new Error('Only the uploader or an admin can change this clip.'), { status: 403, expose: true });
  update('gameplay_clips', id, { credit: String(credit || '').trim().slice(0, 200) || null });
}

export function removeClip(user, id) {
  const clip = visibleClip(user, id);
  if (!clip) throw Object.assign(new Error('Clip not found.'), { status: 404, expose: true });
  if (clip.user_id !== user.id && !isAdmin(user)) throw Object.assign(new Error('Only the uploader or an admin can delete this clip.'), { status: 403, expose: true });
  db.run('DELETE FROM gameplay_clips WHERE id = ?', id);
  for (const f of [clipFile(id), clipThumb(id), clip.source]) if (f) fs.rmSync(f, { force: true });
}

/** Everything a user uploaded goes when their account is deleted (files first, rows cascade). */
export function removeUserClips(userId) {
  for (const c of db.all('SELECT id, source FROM gameplay_clips WHERE user_id = ?', userId)) {
    for (const f of [clipFile(c.id), clipThumb(c.id), c.source]) if (f) fs.rmSync(f, { force: true });
  }
}

// ---------- processing (one at a time, so renders keep the CPU) ----------
const pending = [];
let processing = false;

function enqueueProcessing(id) {
  if (!pending.includes(id)) pending.push(id);
  if (!processing) processNext();
}

async function processNext() {
  const id = pending.shift();
  if (!id) {
    processing = false;
    return;
  }
  processing = true;
  try {
    await processClip(id);
  } catch (err) {
    console.error(`[gameplay] ${id} failed:`, err.message);
    update('gameplay_clips', id, { status: 'failed', error: 'This file could not be read as a video. Try an MP4 or MOV export.' });
  }
  processNext();
}

async function probe(file) {
  const out = await run(config.ffprobe, [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file,
  ]);
  const json = JSON.parse(out);
  const stream = json.streams?.[0];
  const duration = parseFloat(json.format?.duration);
  if (!stream?.width || !Number.isFinite(duration)) throw new Error('no video stream');
  return { width: stream.width, height: stream.height, duration };
}

async function processClip(id) {
  const clip = db.get('SELECT * FROM gameplay_clips WHERE id = ?', id);
  if (!clip || clip.status !== 'processing') return;
  const src = await probe(clip.source);
  if (src.duration < MIN_CLIP_SECONDS) {
    update('gameplay_clips', id, { status: 'failed', error: `Clips need to be at least ${MIN_CLIP_SECONDS} seconds long.` });
    fs.rmSync(clip.source, { force: true });
    return;
  }
  const out = clipFile(id);
  const tmp = `${out}.part.mp4`;
  // Fit inside 1920x1080 (or 1080x1920 for vertical footage), even dimensions, 30 fps.
  await ffmpeg([
    '-i', clip.source, '-an',
    '-vf', "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30,format=yuv420p",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', tmp,
  ]);
  fs.renameSync(tmp, out);
  const info = await probe(out);
  await ffmpeg(['-ss', String(Math.min(2, info.duration / 3)), '-i', out, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', clipThumb(id)]);
  fs.rmSync(clip.source, { force: true });
  update('gameplay_clips', id, {
    status: 'ready', error: null, source: null,
    duration: Math.round(info.duration * 100) / 100, width: info.width, height: info.height,
  });
}

/** Restart any processing interrupted by a restart; drop orphaned incoming files. */
export function resumeGameplayProcessing() {
  const rows = db.all("SELECT id, source FROM gameplay_clips WHERE status = 'processing'");
  for (const r of rows) {
    if (r.source && fs.existsSync(r.source)) enqueueProcessing(r.id);
    else update('gameplay_clips', r.id, { status: 'failed', error: 'The upload was interrupted. Please upload it again.' });
  }
  const known = new Set(db.all('SELECT source FROM gameplay_clips WHERE source IS NOT NULL').map((r) => r.source));
  for (const f of fs.readdirSync(GAMEPLAY_INCOMING)) {
    const full = path.join(GAMEPLAY_INCOMING, f);
    if (!known.has(full)) fs.rmSync(full, { force: true });
  }
}

// ---------- building a video's gameplay track ----------
// Merge [start, end] ranges that overlap or touch.
function merge(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && r.start <= last.end + 0.05) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

// The parts of a clip not covered by `used` (merged ranges).
function freeRanges(duration, used) {
  const free = [];
  let at = 0;
  for (const r of used) {
    if (r.start > at) free.push({ start: at, end: Math.min(r.start, duration) });
    at = Math.max(at, r.end);
  }
  if (at < duration) free.push({ start: at, end: duration });
  return free.filter((r) => r.end - r.start > 0.05);
}

/**
 * Footage for `duration` seconds, taken in order: clips in upload order, each
 * from its start, skipping whatever `used` (earlier videos in the same series)
 * already covered. So a long video uploaded once is chopped into consecutive
 * stretches, one per video, until it's used up; then the series starts over.
 * Returns [{ clipId, file, start, duration }].
 */
export function pickSegments(user, game, duration, used = []) {
  const clips = db.all(
    `SELECT id, duration FROM gameplay_clips WHERE game = ? AND status = 'ready' AND ${VISIBLE} ORDER BY created_at, id`, game, user.id,
  );
  if (!clips.length) {
    const name = gameName(game);
    throw new Error(`There's no ${name ? `${name} footage` : 'footage for this game'} in the gameplay library. Upload some clips, then try again.`);
  }
  const segments = [];
  let remaining = duration;
  const take = (avoid) => {
    for (const clip of clips) {
      const covered = merge([...avoid.filter((u) => u.clip === clip.id), ...segments.filter((s) => s.clipId === clip.id).map((s) => ({ start: s.start, end: s.start + s.duration }))]);
      for (const r of freeRanges(clip.duration, covered)) {
        if (remaining <= 0.01) return;
        const length = r.end - r.start;
        // Skip slivers, unless it's exactly what's left to fill.
        if (length < Math.min(MIN_SEGMENT, remaining)) continue;
        const d = Math.min(length, remaining);
        segments.push({ clipId: clip.id, file: clipFile(clip.id), start: r.start, duration: d });
        remaining -= d;
      }
    }
  };
  take(used);
  // Footage used up: start over from the beginning (only this video's picks are avoided).
  if (remaining > 0.01) take([]);
  // Still short (the whole library is shorter than the video): loop it.
  for (let guard = 0; remaining > 0.01 && guard < 50; guard++) {
    const clip = clips[guard % clips.length];
    const d = Math.min(clip.duration, remaining);
    segments.push({ clipId: clip.id, file: clipFile(clip.id), start: 0, duration: d });
    remaining -= d;
  }
  return segments;
}

/**
 * What the current round of a series has covered, from its earlier videos'
 * footage (oldest first). A video that overlaps earlier footage started a new
 * round (the footage ran out and wrapped), so coverage restarts from it.
 */
export function seriesCoverage(history) {
  let covered = [];
  for (const ranges of history) {
    const wrapped = ranges.some((r) => covered.some((c) => c.clip === r.clip && r.start < c.end - 0.05 && r.end > c.start + 0.05));
    covered = wrapped ? [...ranges] : [...covered, ...ranges];
  }
  return covered;
}

/** Credits of the clips a video used, for its caption (e.g. Creative Commons attribution). */
export function creditsFor(segments) {
  const ids = [...new Set(segments.map((s) => s.clipId))];
  const credits = ids.map((id) => db.get('SELECT credit FROM gameplay_clips WHERE id = ?', id)?.credit).filter(Boolean);
  return [...new Set(credits)];
}

/** Layout sizes: "framed" keeps landscape footage whole in a band; "full" crops to fill the frame. */
export function trackSize(layout, W, H) {
  return layout === 'full' ? { w: W, h: H } : { w: W, h: Math.round((W * 9) / 16 / 2) * 2 };
}

/** Cut the segments into one silent MP4 at the layout's size. */
export async function buildGameplayTrack({ segments, layout, W, H, fps, out }) {
  const { w, h } = trackSize(layout, W, H);
  const args = [];
  segments.forEach((s) => args.push('-ss', s.start.toFixed(3), '-t', s.duration.toFixed(3), '-i', s.file));
  const parts = segments.map((_, i) => `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1,fps=${fps},setpts=PTS-STARTPTS[v${i}]`);
  const graph = `${parts.join(';')};${segments.map((_, i) => `[v${i}]`).join('')}concat=n=${segments.length}:v=1:a=0[out]`;
  await ffmpeg([...args, '-filter_complex', graph, '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', out]);
  return { width: w, height: h };
}
