import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Trash2, FlaskConical } from 'lucide-react';
import { PageHeader, Alert, Spinner, PlatformIcon } from '../components/ui.jsx';
import { api, useApi, useCatalog, relativeTime } from '../lib.jsx';

const NOTES = {
  tiktok: 'Posts through TikTok’s Content Posting API. Until TikTok audits your app, posts are private.',
  youtube: 'Uploads Shorts through the YouTube Data API. Unverified Google projects upload as private.',
  instagram: 'Publishes Reels to a Business or Creator account. Requires a public URL for your server.',
};

export default function Accounts() {
  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const { data, reload } = useApi('/accounts');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  if (!data || !catalog) return <div className="grid h-64 place-items-center"><Spinner /></div>;

  const connected = params.get('connected');
  const oauthError = params.get('error');
  const clear = () => setParams({});

  const addDemo = async (platform) => {
    setBusy(platform);
    setError(null);
    try {
      await api('/accounts/demo', { method: 'POST', body: { platform } });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };
  const remove = async (account) => {
    if (!confirm(`Disconnect ${account.username}? Series will stop posting there.`)) return;
    await api(`/accounts/${account.id}`, { method: 'DELETE' });
    reload();
  };

  return (
    <>
      <PageHeader title="Connected accounts" subtitle="Where your videos get posted." />
      {connected && <Alert tone="success" onClose={clear}>Connected your {catalog.platforms.find((p) => p.id === connected)?.name} account.</Alert>}
      {(oauthError || error) && <Alert onClose={() => { clear(); setError(null); }}>{oauthError || error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        {catalog.platforms.map((p) => {
          const accounts = data.accounts.filter((a) => a.platform === p.id);
          const available = data.available[p.id];
          return (
            <div key={p.id} className="card flex flex-col p-6">
              <div className="flex items-center gap-3">
                <PlatformIcon platform={p.id} size="lg" />
                <div>
                  <p className="font-display text-lg font-bold">{p.name}</p>
                  <p className="text-xs text-ink-400">{accounts.length ? `${accounts.length} connected` : 'Not connected'}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-ink-400">{NOTES[p.id]}</p>

              {accounts.length > 0 && (
                <ul className="mt-5 divide-y divide-white/5 rounded-xl border border-white/5">
                  {accounts.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                      {a.avatarUrl ? <img src={a.avatarUrl} alt="" className="size-8 rounded-full" /> : <span className="grid size-8 place-items-center rounded-full bg-white/10 text-xs font-bold">{a.username[0]?.toUpperCase()}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.username}</p>
                        <p className="text-xs text-ink-400">{a.demo ? 'Demo account · posts are simulated' : `Connected ${relativeTime(a.createdAt)}`}</p>
                      </div>
                      <button className="btn-ghost p-2" title="Disconnect" onClick={() => remove(a)}><Trash2 className="size-4" /></button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto flex flex-col gap-2 pt-6">
                {available ? (
                  <a href={`/api/accounts/${p.id}/connect`} className="btn-primary"><Plus className="size-4" /> Connect {p.name.split(' ')[0]}</a>
                ) : (
                  <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-ink-400">
                    Add {p.id === 'youtube' ? 'GOOGLE_CLIENT_ID/SECRET' : p.id === 'tiktok' ? 'TIKTOK_CLIENT_KEY/SECRET' : 'INSTAGRAM_APP_ID/SECRET'} to the server’s .env to enable real posting.
                  </p>
                )}
                <button className="btn-secondary" onClick={() => addDemo(p.id)} disabled={busy === p.id}><FlaskConical className="size-4" /> Add demo account</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
