import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Upload, Trash2, Plus, Film, Image as ImageIcon, LoaderCircle, TriangleAlert, Star, Megaphone, Sparkles } from 'lucide-react';
import { PageHeader, Alert, Spinner, EmptyState } from '../components/ui.jsx';
import { AdSetStatus } from '../components/ads.jsx';
import { BrandLogo } from './Brands.jsx';
import { api, useApi, useCatalog, relativeTime, formatDuration } from '../lib.jsx';

// Font previews use the same typefaces the renderer uses.
export const FONT_CSS = {
  montserrat: { fontFamily: 'Montserrat', fontWeight: 800 },
  inter: { fontFamily: 'Inter', fontWeight: 700 },
  playfair: { fontFamily: '"Playfair Display"', fontWeight: 700 },
  bebas: { fontFamily: '"Bebas Neue"', fontWeight: 400, letterSpacing: '0.02em' },
};

/** Upload files with progress (fetch can't report upload progress). */
export function uploadWithProgress(url, files, field, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    for (const f of files) form.append(field, f);
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || (xhr.status === 413 ? 'That file is too big.' : `Upload failed (${xhr.status})`)));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.send(form);
  });
}

function BrandKit({ brand, onSaved, catalog }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const logoRef = useRef(null);
  useEffect(() => {
    setForm({ name: brand.name, website: brand.website || '', about: brand.about || '', tone: brand.tone || '', colors: brand.colors, font: brand.font });
  }, [brand.id, brand.colors.join(','), brand.logo?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!form) return null;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await api(`/brands/${brand.id}`, { method: 'PATCH', body: form });
      setNotice({ tone: 'success', text: 'Brand kit saved.' });
      onSaved();
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    }
    setBusy(false);
  };
  const uploadLogo = async (file) => {
    if (!file) return;
    setNotice(null);
    try {
      await uploadWithProgress(`/api/brands/${brand.id}/logo`, [file], 'file', () => {});
      onSaved();
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    }
  };
  return (
    <form onSubmit={save} className="card mb-10 p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Brand kit</h2>
        <button className="btn-primary py-2" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div>
          <p className="label">Logo</p>
          <button type="button" onClick={() => logoRef.current?.click()} className="grid aspect-[4/3] w-full place-items-center rounded-xl border border-dashed border-white/15 p-4 transition hover:border-white/30" style={{ background: 'repeating-conic-gradient(#ffffff 0% 25%, #eeeef2 0% 50%) 50% / 16px 16px' }}>
            {brand.logo?.status === 'ready'
              ? <img src={`/api/assets/${brand.logo.id}/file`} alt="" className="max-h-full max-w-full object-contain" />
              : brand.logo?.status === 'processing'
                ? <LoaderCircle className="size-6 animate-spin text-ink-500" />
                : <span className="text-center text-xs font-medium text-ink-500"><Upload className="mx-auto mb-1 size-5" />Upload logo<br />PNG or SVG, transparent</span>}
          </button>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
          <p className="mt-2 text-xs text-ink-400">A transparent PNG or SVG looks best. Colours are picked up from it automatically.</p>
        </div>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" className="input" required maxLength={80} value={form.name} onChange={(e) => set('name')(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="web">Website</label>
              <input id="web" className="input" maxLength={200} value={form.website} onChange={(e) => set('website')(e.target.value)} placeholder="yourbrand.com" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="about">About the brand</label>
            <textarea id="about" className="input min-h-20" maxLength={1000} value={form.about} onChange={(e) => set('about')(e.target.value)} placeholder="What you sell, who it's for, what makes it different. Used for every ad's copy." />
          </div>
          <div>
            <label className="label" htmlFor="tone">Brand voice</label>
            <input id="tone" className="input" maxLength={200} value={form.tone} onChange={(e) => set('tone')(e.target.value)} placeholder="e.g. Warm, confident, a little playful" />
          </div>
          <div>
            <p className="label">Colours</p>
            <div className="flex flex-wrap items-center gap-3">
              {form.colors.map((c, i) => (
                <label key={i} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 py-1.5 pl-1.5 pr-2.5 text-xs">
                  <input type="color" value={c} onChange={(e) => set('colors')(form.colors.map((x, k) => (k === i ? e.target.value : x)))} className="size-8 cursor-pointer rounded-lg border-0 bg-transparent" />
                  <span className="font-mono">{c}</span>
                  <span className="text-ink-400">{i === 0 ? 'Primary' : i === 1 ? 'Accent' : 'Extra'}</span>
                  <button type="button" className="ml-1 text-ink-400 hover:text-white" onClick={() => set('colors')(form.colors.filter((_, k) => k !== i))} title="Remove">×</button>
                </label>
              ))}
              {form.colors.length < 3 && <button type="button" className="btn-ghost text-xs" onClick={() => set('colors')([...form.colors, '#7c3aed'])}><Plus className="size-3.5" /> Add colour</button>}
            </div>
            <p className="mt-2 text-xs text-ink-400">Primary is used for colour blocks and backdrops; accent for buttons and badges.</p>
          </div>
          <div>
            <p className="label">Headline font</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {catalog.fonts.map((f) => (
                <button key={f.id} type="button" data-selected={form.font === f.id} className="option p-3 text-left" onClick={() => set('font')(f.id)}>
                  <span className="block text-2xl leading-tight" style={FONT_CSS[f.id]}>{form.name || 'Aa'}</span>
                  <span className="mt-1 block text-xs font-semibold">{f.name}</span>
                  <span className="block text-xs text-ink-400">{f.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function AssetCard({ asset, onDelete }) {
  const Icon = asset.kind === 'video' ? Film : ImageIcon;
  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-square bg-ink-800" style={asset.transparent ? { background: 'repeating-conic-gradient(#2a2a33 0% 25%, #22222a 0% 50%) 50% / 14px 14px' } : undefined}>
        {asset.status === 'ready'
          ? <img src={`/api/assets/${asset.id}/thumb`} alt="" loading="lazy" className={`absolute inset-0 size-full ${asset.transparent ? 'object-contain p-3' : 'object-cover'}`} />
          : asset.status === 'processing'
            ? <div className="grid size-full place-items-center text-xs text-ink-300"><span><LoaderCircle className="mx-auto mb-1 size-5 animate-spin" />Processing…</span></div>
            : <div className="grid size-full place-items-center p-3 text-center text-xs text-red-300"><span><TriangleAlert className="mx-auto mb-1 size-5" />{asset.error || 'Failed'}</span></div>}
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur">
          <Icon className="size-3" />{asset.ai ? `AI motion · ${formatDuration(asset.duration)}` : asset.kind === 'video' ? formatDuration(asset.duration) : asset.transparent ? 'Cut-out' : 'Photo'}
        </span>
        <button type="button" className="absolute right-2 top-2 rounded-md bg-black/60 p-1 text-ink-300 backdrop-blur hover:text-red-300" onClick={() => onDelete(asset)} title="Delete"><Trash2 className="size-3.5" /></button>
      </div>
      <div className="p-3">
        {asset.description ? (
          <>
            <p className="flex items-center gap-1.5 text-xs font-semibold capitalize text-ink-300">
              {asset.category}
              <span className="flex">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`size-3 ${i < asset.quality ? 'fill-amber-300 text-amber-300' : 'text-ink-600'}`} />)}</span>
            </p>
            <p className="mt-1 line-clamp-3 text-xs text-ink-400" title={asset.description}>{asset.description}</p>
          </>
        ) : <p className="truncate text-xs text-ink-400" title={asset.name}>{asset.name}</p>}
      </div>
    </div>
  );
}

export default function BrandDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const { data, error, reload } = useApi(`/brands/${id}`, {
    poll: (d) => d.assets.some((a) => a.status === 'processing') || d.brand.logo?.status === 'processing' || d.adsets.some((a) => ['queued', 'processing'].includes(a.status)),
  });
  const fileRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState(null);
  const [dragging, setDragging] = useState(false);

  if (error?.status === 404) return <EmptyState title="Brand not found" action={<Link to="/app/brands" className="btn-secondary">Back to brands</Link>} />;
  if (error) return <Alert>{error.message}</Alert>;
  if (!data || !catalog) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const { brand, assets, adsets } = data;

  const upload = async (files) => {
    const list = [...(files || [])];
    if (!list.length) return;
    setNotice(null);
    setProgress(0);
    try {
      await uploadWithProgress(`/api/brands/${brand.id}/assets`, list, 'files', setProgress);
      setNotice({ tone: 'success', text: `Uploaded ${list.length} file${list.length === 1 ? '' : 's'}. ${catalog.providers?.copy?.provider === 'claude' ? 'Each one is reviewed so ads use the best shots.' : ''}` });
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    }
    setProgress(null);
    if (fileRef.current) fileRef.current.value = '';
    reload();
  };
  const removeAsset = async (asset) => {
    if (!window.confirm('Delete this asset? Ads already made keep it.')) return;
    await api(`/assets/${asset.id}`, { method: 'DELETE' }).catch((err) => setNotice({ tone: 'error', text: err.message }));
    reload();
  };
  const removeBrand = async () => {
    if (!window.confirm(`Delete ${brand.name}, its assets and all its ads? This can't be undone.`)) return;
    await api(`/brands/${brand.id}`, { method: 'DELETE' });
    navigate('/app/brands');
  };
  const readyAssets = assets.filter((a) => a.status === 'ready').length;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><BrandLogo brand={brand} className="size-10" />{brand.name}</span>}
        subtitle={brand.website || 'Brand kit, assets and ads'}
        actions={(
          <>
            <Link to={`/app/adsets/new?brand=${brand.id}`} className={`btn-primary ${readyAssets ? '' : 'pointer-events-none opacity-50'}`}><Sparkles className="size-4" /> Make ads</Link>
            <button className="btn-ghost text-ink-400 hover:text-red-300" onClick={removeBrand}><Trash2 className="size-4" /></button>
          </>
        )}
      />
      {params.get('new') && !assets.length && <Alert tone="info">Next: add your logo, then upload product photos and videos below. The more good shots, the better the ads.</Alert>}
      {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <BrandKit brand={brand} catalog={catalog} onSaved={reload} />

      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Assets</h2>
            <p className="text-sm text-ink-400">Product photos, lifestyle shots, cut-outs (transparent PNG) and video clips. Ads are built only from these, so use your best material.</p>
          </div>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={progress !== null}>
            <Upload className="size-4" /> {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : 'Upload'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
          className={`rounded-2xl transition ${dragging ? 'outline-2 outline-dashed outline-brand-400' : ''}`}
        >
          {assets.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {assets.map((a) => <AssetCard key={a.id} asset={a} onDelete={removeAsset} />)}
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="card grid w-full place-items-center border-dashed px-6 py-14 text-center transition hover:border-white/25">
              <span><Upload className="mx-auto mb-3 size-7 text-brand-400" /><span className="font-semibold">Drop photos and videos here</span><br /><span className="text-sm text-ink-400">JPG, PNG, WebP, MP4 or MOV, up to 500 MB each</span></span>
            </button>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-lg font-bold">Ad sets</h2>
        {adsets.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {adsets.map((a) => (
              <Link key={a.id} to={`/app/adsets/${a.id}`} className="card flex items-center gap-4 p-4 transition hover:border-white/20">
                <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-800">{a.cover ? <img src={a.cover} alt="" className="size-full object-cover" /> : <Megaphone className="size-5 text-ink-500" />}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{a.name}</p>
                  <p className="mb-1.5 text-xs text-ink-400">{a.ads.ready}/{a.ads.total} ads · {relativeTime(a.createdAt)}</p>
                  <AdSetStatus adset={a} />
                </div>
              </Link>
            ))}
          </div>
        ) : <p className="text-sm text-ink-400">No ads yet. Upload some assets, then <strong>Make ads</strong>.</p>}
      </section>
    </>
  );
}
