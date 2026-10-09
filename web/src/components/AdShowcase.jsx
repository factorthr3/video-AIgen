import { useRef, useState } from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';

// Example ads BlackCell made for a demo brand (Northwind) from two short clips, product photos and a logo.
export function ShowcaseGlow() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[140px]" />
      <div className="absolute top-40 right-0 h-[400px] w-[500px] rounded-full bg-hot-500/15 blur-[120px]" />
    </div>
  );
}

function VerticalAd() {
  const video = useRef(null);
  const [muted, setMuted] = useState(true);
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    setMuted(v.muted);
  };
  return (
    <div className="relative z-10 w-[230px] sm:w-[260px]">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[2.2rem] border-[7px] border-ink-700 bg-black shadow-2xl shadow-black/60">
        <video ref={video} src="/showcase/ad-vertical.mp4" poster="/showcase/ad-vertical.jpg" autoPlay muted loop playsInline preload="auto" className="absolute inset-0 size-full object-cover" />
        <button type="button" onClick={toggle} className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/75">
          {muted ? <><VolumeX className="size-3.5" /> Sound</> : <><Volume2 className="size-3.5" /> On</>}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-ink-400">9:16 · TikTok, Reels, Shorts</p>
    </div>
  );
}

/** The hero showcase: one brief, every format. */
export function AdShowcase({ caption = true }) {
  return (
    <div className="relative mx-auto flex flex-col items-center">
      <div className="relative flex items-center justify-center">
        <figure className="absolute -left-36 top-10 hidden w-[200px] -rotate-6 sm:block">
          <img src="/showcase/ad-portrait.jpg" alt="Example 4:5 image ad" className="rounded-2xl border border-white/10 shadow-2xl shadow-black/50" loading="lazy" />
          <figcaption className="mt-2 text-center text-xs text-ink-400">4:5 · Feed</figcaption>
        </figure>
        <figure className="absolute -right-36 top-24 hidden w-[200px] rotate-6 sm:block">
          <img src="/showcase/ad-square.jpg" alt="Example 1:1 image ad" className="rounded-2xl border border-white/10 shadow-2xl shadow-black/50" loading="lazy" />
          <figcaption className="mt-2 text-center text-xs text-ink-400">1:1 · Promo style</figcaption>
        </figure>
        <VerticalAd />
      </div>
      {caption && (
        <p className="chip mt-6 text-center"><Sparkles className="size-3.5 text-brand-400" /> Example ads for a demo coffee brand, made from two short clips, product photos and a logo</p>
      )}
    </div>
  );
}

/** Landscape example, for wider layouts: a 30-second 16:9 ad BlackCell made for Caprivi (car seat covers) from their footage. */
export function LandscapeAd() {
  return (
    <figure className="w-full">
      <video src="/showcase/ad-landscape.mp4" poster="/showcase/ad-landscape.jpg" autoPlay muted loop playsInline preload="metadata" className="aspect-video w-full rounded-2xl border border-white/10 bg-black object-cover shadow-2xl shadow-black/50" />
      <figcaption className="mt-2 text-center text-xs text-ink-400">16:9 · YouTube, LinkedIn, X</figcaption>
    </figure>
  );
}
