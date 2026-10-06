import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Sparkles, Check, Upload, Film, Music2 } from 'lucide-react';
import { PageHeader, Alert, Spinner, EmptyState, AudioPreview } from '../components/ui.jsx';
import { FormatIcon } from '../components/ads.jsx';
import { BrandLogo } from './Brands.jsx';
import { FONT_CSS } from './BrandDetail.jsx';
import { api, useApi, useCatalog, useSession } from '../lib.jsx';

const DRAFT = 'blackcell:adset-draft';
const readDraft = () => {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT) || 'null');
  } catch {
    return null;
  }
};

function Section({ title, hint, children }) {
  return (
    <section className="card mb-6 p-6">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {hint && <p className="mb-4 mt-1 text-sm text-ink-400">{hint}</p>}
      <div className={hint ? '' : 'mt-4'}>{children}</div>
    </section>
  );
}

/** A tiny mock-up of each style, in the brand's colours. */
function StylePreview({ style, colors, font, photo: photoUrl }) {
  const primary = colors[0] || '#7c3aed';
  const accent = colors[1] || primary;
  const photo = photoUrl ? `center / cover no-repeat url("${photoUrl}")` : 'linear-gradient(160deg, #a8896c, #4b3a2d 70%)';
  const fontCss = style === 'luxury' ? FONT_CSS.playfair : style === 'promo' ? FONT_CSS.bebas : style === 'bold' ? FONT_CSS.montserrat : FONT_CSS[font] || FONT_CSS.montserrat;
  return (
    <span className="relative block aspect-[4/5] overflow-hidden rounded-lg" style={{ background: photo }}>
      {style === 'clean' && <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />}
      {style === 'luxury' && <span className="absolute inset-0" style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.2), rgba(0,0,0,0.75))' }} />}
      {style === 'bold' && <span className="absolute inset-0 bg-black/30" />}
      {style === 'promo' && <span className="absolute right-2 top-2 grid size-9 rotate-[-8deg] place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: accent, ...FONT_CSS.bebas }}>20% OFF</span>}
      <span className={`absolute inset-x-2 ${style === 'clean' || style === 'promo' ? 'bottom-3' : 'top-1/2 -translate-y-1/2'} ${style === 'clean' ? 'text-left' : 'text-center'}`}>
        <span className={`inline-block text-[13px] leading-tight text-white ${style === 'bold' || style === 'promo' ? 'uppercase' : ''}`} style={{ ...fontCss, ...(style === 'bold' ? { background: primary, padding: '1px 5px', borderRadius: 3 } : {}) }}>
          {style === 'luxury' ? 'Crafted slowly' : style === 'promo' ? 'Summer sale' : style === 'bold' ? 'Made to last' : 'Made to last'}
        </span>
      </span>
    </span>
  );
}

export default function AdSetNew() {
  const catalog = useCatalog();
  const { usage, refresh } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: brandList } = useApi('/brands');
  const draft = useMemo(readDraft, []);
  const [brandId, setBrandId] = useState(params.get('brand') || draft?.brandId || '');
  const { data: brandData } = useApi(brandId ? `/brands/${brandId}` : null);
  const [brief, setBrief] = useState(draft?.brief || { product: '', description: '', offer: '', cta: '', url: '', audience: '' });
  const [options, setOptions] = useState(draft?.options || { style: 'clean', formats: ['9:16', '4:5', '1:1', '16:9'], lengths: [15], statics: 2, voiceover: false, voice: 'nova', music: 'ai', musicMood: 'auto', language: 'en' });
  const [assetIds, setAssetIds] = useState(null); // null = all
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [musicName, setMusicName] = useState(null);
  const musicRef = useRef(null);

  useEffect(() => {
    if (!brandId && brandList?.brands?.length) setBrandId(brandList.brands[0].id);
  }, [brandList]); // eslint-disable-line react-hooks/exhaustive-deps
  // Composed soundtracks need ElevenLabs on the server; otherwise start on a music bed.
  const soundtrackReady = Boolean(catalog?.providers?.music?.provider);
  useEffect(() => {
    if (catalog && !soundtrackReady && options.music === 'ai') setOptions((o) => ({ ...o, music: 'bright-pluck' }));
  }, [catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (brandData?.brand?.website && !brief.url) setBrief((b) => ({ ...b, url: brandData.brand.website }));
    setAssetIds(null);
  }, [brandData?.brand?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify({ brandId, brief, options }));
    } catch {
      // storage unavailable
    }
  }, [brandId, brief, options]);

  if (!catalog || !brandList) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  if (!brandList.brands.length) {
    return (
      <>
        <PageHeader title="New ads" />
        <EmptyState title="Set up a brand first" action={<Link to="/app/brands" className="btn-primary">Go to brands</Link>}>Ads are made from a brand's logo, colours and assets.</EmptyState>
      </>
    );
  }
  const brand = brandData?.brand;
  const assets = (brandData?.assets || []).filter((a) => a.status === 'ready');
  const selected = assetIds || assets.map((a) => a.id);
  // Style previews use the brand's own best photo.
  const previewAsset = [...assets].filter((a) => a.kind === 'image' && !a.transparent).sort((x, y) => (y.quality || 0) - (x.quality || 0))[0];
  const previewPhoto = previewAsset && `/api/assets/${previewAsset.id}/thumb`;
  const setB = (k) => (e) => setBrief((b) => ({ ...b, [k]: e.target.value }));
  const setO = (k, v) => setOptions((o) => ({ ...o, [k]: v }));
  const toggle = (k, v) => setOptions((o) => ({ ...o, [k]: o[k].includes(v) ? o[k].filter((x) => x !== v) : [...o[k], v] }));
  const videos = options.lengths.length * options.formats.length;
  const images = options.statics * options.formats.length;
  const atLimit = usage && !usage.needsPlan && usage.adsetsUsed >= usage.adsetsLimit;

  const uploadMusic = async (file) => {
    if (!file) return;
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api('/uploads/music', { method: 'POST', form });
      setO('music', res.id);
      setMusicName(res.name);
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api('/adsets', {
        method: 'POST',
        body: { brandId, brief, options: { ...options, assetIds: assetIds || [] } },
      });
      sessionStorage.removeItem(DRAFT);
      await refresh();
      navigate(`/app/adsets/${res.adset.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <PageHeader title="New ads" subtitle="Describe what you're selling. BlackCell writes the copy, picks your best shots and makes ads for every platform." />
      {usage?.needsPlan && <Alert tone="warn">Choose a plan on <Link to="/app/billing" className="underline">Plan &amp; billing</Link> to make ads.</Alert>}
      {atLimit && <Alert tone="warn">You've made all {usage.adsetsLimit} ad sets in your plan this month. <Link to="/app/billing" className="underline">Upgrade</Link> to make more.</Alert>}

      <Section title="Brand">
        <div className="flex flex-wrap gap-3">
          {brandList.brands.map((b) => (
            <button key={b.id} type="button" data-selected={brandId === b.id} className="option flex items-center gap-3 p-3 pr-5" onClick={() => setBrandId(b.id)}>
              <BrandLogo brand={b} className="size-9" />
              <span className="font-semibold">{b.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="The brief" hint="This is the source for every line of copy. Be specific about what's great about it.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="product">Product or service</label>
            <input id="product" className="input" required maxLength={120} value={brief.product} onChange={setB('product')} placeholder="e.g. Northwind Cold Brew" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="desc">Description</label>
            <textarea id="desc" className="input min-h-28" required minLength={20} maxLength={2000} value={brief.description} onChange={setB('description')} placeholder="What it is, who it's for, the benefits, what makes it different. Only include claims you can stand behind: the copy won't invent any." />
          </div>
          <div>
            <label className="label" htmlFor="offer">Offer <span className="normal-case text-ink-400">(optional)</span></label>
            <input id="offer" className="input" maxLength={120} value={brief.offer} onChange={setB('offer')} placeholder="e.g. 20% off your first order" />
          </div>
          <div>
            <label className="label" htmlFor="cta">Call to action <span className="normal-case text-ink-400">(optional)</span></label>
            <input id="cta" className="input" maxLength={30} value={brief.cta} onChange={setB('cta')} placeholder="e.g. Shop now" />
          </div>
          <div>
            <label className="label" htmlFor="url">Link</label>
            <input id="url" className="input" maxLength={200} value={brief.url} onChange={setB('url')} placeholder="yourbrand.com/product" />
          </div>
          <div>
            <label className="label" htmlFor="aud">Audience <span className="normal-case text-ink-400">(optional)</span></label>
            <input id="aud" className="input" maxLength={300} value={brief.audience} onChange={setB('audience')} placeholder="e.g. Busy professionals who love good coffee" />
          </div>
        </div>
      </Section>

      <Section title="Assets" hint={assets.length ? 'The ads use these. Untick any you want left out.' : null}>
        {!brandData ? <Spinner /> : assets.length ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
            {assets.map((a) => {
              const on = selected.includes(a.id);
              return (
                <button key={a.id} type="button" onClick={() => setAssetIds(on ? selected.filter((x) => x !== a.id) : [...selected, a.id])} className={`relative aspect-square overflow-hidden rounded-xl border-2 transition ${on ? 'border-brand-400' : 'border-transparent opacity-45'}`} title={a.description || a.name}>
                  <img src={`/api/assets/${a.id}/thumb`} alt="" className={`size-full ${a.transparent ? 'bg-ink-700 object-contain p-1' : 'object-cover'}`} />
                  {a.kind === 'video' && <Film className="absolute bottom-1.5 left-1.5 size-4 drop-shadow" />}
                  {on && <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-brand-500"><Check className="size-3.5" /></span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink-300">This brand has no photos or videos yet. <Link to={`/app/brands/${brandId}`} className="font-semibold text-white underline">Upload some</Link> first.</p>
        )}
      </Section>

      <Section title="Style">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {catalog.styles.map((s) => (
            <button key={s.id} type="button" data-selected={options.style === s.id} className="option p-2.5 text-left" onClick={() => setO('style', s.id)}>
              <StylePreview style={s.id} colors={brand?.colors || []} font={brand?.font} photo={previewPhoto} />
              <p className="mt-2 px-1 text-sm font-semibold">{s.name}</p>
              <p className="px-1 text-xs leading-snug text-ink-400">{s.description}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Formats and lengths">
        <p className="label">Formats</p>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.formats.map((f) => (
            <button key={f.id} type="button" data-selected={options.formats.includes(f.id)} className="option flex items-start gap-3 p-3 text-left" onClick={() => toggle('formats', f.id)}>
              <span className="grid size-8 shrink-0 place-items-center text-brand-300"><FormatIcon format={f.id} /></span>
              <span><span className="block text-sm font-semibold">{f.name}</span><span className="block text-xs text-ink-400">{f.platforms.join(', ')}</span></span>
            </button>
          ))}
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="label">Video lengths</p>
            <div className="flex gap-2">
              {catalog.lengths.map((l) => (
                <button key={l} type="button" data-selected={options.lengths.includes(l)} className="option px-5 py-2.5 text-sm font-semibold" onClick={() => toggle('lengths', l)}>{l}s</button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Image ads</p>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((n) => (
                <button key={n} type="button" data-selected={options.statics === n} className="option px-5 py-2.5 text-sm font-semibold" onClick={() => setO('statics', n)}>{n === 0 ? 'None' : n}</button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Sound">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="label">Music</p>
            {soundtrackReady && (
              <div role="button" tabIndex={0} data-selected={options.music === 'ai'} className="option mb-3 p-4" onClick={() => setO('music', 'ai')} onKeyDown={(e) => e.key === 'Enter' && setO('music', 'ai')}>
                <p className="flex items-center gap-2 font-semibold"><Music2 className="size-4 text-brand-400" /> AI soundtrack <span className="chip py-0 text-[10px] uppercase">Recommended</span></p>
                <p className="mt-1 text-xs text-ink-400">An original instrumental track composed for each video at its exact length, by ElevenLabs Music. Cleared for use in ads.</p>
                {options.music === 'ai' && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(catalog.musicMoods || []).map((m) => (
                      <button key={m.id} type="button" onClick={(e) => { e.stopPropagation(); setO('musicMood', m.id); }} className={`rounded-full px-3 py-1 text-xs font-medium transition ${options.musicMood === m.id ? 'bg-white text-ink-950' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>{m.name}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {soundtrackReady && <p className="mb-2 text-xs text-ink-400">Or a stock track:</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {catalog.music.map((m) => (
                <div key={m.id} role="button" tabIndex={0} data-selected={options.music === m.id} className="option flex items-center justify-between gap-2 p-3" onClick={() => setO('music', m.id)} onKeyDown={(e) => e.key === 'Enter' && setO('music', m.id)}>
                  <span className="text-sm font-semibold">{m.name}</span>
                  {m.id !== 'none' && <AudioPreview src={`/api/music/${m.id}/preview`} label="Play" />}
                </div>
              ))}
              <button type="button" data-selected={options.music.startsWith('upload:')} className="option flex items-center gap-2 p-3 text-left" onClick={() => musicRef.current?.click()}>
                <Upload className="size-4 shrink-0 text-brand-400" />
                <span className="min-w-0"><span className="block text-sm font-semibold">Your own track</span><span className="block truncate text-xs text-ink-400">{options.music.startsWith('upload:') ? musicName || 'Uploaded' : 'MP3, WAV or M4A you have rights to'}</span></span>
              </button>
              <input ref={musicRef} type="file" accept="audio/*" className="hidden" onChange={(e) => uploadMusic(e.target.files?.[0])} />
            </div>
          </div>
          <div>
            <label className="mb-3 flex w-fit cursor-pointer items-center gap-2.5 text-sm font-semibold">
              <input type="checkbox" className="size-4 accent-brand-500" checked={options.voiceover} onChange={(e) => setO('voiceover', e.target.checked)} />
              Add a voiceover
            </label>
            <p className="mb-3 text-xs text-ink-400">Off by default: most brand ads use on-screen text and music. Turn it on for a natural, human-sounding narrator.</p>
            {options.voiceover && (
              <>
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  {catalog.voices.map((v) => (
                    <div key={v.id} role="button" tabIndex={0} data-selected={options.voice === v.id} className="option flex items-center justify-between gap-2 p-2.5" onClick={() => setO('voice', v.id)} onKeyDown={(e) => e.key === 'Enter' && setO('voice', v.id)}>
                      <span><span className="block text-sm font-semibold">{v.name}</span><span className="block text-xs text-ink-400">{v.description}</span></span>
                      <AudioPreview src={`/api/voices/${v.id}/preview?language=${options.language}`} label="Play" />
                    </div>
                  ))}
                </div>
              </>
            )}
            <label className="label" htmlFor="lang">Language</label>
            <select id="lang" className="input" value={options.language} onChange={(e) => setO('language', e.target.value)}>
              {catalog.languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      </Section>

      {error && <Alert>{error}</Alert>}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink-900/90 p-4 backdrop-blur">
        <p className="text-sm text-ink-300">
          <strong className="text-white">{videos} video{videos === 1 ? '' : 's'}</strong> and <strong className="text-white">{images} image ad{images === 1 ? '' : 's'}</strong>, ready in about {Math.max(2, Math.round(videos * 0.9 + images * 0.1 + 1))} minutes
        </p>
        <button className="btn-primary px-6 py-3" disabled={busy || !assets.length || (!videos && !images) || usage?.needsPlan || atLimit}>
          <Sparkles className="size-4" /> {busy ? 'Starting…' : 'Make the ads'}
        </button>
      </div>
    </form>
  );
}
