// Domain rules shared by the HTTP routes and the scheduler.
import { db, insert, newId, now, parseJson } from './db.js';
import { PLAN, NICHE, VOICE, ART, CAPTION, LANGUAGE, DURATION, MUSIC_TRACK, MOTION_TYPE } from './catalog.js';
import { enqueueVideo } from './pipeline/index.js';
import { billingState } from './billing/index.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- quota ----------
const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};

export function usage(user) {
  const plan = PLAN[user.plan] || PLAN.free;
  const used = db.get("SELECT COUNT(*) AS n FROM videos WHERE user_id = ? AND created_at >= ? AND status != 'failed'", user.id, monthStart()).n;
  const series = db.get('SELECT COUNT(*) AS n FROM series WHERE user_id = ?', user.id).n;
  const billing = billingState(user);
  // With payments on, creating needs an active subscription (or admin access).
  const needsPlan = !billing.active;
  return {
    plan: plan.id,
    videosUsed: used,
    videosLimit: needsPlan ? 0 : plan.videosPerMonth,
    seriesUsed: series,
    seriesLimit: needsPlan ? 0 : plan.series,
    needsPlan,
    billing,
  };
}

export const NEEDS_PLAN_MESSAGE = 'Choose a plan on Plan & billing to start creating videos.';

// ---------- settings ----------
// Normalise user-supplied series/video settings against the catalog.
export function cleanSettings(input, base = {}) {
  const pick = (value, table, fallback) => (value != null && table[value] ? value : fallback);
  const niche = pick(input.niche, { ...NICHE, custom: true }, base.niche || 'scary');
  const n = NICHE[niche];
  const customTopic = String(input.customTopic ?? base.customTopic ?? '').trim().slice(0, 500);
  if (niche === 'custom' && !customTopic) throw new HttpError(400, 'Describe your custom topic.');
  const music = typeof input.music === 'string' && input.music.startsWith('upload:')
    ? input.music
    : pick(input.music, MUSIC_TRACK, base.music || n?.music || 'none');
  // One style, or several (comma list / array) that a series rotates through.
  const styles = (Array.isArray(input.artStyle) ? input.artStyle : String(input.artStyle ?? '').split(','))
    .map((x) => String(x).trim())
    .filter((id) => ART[id]);
  return {
    niche,
    customTopic: customTopic || null,
    language: pick(input.language, LANGUAGE, base.language || 'en'),
    voice: pick(input.voice, VOICE, base.voice || n?.voice || 'nova'),
    artStyle: [...new Set(styles)].slice(0, 8).join(',') || base.artStyle || n?.art || 'cinematic',
    captionStyle: pick(input.captionStyle, CAPTION, base.captionStyle || 'bold'),
    music,
    duration: Number(pick(input.duration, DURATION, base.duration || 60)),
    motion: pick(input.motion, MOTION_TYPE, base.motion || 'hook'),
  };
}

export const seriesSettings = (s) => ({
  niche: s.niche, customTopic: s.custom_topic, language: s.language, voice: s.voice,
  artStyle: s.art_style, captionStyle: s.caption_style, music: s.music, duration: s.duration, motion: s.motion,
});

// ---------- videos ----------
export function createVideo({ user, seriesId = null, settings, origin = 'manual', autoPost = false, publishAt = null }) {
  const u = usage(user);
  if (u.needsPlan) throw new HttpError(402, NEEDS_PLAN_MESSAGE);
  if (u.videosUsed >= u.videosLimit) {
    throw new HttpError(402, `You've used all ${u.videosLimit} videos in your ${PLAN[u.plan].name} plan this month. Upgrade to keep creating.`);
  }
  // A series with several art styles rotates through them, one per video.
  const styles = String(settings.artStyle || '').split(',').filter(Boolean);
  if (styles.length > 1) {
    const made = seriesId ? db.get('SELECT COUNT(*) AS n FROM videos WHERE series_id = ?', seriesId).n : 0;
    settings = { ...settings, artStyle: styles[made % styles.length] };
  }
  const video = insert('videos', {
    id: newId('vid'),
    user_id: user.id,
    series_id: seriesId,
    origin,
    status: 'queued',
    stage: 'Queued',
    progress: 0,
    settings: JSON.stringify(settings),
    auto_post: autoPost ? 1 : 0,
    publish_at: publishAt,
    created_at: now(),
    updated_at: now(),
  });
  enqueueVideo(video.id);
  return video;
}

// ---------- schedule ----------
// Offset (ms) of `timeZone` from UTC at a given instant, via Intl.
function tzOffset(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - date.getTime();
}

function localParts(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, weekday };
}

export function validTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false; // Intl treats undefined as "local", not invalid
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Next instant after `from` that falls on one of `days` (0=Sun) at `time` (HH:MM) in `timeZone`. */
export function nextRunAt({ days, time, timeZone }, from = new Date()) {
  if (!days?.length) return null;
  const [hh, mm] = time.split(':').map(Number);
  for (let offset = 0; offset <= 8; offset++) {
    const probe = new Date(from.getTime() + offset * 86400_000);
    const { y, m, d } = localParts(probe, timeZone);
    const guess = Date.UTC(y, m - 1, d, hh, mm);
    let candidate = new Date(guess - tzOffset(new Date(guess), timeZone));
    candidate = new Date(guess - tzOffset(candidate, timeZone)); // settle DST edges
    if (candidate > from && days.includes(localParts(candidate, timeZone).weekday)) return candidate.toISOString();
  }
  return null;
}

export const seriesSchedule = (s) => ({ days: parseJson(s.schedule_days, []), time: s.schedule_time, timeZone: s.timezone });
