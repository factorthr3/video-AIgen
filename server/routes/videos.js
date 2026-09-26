import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { db, update, now, parseJson } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, cleanSettings, createVideo } from '../services.js';
import { enqueueVideo, videoDir, videoFile, thumbFile } from '../pipeline/index.js';
import { publishVideo } from '../social/index.js';

const router = Router();
router.use(requireAuth);

export function publicVideo(v) {
  const script = parseJson(v.script, null);
  return {
    id: v.id,
    seriesId: v.series_id,
    origin: v.origin,
    status: v.status,
    stage: v.stage,
    progress: v.progress,
    title: v.title,
    description: v.description,
    hashtags: parseJson(v.hashtags, []),
    scenes: script?.scenes?.map((sc) => ({ narration: sc.narration, visual: sc.visual })) || [],
    scriptSource: script?.source || null,
    settings: parseJson(v.settings, {}),
    duration: v.duration,
    error: v.error,
    providers: parseJson(v.providers, null),
    autoPost: Boolean(v.auto_post),
    publishAt: v.publish_at,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
  };
}

const publicPost = (p) => ({
  id: p.id, platform: p.platform, accountId: p.account_id, username: p.username ?? null, demo: Boolean(p.demo),
  status: p.status, url: p.url, note: p.note, error: p.error, createdAt: p.created_at, updatedAt: p.updated_at,
});

function getOwned(req) {
  const v = db.get('SELECT * FROM videos WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!v) throw new HttpError(404, 'Video not found.');
  return v;
}

router.get('/', (req, res) => {
  const rows = req.query.seriesId
    ? db.all('SELECT * FROM videos WHERE user_id = ? AND series_id = ? ORDER BY created_at DESC LIMIT 200', req.user.id, req.query.seriesId)
    : db.all('SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC LIMIT 200', req.user.id);
  const postCounts = Object.fromEntries(
    db.all(
      `SELECT p.video_id, COUNT(*) AS n FROM posts p JOIN videos v ON v.id = p.video_id
        WHERE v.user_id = ? AND p.status = 'published' GROUP BY p.video_id`, req.user.id,
    ).map((r) => [r.video_id, r.n]),
  );
  res.json({ videos: rows.map((v) => ({ ...publicVideo(v), postCount: postCounts[v.id] || 0 })) });
});

// One-off video outside any series.
router.post('/', (req, res) => {
  const settings = cleanSettings(req.body || {});
  const video = createVideo({ user: req.user, settings, origin: 'manual' });
  res.status(201).json({ video: publicVideo(video) });
});

router.get('/:id', (req, res) => {
  const v = getOwned(req);
  const posts = db.all(
    `SELECT p.*, a.username, a.demo FROM posts p LEFT JOIN accounts a ON a.id = p.account_id
      WHERE p.video_id = ? ORDER BY p.created_at DESC`, v.id,
  );
  res.json({ video: publicVideo(v), posts: posts.map(publicPost) });
});

// Edit metadata and/or the script. Script edits take effect on re-render.
router.patch('/:id', (req, res) => {
  const v = getOwned(req);
  const body = req.body || {};
  const fields = { updated_at: now() };
  if (typeof body.title === 'string') fields.title = body.title.trim().slice(0, 150);
  if (typeof body.description === 'string') fields.description = body.description.trim().slice(0, 2000);
  if (Array.isArray(body.hashtags)) {
    fields.hashtags = JSON.stringify(body.hashtags.map((h) => String(h).replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 15));
  }
  if (Array.isArray(body.scenes)) {
    if (['queued', 'processing'].includes(v.status)) throw new HttpError(409, 'Wait for the current render to finish before editing the script.');
    const scenes = body.scenes
      .map((sc) => ({ narration: String(sc.narration || '').trim().slice(0, 600), visual: String(sc.visual || '').trim().slice(0, 600) }))
      .filter((sc) => sc.narration);
    if (!scenes.length) throw new HttpError(400, 'A video needs at least one scene.');
    const script = parseJson(v.script, {});
    fields.script = JSON.stringify({ ...script, scenes, edited: true });
  }
  update('videos', v.id, fields);
  res.json({ video: publicVideo(db.get('SELECT * FROM videos WHERE id = ?', v.id)) });
});

// Re-render with the (possibly edited) script, or write a fresh script.
router.post('/:id/rerender', (req, res) => {
  const v = getOwned(req);
  if (['queued', 'processing'].includes(v.status)) throw new HttpError(409, 'This video is already being generated.');
  const fields = { status: 'queued', stage: 'Queued', progress: 0, error: null, updated_at: now() };
  if (req.body?.newScript) Object.assign(fields, { script: null, title: null, description: null, hashtags: '[]' });
  if (req.body?.settings) fields.settings = JSON.stringify(cleanSettings(req.body.settings, parseJson(v.settings, {})));
  update('videos', v.id, fields);
  enqueueVideo(v.id);
  res.json({ video: publicVideo(db.get('SELECT * FROM videos WHERE id = ?', v.id)) });
});

router.post('/:id/publish', (req, res) => {
  const v = getOwned(req);
  if (v.status !== 'ready') throw new HttpError(409, 'The video must finish rendering before it can be posted.');
  const ids = Array.isArray(req.body?.accountIds) ? req.body.accountIds : [];
  if (!ids.length) throw new HttpError(400, 'Choose at least one account to post to.');
  const posts = publishVideo(v, ids);
  if (!posts.length) throw new HttpError(400, 'None of those accounts are connected.');
  res.status(202).json({ posts: posts.map(publicPost) });
});

router.delete('/:id', (req, res) => {
  const v = getOwned(req);
  if (v.status === 'processing') throw new HttpError(409, 'Wait for this video to finish before deleting it.');
  db.run('DELETE FROM videos WHERE id = ?', v.id);
  fs.rmSync(videoDir(v.id), { recursive: true, force: true });
  res.json({ ok: true });
});

// ---- media ----
const send = (res, file, type) => {
  if (!fs.existsSync(file)) throw new HttpError(404, 'Not generated yet.');
  res.type(type).sendFile(file, { headers: { 'Cache-Control': 'private, max-age=60' } });
};

router.get('/:id/file', (req, res) => {
  const v = getOwned(req);
  if (req.query.download) {
    const safe = (v.title || 'nrrtv-video').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'nrrtv-video';
    res.attachment(`${safe}.mp4`);
  }
  send(res, videoFile(v.id), 'video/mp4');
});

router.get('/:id/thumb', (req, res) => send(res, thumbFile(getOwned(req).id), 'image/jpeg'));

router.get('/:id/scenes/:n', (req, res) => {
  const v = getOwned(req);
  const n = String(Number(req.params.n)).padStart(2, '0');
  send(res, path.join(videoDir(v.id), `scene-${n}.png`), 'image/png');
});

export default router;
