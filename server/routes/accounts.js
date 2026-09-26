import { Router } from 'express';
import { config } from '../config.js';
import { db, insert, update, newId, now } from '../db.js';
import { requireAuth, currentUser, createOAuthState, consumeOAuthState, encrypt } from '../auth.js';
import { HttpError } from '../services.js';
import { PROVIDERS, publicAccount } from '../social/index.js';

const router = Router();
const PLATFORM_NAMES = { tiktok: 'TikTok', youtube: 'YouTube', instagram: 'Instagram' };

router.get('/', requireAuth, (req, res) => {
  const rows = db.all('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at', req.user.id);
  res.json({
    accounts: rows.map(publicAccount),
    available: Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, p.configured()])),
  });
});

// Demo accounts: try autopilot without developer credentials.
router.post('/demo', requireAuth, (req, res) => {
  const platform = req.body?.platform;
  if (!PROVIDERS[platform]) throw new HttpError(400, 'Unknown platform.');
  const account = insert('accounts', {
    id: newId('acc'), user_id: req.user.id, platform, external_id: null,
    username: `${req.user.name || 'my'}_${platform}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
    avatar_url: null, demo: 1, created_at: now(),
  });
  res.status(201).json({ account: publicAccount(account) });
});

router.delete('/:id', requireAuth, (req, res) => {
  const account = db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!account) throw new HttpError(404, 'Account not found.');
  db.run('DELETE FROM accounts WHERE id = ?', account.id);
  // Drop it from any series that posted there.
  for (const s of db.all('SELECT id, account_ids FROM series WHERE user_id = ?', req.user.id)) {
    const ids = JSON.parse(s.account_ids).filter((id) => id !== account.id);
    update('series', s.id, { account_ids: JSON.stringify(ids) });
  }
  res.json({ ok: true });
});

// Browser navigations (not fetch), so they redirect rather than return JSON.
router.get('/:platform/connect', (req, res) => {
  const user = currentUser(req);
  const provider = PROVIDERS[req.params.platform];
  if (!user) return res.redirect(`${config.appUrl}/login`);
  if (!provider) return res.redirect(`${config.appUrl}/app/accounts`);
  if (!provider.configured()) {
    return res.redirect(`${config.appUrl}/app/accounts?error=${encodeURIComponent(`${PLATFORM_NAMES[req.params.platform]} isn't configured on this server yet. See the README to add API credentials, or use a demo account.`)}`);
  }
  res.redirect(provider.authUrl(createOAuthState(`connect:${req.params.platform}`, user.id)));
});

router.get('/:platform/callback', async (req, res) => {
  const { platform } = req.params;
  const back = (params) => res.redirect(`${config.appUrl}/app/accounts?${new URLSearchParams(params)}`);
  try {
    const provider = PROVIDERS[platform];
    if (!provider) throw new Error('Unknown platform.');
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
    const state = consumeOAuthState(req.query.state, `connect:${platform}`);
    if (!state) throw new Error('That connection link expired. Please try again.');
    const info = await provider.exchange(String(req.query.code));
    const existing = db.get('SELECT id FROM accounts WHERE user_id = ? AND platform = ? AND external_id = ?', state.user_id, platform, info.externalId);
    const fields = {
      username: info.username,
      avatar_url: info.avatarUrl,
      access_token: encrypt(info.accessToken),
      refresh_token: info.refreshToken ? encrypt(info.refreshToken) : null,
      expires_at: info.expiresAt,
    };
    if (existing) update('accounts', existing.id, fields);
    else insert('accounts', { id: newId('acc'), user_id: state.user_id, platform, external_id: info.externalId, demo: 0, created_at: now(), ...fields });
    back({ connected: platform });
  } catch (err) {
    console.error(`[accounts] ${platform} connect failed:`, err.message);
    back({ error: err.message });
  }
});

export default router;
