// Publishing orchestration shared by manual "Post now" and the scheduler.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { db, insert, update, newId, now, parseJson } from '../db.js';
import { encrypt, decrypt } from '../auth.js';
import { videoFile } from '../pipeline/index.js';
import * as youtube from './youtube.js';
import * as tiktok from './tiktok.js';
import * as instagram from './instagram.js';

export const PROVIDERS = { youtube, tiktok, instagram };

// Demo accounts let people try the whole autopilot flow before wiring up
// developer apps. Posts are simulated and clearly labelled as such.
const demo = {
  async publish() {
    await new Promise((r) => setTimeout(r, 1500));
    return { externalId: `demo_${crypto.randomBytes(5).toString('hex')}`, url: null, note: 'Simulated post (demo account)' };
  },
};

// Signed, unguessable URL so Instagram can fetch a video without a session.
export function publicMediaSig(videoId) {
  return crypto.createHmac('sha256', config.secret).update(`media:${videoId}`).digest('base64url').slice(0, 32);
}
export function publicVideoUrl(videoId) {
  const base = config.publicMediaUrl || config.appUrl;
  if (/localhost|127\.0\.0\.1/.test(base)) return null; // Instagram can't reach it
  return `${base}/api/public-media/${videoId}/${publicMediaSig(videoId)}.mp4`;
}

async function freshAccessToken(account) {
  const accessToken = decrypt(account.access_token);
  const expiring = account.expires_at && new Date(account.expires_at).getTime() < Date.now() + 5 * 60_000;
  if (!expiring) return accessToken;
  const provider = PROVIDERS[account.platform];
  const refreshed = await provider.refresh(decrypt(account.refresh_token), accessToken);
  update('accounts', account.id, {
    access_token: encrypt(refreshed.accessToken),
    refresh_token: refreshed.refreshToken ? encrypt(refreshed.refreshToken) : account.refresh_token,
    expires_at: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}

async function publishOne(video, account, postId) {
  update('posts', postId, { status: 'uploading', updated_at: now() });
  try {
    const args = {
      file: videoFile(video.id),
      title: video.title || 'New video',
      description: video.description || '',
      hashtags: parseJson(video.hashtags, []),
      publicUrl: publicVideoUrl(video.id),
      externalId: account.external_id,
    };
    const result = account.demo
      ? await demo.publish(args)
      : await PROVIDERS[account.platform].publish({ ...args, accessToken: await freshAccessToken(account) });
    update('posts', postId, { status: 'published', external_id: result.externalId, url: result.url, note: result.note || null, error: null, updated_at: now() });
  } catch (err) {
    console.error(`[social] ${account.platform} post failed:`, err.message);
    update('posts', postId, { status: 'failed', error: String(err.message).slice(0, 500), updated_at: now() });
  }
}

export function publishVideo(video, accountIds) {
  const accounts = accountIds.length
    ? db.all(`SELECT * FROM accounts WHERE user_id = ? AND id IN (${accountIds.map(() => '?').join(',')})`, video.user_id, ...accountIds)
    : [];
  const posts = accounts.map((account) =>
    insert('posts', {
      id: newId('pst'), video_id: video.id, account_id: account.id, platform: account.platform,
      status: 'pending', created_at: now(), updated_at: now(),
    }));
  // Uploads run in the background; the UI polls post status.
  (async () => {
    for (let i = 0; i < accounts.length; i++) await publishOne(video, accounts[i], posts[i].id);
  })();
  return posts;
}

export function publicAccount(a) {
  return {
    id: a.id, platform: a.platform, username: a.username, avatarUrl: a.avatar_url,
    demo: Boolean(a.demo), createdAt: a.created_at,
  };
}
