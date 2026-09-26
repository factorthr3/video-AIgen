import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Camera, Music2, Play, LoaderCircle, CircleCheck, TriangleAlert, Clock, Pause, Volume2 } from 'lucide-react';

export function Logo({ to = '/', className = '' }) {
  return (
    <Link to={to} className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-brand shadow-lg shadow-hot-500/30">
        <Play className="size-4 fill-white text-white" />
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight">Nrrtv</span>
    </Link>
  );
}

const PLATFORM_STYLE = {
  tiktok: { icon: Music2, className: 'bg-black ring-1 ring-white/15 text-cyan-300', label: 'TikTok' },
  youtube: { icon: Play, className: 'bg-red-600 text-white', label: 'YouTube Shorts' },
  instagram: { icon: Camera, className: 'bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600 text-white', label: 'Instagram Reels' },
};

export function PlatformIcon({ platform, size = 'md' }) {
  const p = PLATFORM_STYLE[platform] || PLATFORM_STYLE.tiktok;
  const Icon = p.icon;
  const dims = size === 'sm' ? 'size-6 rounded-md' : size === 'lg' ? 'size-12 rounded-2xl' : 'size-9 rounded-xl';
  const icon = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-6' : 'size-4.5';
  return (
    <span className={`grid shrink-0 place-items-center ${dims} ${p.className}`} title={p.label}>
      <Icon className={`${icon} ${platform === 'youtube' ? 'fill-white' : ''}`} />
    </span>
  );
}
export const platformLabel = (p) => PLATFORM_STYLE[p]?.label || p;

export function StatusBadge({ video }) {
  if (video.status === 'ready') {
    return <span className="chip border-emerald-500/30 bg-emerald-500/10 text-emerald-300"><CircleCheck className="size-3.5" /> Ready</span>;
  }
  if (video.status === 'failed') {
    return <span className="chip border-red-500/30 bg-red-500/10 text-red-300"><TriangleAlert className="size-3.5" /> Failed</span>;
  }
  if (video.status === 'queued') {
    return <span className="chip"><Clock className="size-3.5" /> Queued</span>;
  }
  return (
    <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-400">
      <LoaderCircle className="size-3.5 animate-spin" /> {Math.round((video.progress || 0) * 100)}%
    </span>
  );
}

export function ProgressBar({ value, className = '' }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div className="h-full rounded-full bg-gradient-brand transition-all duration-700" style={{ width: `${Math.max(3, (value || 0) * 100)}%` }} />
    </div>
  );
}

export function Spinner({ className = 'size-5' }) {
  return <LoaderCircle className={`animate-spin text-ink-400 ${className}`} />;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {Icon && <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-white/5"><Icon className="size-6 text-brand-400" /></span>}
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {children && <p className="mt-2 max-w-md text-sm text-ink-400">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({ tone = 'error', children, onClose }) {
  const tones = {
    error: 'border-red-500/30 bg-red-500/10 text-red-200',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    info: 'border-brand-500/30 bg-brand-500/10 text-brand-200',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  };
  return (
    <div className={`mb-6 flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      <div>{children}</div>
      {onClose && <button className="text-xs opacity-70 hover:opacity-100" onClick={onClose}>Dismiss</button>}
    </div>
  );
}

/** Vertical thumbnail with status overlay for a video. */
export function VideoThumb({ video, className = '' }) {
  const ready = video.status === 'ready';
  return (
    <div className={`relative aspect-[9/16] overflow-hidden rounded-xl bg-ink-800 ${className}`}>
      {ready ? (
        <img src={`/api/videos/${video.id}/thumb?v=${encodeURIComponent(video.updatedAt)}`} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/30 via-ink-800 to-hot-500/20" />
      )}
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
          {video.status === 'failed' ? <TriangleAlert className="size-7 text-red-300" /> : <LoaderCircle className="size-7 animate-spin text-white/80" />}
          <p className="text-xs font-medium text-white/80">{video.status === 'failed' ? 'Failed' : video.stage || 'Queued'}</p>
          {video.status !== 'failed' && <ProgressBar value={video.progress} className="w-3/4" />}
        </div>
      )}
    </div>
  );
}

/** Tiny play/pause button for audio previews. */
export function AudioPreview({ src, label = 'Preview' }) {
  const audio = useRef(null);
  const [state, setState] = useState('idle');
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = async (e) => {
    e.stopPropagation();
    if (state === 'playing') {
      audio.current.pause();
      setState('idle');
      return;
    }
    // Only one preview plays at a time across the page.
    window.dispatchEvent(new CustomEvent('nrrtv:preview'));
    setState('loading');
    audio.current = new Audio(src);
    audio.current.onended = () => setState('idle');
    const stop = () => { audio.current?.pause(); setState('idle'); };
    window.addEventListener('nrrtv:preview', stop, { once: true });
    try {
      await audio.current.play();
      setState('playing');
    } catch {
      setState('idle');
    }
  };
  return (
    <button type="button" onClick={toggle} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-ink-300 hover:bg-white/10 hover:text-white">
      {state === 'loading' ? <LoaderCircle className="size-3.5 animate-spin" /> : state === 'playing' ? <Pause className="size-3.5" /> : <Volume2 className="size-3.5" />}
      {state === 'playing' ? 'Stop' : label}
    </button>
  );
}
