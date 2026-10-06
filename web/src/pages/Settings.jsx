import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleCheck, CircleDashed, Trash2 } from 'lucide-react';
import { PageHeader, Alert } from '../components/ui.jsx';
import { api, useSession, useCatalog } from '../lib.jsx';

function DeleteAccount() {
  const { logout } = useSession();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/account', { method: 'DELETE', body: { confirm } });
      await logout();
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="card mt-8 border-red-500/20 p-6">
      <p className="label text-red-300">Delete account</p>
      <p className="text-sm text-ink-300">This permanently deletes your account, brands, assets and ads, and cancels any subscription immediately. It can't be undone.</p>
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      <div className="mt-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button className="btn-danger" disabled={confirm !== 'DELETE' || busy} onClick={remove}><Trash2 className="size-4" /> {busy ? 'Deleting…' : 'Delete my account'}</button>
      </div>
    </div>
  );
}

function Row({ label, ok, value, hint }) {
  return (
    <div className="flex items-start gap-4 py-4">
      {ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" /> : <CircleDashed className="mt-0.5 size-5 shrink-0 text-ink-400" />}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-ink-400">{hint}</p>
      </div>
      <span className="chip shrink-0">{value}</span>
    </div>
  );
}

export default function Settings() {
  const { user } = useSession();
  const catalog = useCatalog();
  const p = catalog?.providers;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="card mb-8 p-6">
        <p className="label">Profile</p>
        <p className="font-semibold">{user?.name}</p>
        <p className="text-sm text-ink-400">{user?.email}</p>
      </div>

      {p && (
        <div className="card p-6">
          <p className="label">Engines</p>
          <p className="mb-2 text-sm text-ink-400">Set these in the server’s <code>.env</code> file (see <code>.env.example</code>) and restart the server.</p>
          <div className="divide-y divide-white/5">
            <Row label="Copywriter and art director" ok={p.copy.provider === 'claude'} value={p.copy.provider === 'claude' ? p.copy.model : 'basic template'} hint="ANTHROPIC_API_KEY: Claude reviews every uploaded asset (subject, quality, framing) and writes the ad copy and storyboard. Without it, copy comes straight from the brief." />
            <Row label="Voiceover" ok={['elevenlabs', 'openai'].includes(p.voice.provider)} value={p.voice.provider} hint="ELEVENLABS_API_KEY for natural, human-sounding narration, or OPENAI_API_KEY. Otherwise the system voice is used." />
          </div>
        </div>
      )}
      <DeleteAccount />
    </>
  );
}
