import { useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

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
