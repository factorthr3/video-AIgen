// YouTube Shorts via the YouTube Data API v3 (OAuth + resumable upload).
// Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET with the YouTube Data API
// enabled. Note: until Google audits your project, uploads are forced private.
import fs from 'node:fs/promises';
import { config } from '../config.js';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

export const configured = () => Boolean(config.google.clientId && config.google.clientSecret);
const redirectUri = () => `${config.appUrl}/api/accounts/youtube/callback`;

export function authUrl(state) {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function token(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.google.clientId, client_secret: config.google.clientSecret, ...params }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${body.error_description || body.error}`);
  return body;
}

export async function exchange(code) {
  const t = await token({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  const body = await res.json();
  const channel = body.items?.[0];
  if (!channel) throw new Error('This Google account has no YouTube channel yet. Create one on YouTube first.');
  return {
    externalId: channel.id,
    username: channel.snippet.title,
    avatarUrl: channel.snippet.thumbnails?.default?.url || null,
    accessToken: t.access_token,
    refreshToken: t.refresh_token || null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  };
}

export async function refresh(refreshToken) {
  const t = await token({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  return { accessToken: t.access_token, refreshToken, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() };
}

export async function publish({ accessToken, file, title, description, hashtags }) {
  const data = await fs.readFile(file);
  const tags = hashtags.slice(0, 15);
  const meta = {
    snippet: {
      title: `${title}`.slice(0, 90) + (title.toLowerCase().includes('#shorts') ? '' : ' #Shorts'),
      description: `${description}\n\n${tags.map((h) => `#${h}`).join(' ')} #Shorts`.slice(0, 4900),
      tags,
      categoryId: '24',
    },
    status: { privacyStatus: process.env.YOUTUBE_PRIVACY || 'public', selfDeclaredMadeForKids: false },
  };
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(data.length),
    },
    body: JSON.stringify(meta),
  });
  if (!init.ok) throw new Error(`YouTube upload init ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const location = init.headers.get('location');
  const put = await fetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(data.length) },
    body: data,
  });
  const body = await put.json().catch(() => ({}));
  if (!put.ok) throw new Error(`YouTube upload ${put.status}: ${body.error?.message || 'failed'}`);
  return { externalId: body.id, url: `https://youtube.com/shorts/${body.id}` };
}
