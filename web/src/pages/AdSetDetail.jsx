import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Link2, Trash2, Wand2, RefreshCw, ExternalLink, Pencil, X, Sparkles, SendHorizontal, Undo2, LoaderCircle, Clapperboard } from 'lucide-react';
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

const SUGGESTIONS = ['Animate the product: show it being used', 'Make the headlines punchier', 'Use a more upbeat soundtrack', 'Add a square version'];
const DIRECTED_SUGGESTIONS = ['Make the opening scene more dramatic', 'Show the product being used', 'End on a close-up of the product', 'Make the headlines punchier'];
const END_CARD = { 6: 1.6, 15: 2.4, 30: 3 };

/** The photo the product must match in a scene: the current pick and the brand's other photos. */
function PhotoPicker({ value, photos, onPick, disabled }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {photos.map((p) => (
        <button key={p.id} type="button" disabled={disabled} onClick={() => onPick(p.id)} title={p.description || p.name}
          className={`size-11 shrink-0 overflow-hidden rounded-lg border-2 transition ${p.id === value ? 'border-brand-400' : 'border-transparent opacity-50 hover:opacity-100'}`}>
          <img src={`/api/assets/${p.id}/thumb`} alt="" className={`size-full ${p.transparent ? 'bg-ink-700 object-contain' : 'object-cover'}`} />
        </button>
      ))}
    </div>
  );
}

/** One scene: its picture (filmed clip, or the photo it's based on), the shot to film and the words on screen. */
function SceneCard({ scene, index, seconds, clipId, photos, voice, disabled, onChange }) {
  const [playing, setPlaying] = useState(false);
  const set = (k, v) => onChange({ ...scene, [k]: v });
  const setShot = (k, v) => onChange({ ...scene, shot: { ...scene.shot, [k]: v } });
  const photo = photos.find((p) => p.id === scene.assetId);
  // Any scene can be filmed with AI from its photo: start from what the photo shows.
  const animate = () => onChange({ ...scene, shot: { frame: photo?.description ? `${photo.description} Exactly as in the photo.` : 'The product exactly as in the photo.', action: '' } });
  const filmed = scene.shot && clipId;
  return (
    <li className="overflow-hidden rounded-xl border border-white/10 bg-ink-850">
      <div className="relative aspect-[4/5] bg-black">
        {filmed && playing
          ? <video src={`/api/assets/${clipId}/file`} autoPlay muted loop playsInline className="size-full object-cover" />
          : <button type="button" className="size-full" onClick={() => filmed && setPlaying(true)} title={filmed ? 'Play this scene' : undefined}>
              <img src={`/api/assets/${(filmed && clipId) || scene.assetId}/thumb`} alt="" className="size-full object-cover" />
            </button>}
        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-bold">Scene {index + 1} · {seconds}s</span>
        <span className={`absolute right-2 top-2 rounded-md px-2 py-0.5 text-[11px] font-semibold ${filmed ? 'bg-emerald-500/90 text-black' : 'bg-black/70 text-ink-300'}`}>
          {filmed ? 'Filmed' : scene.shot ? 'Not filmed yet' : 'As uploaded'}
        </span>
      </div>
      <div className="space-y-2.5 p-3">
        {scene.shot ? (
          <>
            <div>
              <label className="label">Opening shot</label>
              <textarea className="input min-h-28 py-2 text-sm" maxLength={600} value={scene.shot.frame} onChange={(e) => setShot('frame', e.target.value)} disabled={disabled} />
            </div>
            <div>
              <label className="label">What happens</label>
              <textarea className="input min-h-28 py-2 text-sm" maxLength={400} value={scene.shot.action} onChange={(e) => setShot('action', e.target.value)} disabled={disabled}
                placeholder="e.g. Hands pick it up and turn it, it opens to reveal what's inside, the camera sweeps round it" />
            </div>
            <button type="button" className="text-xs text-ink-400 underline-offset-2 hover:text-white hover:underline" onClick={() => onChange({ ...scene, shot: null })} disabled={disabled}>
              Use the photo as it is instead
            </button>
          </>
        ) : (
          <button type="button" className="btn-secondary w-full justify-center" onClick={animate} disabled={disabled}>
            <Clapperboard className="size-4" /> Animate with AI
          </button>
        )}
        <div>
          <label className="label">On screen</label>
          <input className="input mb-1.5 py-2 text-sm font-semibold" maxLength={80} value={scene.headline} onChange={(e) => set('headline', e.target.value)} placeholder="Headline" disabled={disabled} />
          <input className="input py-2 text-sm" maxLength={120} value={scene.subline} onChange={(e) => set('subline', e.target.value)} placeholder="Subline (optional)" disabled={disabled} />
        </div>
        {voice && (
          <div>
            <label className="label">Voiceover</label>
            <textarea className="input min-h-14 py-2 text-sm" maxLength={300} value={scene.voiceover} onChange={(e) => set('voiceover', e.target.value)} disabled={disabled} />
          </div>
        )}
        {photos.length > 1 && (
          <div>
            <label className="label">Product photo to match</label>
            <PhotoPicker value={scene.assetId} photos={photos} onPick={(id) => set('assetId', id)} disabled={disabled} />
          </div>
        )}
      </div>
    </li>
  );
}

/** The closing scene's look: logo size and background, with a rough preview. */
function ClosingScene({ adsetId, value, onChange, brand, disabled }) {
  const logo = brand?.logo;
  const custom = /^#/.test(value.background);
  const bg = custom ? value.background : value.background === 'brand' ? brand?.colors?.[0] || '#0d0d12' : logo?.background || '#0d0d12';
  const pick = (background) => onChange({ ...value, background });
  const chip = (on) => `chip transition ${on ? 'border-white bg-white text-ink-950' : 'hover:border-white/30 hover:text-white'}`;
  // Drawn by the video renderer itself, so it matches the finished ad.
  const preview = `/api/adsets/${adsetId}/closing.png?logoSize=${value.logoSize}&background=${encodeURIComponent(value.background)}&v=${logo?.id || ''}`;
  return (
    <div className="mt-6 grid gap-5 rounded-xl border border-white/10 bg-ink-850 p-4 sm:grid-cols-[170px_1fr]">
      <img src={preview} alt="Closing scene preview" className="mx-auto aspect-[9/16] w-[150px] rounded-lg border border-white/10 object-cover" style={{ background: bg }} />
      <div className="space-y-4">
        <div>
          <p className="font-semibold">Closing scene</p>
          <p className="text-xs text-ink-400">Your logo lands, a light sweeps across it, then the button and link appear. A logo uploaded on a coloured background fills the whole screen with that colour.</p>
        </div>
        <div>
          <label className="label" htmlFor="logo-size">Logo size <span className="normal-case text-ink-300">{value.logoSize}×</span></label>
          <input id="logo-size" type="range" min={0.5} max={3} step={0.25} value={value.logoSize} onChange={(e) => onChange({ ...value, logoSize: Number(e.target.value) })} disabled={disabled} className="w-full accent-brand-500" />
          <div className="flex justify-between text-[11px] text-ink-400"><span>Small</span><span>Standard</span><span>Edge to edge</span></div>
        </div>
        <div>
          <p className="label">Background</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={chip(value.background === 'auto')} onClick={() => pick('auto')} disabled={disabled}>
              <span className="size-3 rounded-full border border-white/30" style={{ background: logo?.background || '#0d0d12' }} /> {logo?.background ? "Logo's colour" : 'Dark'}
            </button>
            <button type="button" className={chip(value.background === 'brand')} onClick={() => pick('brand')} disabled={disabled}>
              <span className="size-3 rounded-full border border-white/30" style={{ background: brand?.colors?.[0] || '#7c3aed' }} /> Brand colour
            </button>
            <label className={`${chip(custom)} cursor-pointer`}>
              <input type="color" className="size-4 cursor-pointer rounded border-0 bg-transparent p-0" value={custom ? value.background : bg} onChange={(e) => pick(e.target.value)} disabled={disabled} /> Any colour
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Every scene of every video, to read, edit, animate with AI and (re)film with Generate. */
function Storyboard({ adset, onSaved }) {
  const [videos, setVideos] = useState(() => structuredClone(adset.copy.videos));
  const savedClosing = adset.options.endCard || { logoSize: 2, background: 'auto' };
  const [closing, setClosing] = useState(savedClosing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { data: brandData } = useApi(adset.brand ? `/brands/${adset.brand.id}` : null);
  const original = JSON.stringify([adset.copy.videos, savedClosing]);
  // Pick up edits made elsewhere (Ask for changes, Edit copy) when there are none here.
  const [base, setBase] = useState(original);
  if (base !== original) {
    setBase(original);
    setVideos(structuredClone(adset.copy.videos));
    setClosing(savedClosing);
  }
  const dirty = JSON.stringify([videos, closing]) !== original;
  const photos = (brandData?.assets || []).filter((a) => a.status === 'ready' && !a.ai);
  const rendering = busy(adset);
  const setScene = (vi, si, scene) => setVideos((v) => {
    const next = structuredClone(v);
    next[vi].scenes[si] = scene;
    return next;
  });
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved((await api(`/adsets/${adset.id}/copy`, { method: 'PATCH', body: { copy: { videos }, endCard: closing } })).adset);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="card mb-8 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Clapperboard className="size-4 text-brand-400" /> Storyboard</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-400">
            {adset.status === 'draft'
              ? 'Your storyboard is ready. Each scene is filmed by AI with your product as the star. Change what happens, the words on screen or the photo it matches, then press Generate. Nothing is filmed until then.'
              : 'Turn any photo into moving footage with Animate with AI, or edit what happens in a scene, then press Generate. Only the scenes you change are filmed again.'}
          </p>
        </div>
        {dirty && (
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setVideos(structuredClone(adset.copy.videos)); setClosing(savedClosing); }} disabled={saving}>Discard</button>
            <button type="button" className="btn-primary" onClick={save} disabled={saving || rendering}>{saving ? 'Saving…' : 'Save storyboard'}</button>
          </div>
        )}
      </div>
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      {videos.map((v, vi) => {
        const seconds = Math.round(((v.length - (END_CARD[v.length] || 2.4)) / v.scenes.length) * 10) / 10;
        return (
          <div key={v.length} className="mb-6 last:mb-0">
            {videos.length > 1 && <p className="mb-3 text-sm font-semibold">{v.length}-second video</p>}
            <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {v.scenes.map((sc, si) => (
                <SceneCard key={si} scene={sc} index={si} seconds={seconds} clipId={adset.filmed?.[v.length]?.[si]} photos={photos}
                  voice={adset.options.voiceover} disabled={rendering || saving} onChange={(next) => setScene(vi, si, next)} />
              ))}
            </ol>
          </div>
        );
      })}
      <ClosingScene adsetId={adset.id} value={closing} onChange={setClosing} brand={brandData?.brand} disabled={rendering || saving} />
      {dirty && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-amber-200">You have unsaved changes to the storyboard.</p>
          <button type="button" className="btn-primary" onClick={save} disabled={saving || rendering}>{saving ? 'Saving…' : 'Save storyboard'}</button>
        </div>
      )}
    </section>
  );
}

/** Renders the changes: only the ads they touch, or every ad when all are current. */
function GenerateBar({ adset, onChange, disabled }) {
  const draft = adset.status === 'draft';
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const { pending } = adset;
  const total = adset.items.length;
  const generate = async () => {
    if (!pending && !window.confirm(`Everything is already up to date. Make all ${total} ads again anyway?`)) return;
    setWorking(true);
    setError(null);
    try {
      onChange((await api(`/adsets/${adset.id}/generate`, { method: 'POST', body: {} })).adset);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };
  if (busy(adset)) return null;
  return (
    <div className="border-t border-white/5 bg-white/[0.02] px-5 py-4">
      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-300">
          {draft
            ? <><strong className="text-white">Ready to film.</strong> Generate films each scene and makes {pending} {pending === 1 ? 'ad' : 'ads'} (a few minutes).</>
            : pending
              ? <><strong className="text-white">{pending} {pending === 1 ? 'ad needs' : 'ads need'} generating</strong> with your changes. The soundtrack stays the same unless you asked to change it.</>
              : 'All ads are up to date with your changes.'}
        </p>
        <button type="button" className={pending ? 'btn-primary' : 'btn-secondary'} onClick={generate} disabled={disabled || working}>
          <Clapperboard className="size-4" /> {working ? 'Starting…' : draft ? 'Generate video' : pending ? `Generate ${pending} ${pending === 1 ? 'ad' : 'ads'}` : 'Generate again'}
        </button>
      </div>
    </div>
  );
}

/** Ask for changes in plain words; replies and undo sit in a short conversation, then Generate makes them. */
function ChangeRequests({ adset, onChange }) {
  const { available, left, items } = adset.revisions;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(null); // the request being worked on
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState(null);
  const list = useRef(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [items.length, sending]);

  const rendering = busy(adset);
  const editor = available || items.length > 0;
  const locked = rendering || Boolean(sending) || undoing || !available || left === 0;
  const send = async (value) => {
    const request = value.trim();
    if (request.length < 3 || locked) return;
    setSending(request);
    setError(null);
    setText('');
    try {
      onChange((await api(`/adsets/${adset.id}/revise`, { method: 'POST', body: { request } })).adset);
    } catch (err) {
      setError(err.message);
      setText(request);
    } finally {
      setSending(null);
    }
  };
  const undo = async (rev) => {
    setUndoing(true);
    setError(null);
    try {
      onChange((await api(`/adsets/${adset.id}/revisions/${rev.id}/undo`, { method: 'POST', body: {} })).adset);
    } catch (err) {
      setError(err.message);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <section className="card mb-8 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/5 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Sparkles className="size-4 text-brand-400" /> {editor ? 'Ask for changes' : 'Generate'}</h2>
          <p className="mt-0.5 text-sm text-ink-400">{editor ? 'Say what you\'d like different, in your own words. Ask for as many changes as you like, then press Generate to make them.' : 'Make the ads with your latest edits.'}</p>
        </div>
        {items.length > 0 && <span className="text-xs text-ink-400">{left} {left === 1 ? 'change' : 'changes'} left</span>}
      </div>
      {(items.length > 0 || sending) && (
        <ol ref={list} className="max-h-96 space-y-4 overflow-y-auto px-5 py-4">
          {items.map((r) => (
            <li key={r.id} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-brand-600/25 px-3.5 py-2 text-sm">{r.request}</p>
              <div className="max-w-[85%]">
                <p className={`w-fit rounded-2xl rounded-bl-md bg-white/5 px-3.5 py-2 text-sm ${r.undone ? 'text-ink-400' : ''}`}>{r.reply}</p>
                {r.undone && <p className="mt-1 pl-1 text-xs text-ink-400">Undone</p>}
                {r.canUndo && (
                  <button type="button" className="btn-ghost mt-1 px-2 py-1 text-xs text-ink-300" onClick={() => undo(r)} disabled={rendering || undoing || Boolean(sending)}>
                    <Undo2 className="size-3.5" /> {undoing ? 'Undoing…' : 'Undo this change'}
                  </button>
                )}
              </div>
            </li>
          ))}
          {sending && (
            <li className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-brand-600/25 px-3.5 py-2 text-sm">{sending}</p>
              <p className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-white/5 px-3.5 py-2 text-sm text-ink-300"><LoaderCircle className="size-4 animate-spin text-brand-400" /> Working on your changes…</p>
            </li>
          )}
        </ol>
      )}
      {editor && (
      <form className="border-t border-white/5 p-4" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
        {!items.length && !sending && (
          <div className="mb-3 flex flex-wrap gap-2">
            {(adset.options.aiScenes ? DIRECTED_SUGGESTIONS : SUGGESTIONS).map((s) => (
              <button key={s} type="button" className="chip transition hover:border-white/25 hover:text-white" onClick={() => setText(s)} disabled={locked}>{s}</button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="change-request" className="sr-only">What would you like changed?</label>
          <textarea
            id="change-request"
            className="input min-h-12 flex-1 resize-none py-3"
            rows={2}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
            placeholder={rendering ? 'You can ask for more changes when these ads finish.' : left === 0 ? 'No changes left on this ad set.' : 'e.g. Open with the pouring clip and make the first headline punchier'}
            disabled={locked}
          />
          <button type="submit" className="btn-primary h-12 shrink-0 px-4" disabled={locked || text.trim().length < 3} title="Send">
            <SendHorizontal className="size-4" /><span className="hidden sm:inline">Send</span>
          </button>
        </div>
        {!available && <p className="mt-2 text-xs text-ink-400">The AI editor isn't available right now. You can still change the words with Edit copy.</p>}
      </form>
      )}
      <GenerateBar adset={adset} onChange={onChange} disabled={Boolean(sending) || undoing} />
    </section>
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
            <p className="mt-1 text-xs text-ink-400">{adset.options.musicMood && adset.options.musicMood !== 'auto' ? `Used when the mood is "Match the ad" (this set uses ${adset.options.musicMood}).` : 'Changing this composes a new track when you generate. Describe genre, mood, tempo and instruments; no artist names.'}</p>
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
        <button className="btn-primary" onClick={() => save(true)} disabled={saving}><RefreshCw className="size-4" /> {saving ? 'Saving…' : 'Save and generate'}</button>
        <button className="btn-ghost" onClick={() => save(false)} disabled={saving}>Save only</button>
      </div>
    </div>
  );
}

export default function AdSetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, setData, reload } = useApi(`/adsets/${id}`, { poll: (d) => busy(d.adset) });
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(null);
  const adset = data?.adset;
  useEffect(() => {
    if (busy(adset)) setEditing(false);
  }, [adset?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error?.status === 404) return <EmptyState title="Ad set not found" action={<Link to="/app/adsets" className="btn-secondary">All ad sets</Link>} />;
  if (error) return <Alert>{error.message}</Alert>;
  if (!adset) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const update = (a) => {
    setData({ adset: a });
    if (busy(a)) reload(); // keeps polling while the ads re-render
  };
  const draft = adset.status === 'draft';
  const hasVideos = Boolean(adset.copy?.videos?.length);

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
      {adset.copy?.motionNote && <Alert tone="warn">{adset.copy.motionNote}</Alert>}
      {adset.copy?.fallback && <Alert tone="warn">The AI copywriter was unavailable, so this copy was taken straight from your brief. Edit it below, or try <strong>New copy</strong> later.</Alert>}
      <AdSetProgress adset={adset} />
      {editing && adset.copy && <CopyEditor adset={adset} onSaved={(a) => { update(a); setEditing(false); }} onCancel={() => setEditing(false)} />}
      {draft && <Storyboard adset={adset} onSaved={update} />}
      {adset.copy && adset.items.length > 0 && <ChangeRequests adset={adset} onChange={update} />}
      {!draft && adset.items.length > 0 && <SharePanel adset={adset} onChange={update} />}
      {!draft && <AdGroups items={adset.items} />}
      {!draft && hasVideos && <Storyboard adset={adset} onSaved={update} />}
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
