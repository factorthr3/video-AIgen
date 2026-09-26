// Autopilot. Every minute:
//  1. start rendering videos for series whose next slot is coming up, and
//  2. publish finished autopilot videos once their slot has arrived.
// State lives in the DB, so a restart never loses or double-posts a video.
import { db, update, now, parseJson } from './db.js';
import { createVideo, nextRunAt, seriesSchedule, seriesSettings } from './services.js';
import { onVideoFinished } from './pipeline/index.js';
import { publishVideo } from './social/index.js';

// Start rendering this far ahead of the slot so the video is ready on time.
const LEAD_MS = 10 * 60_000;

function createDueVideos() {
  const horizon = new Date(Date.now() + LEAD_MS).toISOString();
  const due = db.all('SELECT * FROM series WHERE active = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?', horizon);
  for (const series of due) {
    const slot = new Date(series.next_run_at);
    const next = nextRunAt(seriesSchedule(series), new Date(Math.max(slot.getTime(), Date.now())));
    const user = db.get('SELECT * FROM users WHERE id = ?', series.user_id);
    try {
      createVideo({
        user, seriesId: series.id, settings: seriesSettings(series), origin: 'schedule',
        autoPost: Boolean(series.auto_post), publishAt: slot.toISOString(),
      });
      update('series', series.id, { next_run_at: next, last_error: null });
    } catch (err) {
      update('series', series.id, { next_run_at: next, last_error: err.message });
    }
  }
}

export function publishDueVideos() {
  const ready = db.all(
    `SELECT * FROM videos WHERE auto_post = 1 AND auto_posted = 0 AND status = 'ready'
       AND series_id IS NOT NULL AND (publish_at IS NULL OR publish_at <= ?)`,
    now(),
  );
  for (const video of ready) {
    update('videos', video.id, { auto_posted: 1 });
    const series = db.get('SELECT account_ids FROM series WHERE id = ?', video.series_id);
    const accountIds = parseJson(series?.account_ids, []);
    if (accountIds.length) publishVideo(video, accountIds);
  }
}

function tick() {
  try {
    createDueVideos();
    publishDueVideos();
  } catch (err) {
    console.error('[scheduler] tick failed:', err);
  }
}

export function startScheduler() {
  onVideoFinished(publishDueVideos);
  tick();
  setInterval(tick, 60_000).unref();
  console.log('[scheduler] autopilot running');
}
