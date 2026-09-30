import { Router } from 'express';
import { db, insert, update, newId, now, parseJson } from '../db.js';
import { requireAuth } from '../auth.js';
import { PLAN, NICHE } from '../catalog.js';
import {
  HttpError, cleanSettings, checkGameplay, createVideo, nextRunAt, seriesSettings, seriesSchedule, validTimeZone, usage, NEEDS_PLAN_MESSAGE,
} from '../services.js';
import { publicVideo } from './videos.js';

const router = Router();
router.use(requireAuth);

function publicSeries(s) {
  const stats = db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
            MAX(created_at) AS lastCreated
       FROM videos WHERE series_id = ?`, s.id,
  );
  const latest = db.get("SELECT id FROM videos WHERE series_id = ? AND status = 'ready' ORDER BY created_at DESC LIMIT 1", s.id);
  return {
    id: s.id,
    name: s.name,
    ...seriesSettings(s),
    schedule: { days: parseJson(s.schedule_days, []), time: s.schedule_time, timeZone: s.timezone },
    autoPost: Boolean(s.auto_post),
    accountIds: parseJson(s.account_ids, []),
    active: Boolean(s.active),
    nextRunAt: s.active ? s.next_run_at : null,
    lastError: s.last_error,
    createdAt: s.created_at,
    stats: { total: stats.total || 0, ready: stats.ready || 0, lastCreated: stats.lastCreated },
    coverVideoId: latest?.id || null,
  };
}

function cleanSchedule(body, base = {}) {
  const days = Array.isArray(body.schedule?.days)
    ? [...new Set(body.schedule.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort()
    : base.days ?? [0, 1, 2, 3, 4, 5, 6];
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(body.schedule?.time || '') ? body.schedule.time : base.time ?? '18:00';
  const timeZone = validTimeZone(body.schedule?.timeZone) ? body.schedule.timeZone : base.timeZone ?? 'UTC';
  return { days, time, timeZone };
}

function ownedAccountIds(userId, ids) {
  if (!Array.isArray(ids)) return null;
  const owned = new Set(db.all('SELECT id FROM accounts WHERE user_id = ?', userId).map((a) => a.id));
  return ids.filter((id) => owned.has(id));
}

function getOwned(req) {
  const s = db.get('SELECT * FROM series WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!s) throw new HttpError(404, 'Series not found.');
  return s;
}

router.get('/', (req, res) => {
  const rows = db.all('SELECT * FROM series WHERE user_id = ? ORDER BY created_at DESC', req.user.id);
  res.json({ series: rows.map(publicSeries) });
});

router.post('/', (req, res) => {
  const u = usage(req.user);
  if (u.needsPlan) throw new HttpError(402, NEEDS_PLAN_MESSAGE);
  if (u.seriesUsed >= u.seriesLimit) {
    throw new HttpError(402, `Your ${PLAN[u.plan].name} plan includes ${u.seriesLimit} series. Upgrade to run more channels.`);
  }
  const body = req.body || {};
  const settings = cleanSettings(body);
  checkGameplay(req.user, settings);
  const schedule = cleanSchedule(body);
  const accountIds = ownedAccountIds(req.user.id, body.accountIds) || [];
  const name = String(body.name || '').trim().slice(0, 80)
    || (settings.niche === 'custom' ? settings.customTopic.slice(0, 40) : NICHE[settings.niche].name);

  const series = insert('series', {
    id: newId('ser'),
    user_id: req.user.id,
    name,
    niche: settings.niche,
    custom_topic: settings.customTopic,
    language: settings.language,
    voice: settings.voice,
    art_style: settings.artStyle,
    caption_style: settings.captionStyle,
    music: settings.music,
    duration: settings.duration,
    motion: settings.motion,
    game: settings.game,
    game_layout: settings.gameLayout,
    schedule_days: JSON.stringify(schedule.days),
    schedule_time: schedule.time,
    timezone: schedule.timeZone,
    auto_post: body.autoPost === false ? 0 : 1,
    account_ids: JSON.stringify(accountIds),
    active: 1,
    next_run_at: nextRunAt(schedule),
    created_at: now(),
  });

  let firstVideo = null;
  if (body.generateNow !== false) {
    try {
      firstVideo = createVideo({ user: req.user, seriesId: series.id, settings, origin: 'first' });
    } catch (err) {
      update('series', series.id, { last_error: err.message });
    }
  }
  res.status(201).json({ series: publicSeries(db.get('SELECT * FROM series WHERE id = ?', series.id)), video: firstVideo && publicVideo(firstVideo) });
});

router.get('/:id', (req, res) => {
  const s = getOwned(req);
  const videos = db.all('SELECT * FROM videos WHERE series_id = ? ORDER BY created_at DESC LIMIT 100', s.id);
  res.json({ series: publicSeries(s), videos: videos.map(publicVideo) });
});

router.patch('/:id', (req, res) => {
  const s = getOwned(req);
  const body = req.body || {};
  const settings = cleanSettings(body, seriesSettings(s));
  if (body.motion !== undefined || body.game !== undefined) checkGameplay(req.user, settings);
  const schedule = cleanSchedule(body, seriesSchedule(s));
  const active = body.active === undefined ? Boolean(s.active) : Boolean(body.active);
  const accountIds = ownedAccountIds(req.user.id, body.accountIds) ?? parseJson(s.account_ids, []);
  update('series', s.id, {
    name: body.name ? String(body.name).trim().slice(0, 80) : s.name,
    niche: settings.niche,
    custom_topic: settings.customTopic,
    language: settings.language,
    voice: settings.voice,
    art_style: settings.artStyle,
    caption_style: settings.captionStyle,
    music: settings.music,
    duration: settings.duration,
    motion: settings.motion,
    game: settings.game,
    game_layout: settings.gameLayout,
    schedule_days: JSON.stringify(schedule.days),
    schedule_time: schedule.time,
    timezone: schedule.timeZone,
    auto_post: body.autoPost === undefined ? s.auto_post : body.autoPost ? 1 : 0,
    account_ids: JSON.stringify(accountIds),
    active: active ? 1 : 0,
    next_run_at: active ? nextRunAt(schedule) : null,
    last_error: null,
  });
  res.json({ series: publicSeries(db.get('SELECT * FROM series WHERE id = ?', s.id)) });
});

router.delete('/:id', (req, res) => {
  const s = getOwned(req);
  db.run('DELETE FROM series WHERE id = ?', s.id);
  res.json({ ok: true });
});

router.post('/:id/generate', (req, res) => {
  const s = getOwned(req);
  const video = createVideo({ user: req.user, seriesId: s.id, settings: seriesSettings(s), origin: 'manual' });
  res.status(201).json({ video: publicVideo(video) });
});

export default router;
