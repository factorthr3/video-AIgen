import { useState } from 'react';
import { Download, LoaderCircle, TriangleAlert, Check, Copy, Play } from 'lucide-react';
import { ProgressBar } from './ui.jsx';

export const ASPECT = { '9:16': 'aspect-[9/16]', '4:5': 'aspect-[4/5]', '1:1': 'aspect-square', '16:9': 'aspect-video' };
// Grid column spans so formats sit side by side at sensible sizes.
export const FORMAT_WIDTH = { '9:16': 'w-[150px] sm:w-[170px]', '4:5': 'w-[190px] sm:w-[215px]', '1:1': 'w-[215px] sm:w-[240px]', '16:9': 'w-[300px] sm:w-[380px]' };

/** A small outline of a format's shape. */
export function FormatIcon({ format, className = '' }) {
  const [w, h] = format.split(':').map(Number);
  const scale = 18 / Math.max(w, h);
  return <span className={`inline-block rounded-[3px] border-2 border-current ${className}`} style={{ width: w * scale, height: h * scale }} />;
}

export function AdSetStatus({ adset }) {
  if (adset.status === 'ready') return <span className="chip border-emerald-500/30 bg-emerald-500/10 text-emerald-300">Ready{adset.error ? ' (some failed)' : ''}</span>;
  if (adset.status === 'failed') return <span className="chip border-red-500/30 bg-red-500/10 text-red-300">Failed</span>;
  return <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-300"><LoaderCircle className="size-3 animate-spin" /> Making ads</span>;
}

export function AdSetProgress({ adset }) {
  if (!['queued', 'processing'].includes(adset.status)) return null;
  return (
    <div className="card mb-8 p-5">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium"><LoaderCircle className="size-4 animate-spin text-brand-400" /> {adset.stage || 'Queued'}</span>
        <span className="text-ink-400">{adset.ads.ready} of {adset.ads.total || '…'} ads ready</span>
      </div>
      <ProgressBar value={adset.progress || 0} />
      <p className="mt-3 text-xs text-ink-400">Ads appear below as they finish. You can leave this page; they keep rendering.</p>
    </div>
  );
}

/** One ad: a preview in its format, the platforms it suits, and a download. */
export function AdCard({ ad, label }) {
  const [playing, setPlaying] = useState(false);
  const ready = ad.status === 'ready';
  return (
    <div className={`shrink-0 ${FORMAT_WIDTH[ad.format]}`}>
      <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-ink-800 ${ASPECT[ad.format]}`}>
        {ready && ad.kind === 'video' && playing && (
          <video src={ad.file} poster={ad.thumb} controls autoPlay playsInline className="absolute inset-0 size-full bg-black object-contain" />
        )}
        {ready && !(ad.kind === 'video' && playing) && (
          <button type="button" className="group absolute inset-0" onClick={() => (ad.kind === 'video' ? setPlaying(true) : window.open(ad.file, '_blank'))} title={ad.kind === 'video' ? 'Play' : 'Open full size'}>
            <img src={ad.thumb} alt="" loading="lazy" className="size-full object-cover" />
            {ad.kind === 'video' && (
              <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/20">
                <span className="grid size-11 place-items-center rounded-full bg-black/55 backdrop-blur"><Play className="ml-0.5 size-5 fill-white" /></span>
              </span>
            )}
          </button>
        )}
        {!ready && (
          <div className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-ink-300">
            {ad.status === 'failed'
              ? <span><TriangleAlert className="mx-auto mb-1 size-5 text-red-300" />{ad.error || 'Failed'}</span>
              : <span><LoaderCircle className="mx-auto mb-1 size-5 animate-spin text-brand-400" />{ad.status === 'processing' ? 'Rendering…' : 'Queued'}</span>}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label || ad.format}</p>
          <p className="truncate text-xs text-ink-400" title={ad.platforms.join(', ')}>{ad.platforms.join(' · ')}</p>
        </div>
        {ready && (
          <a href={ad.download} className="btn-ghost shrink-0 p-1.5 text-ink-300 hover:text-white" title="Download" download>
            <Download className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}

const FORMAT_ORDER = ['9:16', '4:5', '1:1', '16:9'];

/** Groups ads into rows: one per video length, one per image variant (vertical formats first). */
export function AdGroups({ items }) {
  const groups = [];
  const sorted = [...items].sort((a, b) => FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format));
  for (const ad of sorted) {
    const key = ad.kind === 'video' ? `v${ad.length}` : `i${ad.variant}`;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, title: ad.kind === 'video' ? `${ad.length}-second video` : `Image ad ${ad.variant + 1}`, ads: [] }));
    g.ads.push(ad);
  }
  return groups.map((g) => (
    <section key={g.key} className="mb-10">
      <h2 className="mb-4 font-display text-lg font-bold">{g.title}</h2>
      <div className="-mx-4 flex items-end gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {g.ads.map((ad) => <AdCard key={ad.id} ad={ad} />)}
      </div>
    </section>
  ));
}

export function CopyButton({ text, className = '' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn-ghost p-1.5 text-ink-400 hover:text-white ${className}`}
      title="Copy"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
    </button>
  );
}

const CAPTION_LABELS = [
  ['primaryText', 'Meta primary text'],
  ['headline', 'Meta headline'],
  ['description', 'Meta description'],
  ['tiktok', 'TikTok caption'],
  ['youtubeTitle', 'YouTube title'],
  ['linkedin', 'LinkedIn'],
];

/** Ready-to-paste post copy for each platform. */
export function Captions({ captions }) {
  if (!captions) return null;
  const tags = (captions.hashtags || []).map((h) => `#${h}`).join(' ');
  return (
    <div className="card divide-y divide-white/5">
      {CAPTION_LABELS.filter(([k]) => captions[k]).map(([k, label]) => (
        <div key={k} className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
            <p className="mt-1 whitespace-pre-line text-sm">{captions[k]}</p>
          </div>
          <CopyButton text={captions[k]} />
        </div>
      ))}
      {tags && (
        <div className="flex items-start justify-between gap-3 p-4">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Hashtags</p><p className="mt-1 text-sm">{tags}</p></div>
          <CopyButton text={tags} />
        </div>
      )}
    </div>
  );
}
