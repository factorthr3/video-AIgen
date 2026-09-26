// Instagram Reels via the Instagram API with Instagram Login.
// Needs INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET, a professional (Business or
// Creator) Instagram account, and a publicly reachable video URL, because
// Instagram downloads the file itself (set PUBLIC_MEDIA_URL when behind localhost).
import { config } from '../config.js';

const GRAPH = `https://graph.instagram.com/${process.env.INSTAGRAM_GRAPH_VERSION || 'v23.0'}`;
export const configured = () => Boolean(config.instagram.appId && config.instagram.appSecret);
const redirectUri = () => `${config.appUrl}/api/accounts/instagram/callback`;

export function authUrl(state) {
  const params = new URLSearchParams({
    client_id: config.instagram.appId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_content_publish',
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Instagram ${res.status}: ${body.error?.message || body.error_message || 'request failed'}`);
  return body;
}

async function postJson(url, params) {
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Instagram ${res.status}: ${body.error?.message || body.error_message || 'request failed'}`);
  return body;
}

export async function exchange(code) {
  const short = await postJson('https://api.instagram.com/oauth/access_token', {
    client_id: config.instagram.appId,
    client_secret: config.instagram.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(),
    code,
  });
  const shortToken = short.access_token || short.data?.[0]?.access_token;
  const long = await getJson(`https://graph.instagram.com/access_token?${new URLSearchParams({
    grant_type: 'ig_exchange_token', client_secret: config.instagram.appSecret, access_token: shortToken,
  })}`);
  const me = await getJson(`${GRAPH}/me?${new URLSearchParams({ fields: 'user_id,username,profile_picture_url', access_token: long.access_token })}`);
  return {
    externalId: String(me.user_id || me.id),
    username: me.username,
    avatarUrl: me.profile_picture_url || null,
    accessToken: long.access_token,
    refreshToken: null,
    expiresAt: new Date(Date.now() + (long.expires_in || 5_184_000) * 1000).toISOString(),
  };
}

// Long-lived tokens refresh themselves (no separate refresh token).
export async function refresh(_refreshToken, accessToken) {
  const t = await getJson(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: accessToken })}`);
  return { accessToken: t.access_token, refreshToken: null, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() };
}

export async function publish({ accessToken, externalId, publicUrl, title, description, hashtags }) {
  if (!publicUrl) throw new Error('Instagram needs a public video URL. Set PUBLIC_MEDIA_URL to an address Instagram can reach.');
  const caption = `${title}\n\n${description}\n\n${hashtags.map((h) => `#${h}`).join(' ')}`.slice(0, 2200);
  const container = await postJson(`${GRAPH}/${externalId}/media`, {
    media_type: 'REELS', video_url: publicUrl, caption, share_to_feed: 'true', access_token: accessToken,
  });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await getJson(`${GRAPH}/${container.id}?${new URLSearchParams({ fields: 'status_code,status', access_token: accessToken })}`);
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram could not process the video: ${s.status || s.status_code}`);
    if (i === 39) throw new Error('Instagram took too long to process the video');
  }
  const published = await postJson(`${GRAPH}/${externalId}/media_publish`, { creation_id: container.id, access_token: accessToken });
  const media = await getJson(`${GRAPH}/${published.id}?${new URLSearchParams({ fields: 'permalink', access_token: accessToken })}`).catch(() => ({}));
  return { externalId: published.id, url: media.permalink || null };
}
