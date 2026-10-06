import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Link2, Trash2, Wand2, RefreshCw, ExternalLink, Pencil, X } from 'lucide-react';
import { PageHeader, Alert, Spinner, EmptyState } from '../components/ui.jsx';
import { AdGroups, AdSetProgress, AdSetStatus, Captions, CopyButton } from '../components/ads.jsx';
import { api, useApi, formatDateTime } from '../lib.jsx';

const busy = (a) => ['queued', 'processing'].includes(a?.status);

function SharePanel({ adset, onChange }) {
  const [working, setWorking] = useState(false);
  const url = adset.share ? `${window.location.origin}${adset.share.path}` : null;
  const set = async (enabled) => {
    setWorking(true);
    try {
      onChange((await api(`/adsets/${adset.id}/share`, { method: 'POST', body: { enabled } })).adset);
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="card mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-semibold"><Link2 className="size-4 text-brand-400" /> Client link</p>
        {url ? (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-ink-300">
            <span className="truncate font-mono text-xs">{url}</span>
            <CopyButton text={url} />
            <a href={adset.share.path} target="_blank" rel="noreferrer" className="btn-ghost p-1.5 text-ink-400 hover:text-white" title="Open"><ExternalLink className="size-4" /></a>
          </p>
        ) : <p className="mt-1 text-sm text-ink-400">Share a private page where your client can watch and download every ad, no login needed.</p>}
      </div>
      {url
        ? <button className="btn-ghost text-sm" onClick={() => set(false)} disabled={working}>Turn off link</button>
        : <button className="btn-secondary" onClick={() => set(true)} disabled={working}><Link2 className="size-4" /> Create link</button>}
    </div>
  );
}

function CopyEditor({ adset, onSaved, onCancel }) {
  const [copy, setCopy] = useState(() => structuredClone(adset.copy));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const voice = adset.options.voiceover;
  const setScene = (vi, si, k, v) => setCopy((c) => {
    const next = structuredClone(c);
    next.videos[vi].scenes[si][k] = v;
    return next;
  });
  const setStatic = (i, k, v) => setCopy((c) => {
    const next = structuredClone(c);
    next.statics[i][k] = v;
    return next;
  });
  const save = async (rerender) => {
    setSaving(true);
    setError(null);
    try {
      let res = await api(`/adsets/${adset.id}/copy`, { method: 'PATCH', body: { copy } });
      if (rerender) res = await api(`/adsets/${adset.id}/rerender`, { method: 'POST', body: {} });
      onSaved(res.adset);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  return (
    <div className="card mb-8 p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Edit the on-screen copy</h2>
        <button className="btn-ghost p-2" onClick={onCancel} title="Close"><X className="size-4" /></button>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cta">Button</label>
          <input id="cta" className="input" maxLength={24} value={copy.cta} onChange={(e) => setCopy({ ...copy, cta: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="badge">Offer badge <span className="normal-case text-ink-400">(Promo style)</span></label>
          <input id="badge" className="input" maxLength={14} value={copy.badge} onChange={(e) => setCopy({ ...copy, badge: e.target.value })} />
        </div>
        {adset.options.music === 'ai' && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="music">Soundtrack brief</label>
            <textarea id="music" className="input min-h-16" maxLength={300} value={copy.music || ''} onChange={(e) => setCopy({ ...copy, music: e.target.value })} placeholder="e.g. Warm, upbeat indie-pop instrumental with acoustic guitar and hand claps, 110 BPM" />
            <p className="mt-1 text-xs text-ink-400">{adset.options.musicMood && adset.options.musicMood !== 'auto' ? `Used when the mood is "Match the ad" (this set uses ${adset.options.musicMood}).` : 'A new track is composed when you re-render. Describe genre, mood, tempo and instruments; no artist names.'}</p>
          </div>
        )}
      </div>
      {copy.videos.map((v, vi) => (
        <div key={v.length} className="mb-6">
          <p className="mb-2 text-sm font-semibold">{v.length}-second video</p>
          <ol className="space-y-2">
            {v.scenes.map((sc, si) => (
              <li key={si} className="grid gap-2 rounded-xl border border-white/5 bg-ink-850 p-3 sm:grid-cols-[auto_1fr_1fr]">
                <span className="grid size-7 place-items-center rounded-md bg-white/10 text-xs font-bold">{si + 1}</span>
                <input className="input py-2" maxLength={80} value={sc.headline} onChange={(e) => setScene(vi, si, 'headline', e.target.value)} placeholder="Headline" />
                <input className="input py-2" maxLength={120} value={sc.subline} onChange={(e) => setScene(vi, si, 'subline', e.target.value)} placeholder="Subline (optional)" />
                {voice && <textarea className="input min-h-14 py-2 text-sm sm:col-span-2 sm:col-start-2" maxLength={300} value={sc.voiceover} onChange={(e) => setScene(vi, si, 'voiceover', e.target.value)} placeholder="Voiceover" />}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {copy.statics.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold">Image ads</p>
          <ol className="space-y-2">
            {copy.statics.map((s, i) => (
              <li key={i} className="grid gap-2 rounded-xl border border-white/5 bg-ink-850 p-3 sm:grid-cols-[auto_1fr_1fr]">
                <span className="grid size-7 place-items-center rounded-md bg-white/10 text-xs font-bold">{i + 1}</span>
                <input className="input py-2" maxLength={80} value={s.headline} onChange={(e) => setStatic(i, 'headline', e.target.value)} placeholder="Headline" />
                <input className="input py-2" maxLength={140} value={s.subline} onChange={(e) => setStatic(i, 'subline', e.target.value)} placeholder="Subline" />
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => save(true)} disabled={saving}><RefreshCw className="size-4" /> {saving ? 'Saving…' : 'Save and re-render'}</button>
        <button className="btn-ghost" onClick={() => save(false)} disabled={saving}>Save only</button>
      </div>
    </div>
  );
}

export default function AdSetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, setData } = useApi(`/adsets/${id}`, { poll: (d) => busy(d.adset) });
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(null);
  const adset = data?.adset;
  useEffect(() => {
    if (busy(adset)) setEditing(false);
  }, [adset?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error?.status === 404) return <EmptyState title="Ad set not found" action={<Link to="/app/adsets" className="btn-secondary">All ad sets</Link>} />;
  if (error) return <Alert>{error.message}</Alert>;
  if (!adset) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const update = (a) => setData({ adset: a });

  const newCopy = async () => {
    if (!window.confirm('Write brand-new copy and re-make every ad? Your edits will be replaced.')) return;
    try {
      update((await api(`/adsets/${adset.id}/rerender`, { method: 'POST', body: { newCopy: true } })).adset);
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete this ad set and all its ads?')) return;
    await api(`/adsets/${adset.id}`, { method: 'DELETE' });
    navigate(adset.brand ? `/app/brands/${adset.brand.id}` : '/app/adsets');
  };

  return (
    <>
      <PageHeader
        title={adset.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{adset.brand && <Link to={`/app/brands/${adset.brand.id}`} className="hover:text-white">{adset.brand.name}</Link>}<span>·</span><span>{formatDateTime(adset.createdAt)}</span><AdSetStatus adset={adset} /></span>}
        actions={!busy(adset) && (
          <>
            {adset.copy && <button className="btn-secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit copy</button>}
            <button className="btn-ghost" onClick={newCopy} title="Write fresh copy and re-make the ads"><Wand2 className="size-4" /> New copy</button>
            <button className="btn-ghost text-ink-400 hover:text-red-300" onClick={remove} title="Delete"><Trash2 className="size-4" /></button>
          </>
        )}
      />
      {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      {adset.status === 'failed' && <Alert>{adset.error || 'These ads could not be made.'} Try <strong>New copy</strong>, or check the brand's assets.</Alert>}
      {adset.status === 'ready' && adset.error && <Alert tone="warn">{adset.error}</Alert>}
      {adset.copy?.musicNote && <Alert tone="warn">{adset.copy.musicNote}</Alert>}
      {adset.copy?.fallback && <Alert tone="warn">The AI copywriter was unavailable, so this copy was taken straight from your brief. Edit it below, or try <strong>New copy</strong> later.</Alert>}
      <AdSetProgress adset={adset} />
      {editing && adset.copy && <CopyEditor adset={adset} onSaved={(a) => { update(a); setEditing(false); }} onCancel={() => setEditing(false)} />}
      {adset.items.length > 0 && <SharePanel adset={adset} onChange={update} />}
      <AdGroups items={adset.items} />
      {adset.copy?.captions && (
        <section className="mb-10">
          <h2 className="mb-1 font-display text-lg font-bold">Post copy</h2>
          <p className="mb-4 text-sm text-ink-400">Paste these into Ads Manager or each platform when you publish.</p>
          <Captions captions={adset.copy.captions} />
        </section>
      )}
    </>
  );
}
