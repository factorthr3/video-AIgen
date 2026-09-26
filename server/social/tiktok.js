// TikTok via the Content Posting API (Direct Post, FILE_UPLOAD).
// Needs TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET for an app with the
// video.publish scope. Unaudited apps can only post privately (SELF_ONLY).
import fs from 'node:fs/promises';
import { config } from '../config.js';

const API = 'https://open.tiktokapis.com/v2';
export const configured = () => Boolean(config.tiktok.clientKey && config.tiktok.clientSecret);
const redirectUri = () => `${config.appUrl}/api/accounts/tiktok/callback`;

export function authUrl(state) {
  const params = new URLSearchParams({
    client_key: config.tiktok.clientKey,
    scope: 'user.info.basic,video.publish,video.upload',
    response_type: 'code',
    redirect_uri: redirectUri(),
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

async function token(params) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: config.tiktok.clientKey, client_secret: config.tiktok.clientSecret, ...params }),
  });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(`TikTok token error: ${body.error_description || body.error || res.status}`);
  return body;
}

const json = async (url, accessToken, payload) => {
  const res = await fetch(url, {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || (body.error && body.error.code !== 'ok')) {
    throw new Error(`TikTok ${res.status}: ${body.error?.message || body.error?.code || 'request failed'}`);
  }
  return body.data;
};

export async function exchange(code) {
  const t = await token({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  const data = await json(`${API}/user/info/?fields=open_id,avatar_url,display_name`, t.access_token);
  return {
    externalId: t.open_id,
    username: data.user?.display_name || 'TikTok account',
    avatarUrl: data.user?.avatar_url || null,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  };
}

export async function refresh(refreshToken) {
  const t = await token({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() };
}

export async function publish({ accessToken, file, title, description, hashtags }) {
  const data = await fs.readFile(file);
  const creator = await json(`${API}/post/publish/creator_info/query/`, accessToken, {});
  const options = creator.privacy_level_options || [];
  const privacy = options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : options[0] || 'SELF_ONLY';
  const caption = `${title}\n\n${description} ${hashtags.map((h) => `#${h}`).join(' ')}`.slice(0, 2200);

  const init = await json(`${API}/post/publish/video/init/`, accessToken, {
    post_info: { title: caption, privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false, video_cover_timestamp_ms: 1200 },
    source_info: { source: 'FILE_UPLOAD', video_size: data.length, chunk_size: data.length, total_chunk_count: 1 },
  });
  const put = await fetch(init.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(data.length), 'Content-Range': `bytes 0-${data.length - 1}/${data.length}` },
    body: data,
  });
  if (!put.ok) throw new Error(`TikTok upload ${put.status}: ${(await put.text()).slice(0, 200)}`);

  // Poll until TikTok finishes processing (or ~3 minutes pass).
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await json(`${API}/post/publish/status/fetch/`, accessToken, { publish_id: init.publish_id });
    if (status.status === 'PUBLISH_COMPLETE') {
      const postId = status.publicaly_available_post_id?.[0];
      return { externalId: postId ? String(postId) : init.publish_id, url: null, note: privacy === 'SELF_ONLY' ? 'Posted privately (app not yet audited by TikTok)' : null };
    }
    if (status.status === 'FAILED') throw new Error(`TikTok rejected the video: ${status.fail_reason || 'unknown reason'}`);
  }
  return { externalId: init.publish_id, url: null, note: 'Uploaded; TikTok is still processing' };
}
