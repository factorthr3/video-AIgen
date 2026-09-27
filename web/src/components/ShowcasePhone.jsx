import { useRef, useState } from 'react';
import { Sparkles, Volume2, VolumeX } from 'lucide-react';

// A real BlackCell video in a phone frame: autoplays muted and loops (allowed
// by browsers), with an optional tap-for-sound toggle.
export default function ShowcasePhone({ src, poster, small = false, withSound = false, className = '' }) {
  const video = useRef(null);
  const [muted, setMuted] = useState(true);

  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) {
      v.currentTime = 0; // start from the hook when someone chooses to listen
      v.play().catch(() => {});
    }
    setMuted(v.muted);
  };

  return (
    <div className={`${small ? 'w-[180px]' : 'w-[260px] sm:w-[290px]'} ${className || 'relative'}`}>
      <div className="relative aspect-[9/16] overflow-hidden rounded-[2.4rem] border-[7px] border-ink-700 bg-black shadow-2xl shadow-black/60">
        <video
          ref={video}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload={small ? 'metadata' : 'auto'}
          className="absolute inset-0 size-full object-cover"
        />
        {withSound && (
          <button
            type="button"
            onClick={toggleSound}
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/75"
          >
            {muted ? <><VolumeX className="size-3.5" /> Tap for sound</> : <><Volume2 className="size-3.5" /> Sound on</>}
          </button>
        )}
      </div>
    </div>
  );
}

/** The home page showcase: Cleopatra up front with sound, the penguin tilted behind (from sm up). */
export function ShowcasePair({ caption = true }) {
  return (
    <div className="relative mx-auto flex flex-col items-center">
      <div className="relative flex items-end justify-center">
        <ShowcasePhone src="/showcase/penguin.mp4" poster="/showcase/penguin.jpg" small className="absolute -left-24 bottom-10 hidden rotate-[-8deg] opacity-80 sm:block" />
        <ShowcasePhone src="/showcase/cleopatra.mp4" poster="/showcase/cleopatra.jpg" withSound className="relative z-10" />
      </div>
      {caption && <p className="chip mt-6 text-center"><Sparkles className="size-3.5 text-brand-400" /> Real BlackCell videos: script, visuals, voice and edit, all made automatically</p>}
    </div>
  );
}

/** The home page hero's glow, behind a showcase. */
export function ShowcaseGlow() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[140px]" />
      <div className="absolute top-40 right-0 h-[400px] w-[500px] rounded-full bg-hot-500/15 blur-[120px]" />
    </div>
  );
}
