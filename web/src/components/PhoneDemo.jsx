import { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Music2 } from 'lucide-react';

// A looping, fully client-side imitation of a finished BlackCell video: gradient
// "scenes" with Ken Burns motion and karaoke captions.
const DEMOS = [
  {
    handle: '@untoldhistory',
    caption: 'The war the birds won 🪶 #history #emuwar',
    scenes: [
      { colors: ['#78350f', '#f59e0b', '#1c1917'], text: 'In 1932, Australia went to war.' },
      { colors: ['#451a03', '#b45309', '#0c0a09'], text: 'The enemy? Twenty thousand emus.' },
      { colors: ['#292524', '#a16207', '#0c0a09'], text: 'The army brought machine guns.' },
      { colors: ['#7c2d12', '#fb923c', '#1c1917'], text: 'The emus won.' },
    ],
  },
  {
    handle: '@nightshiftstories',
    caption: 'Never answer room 313 👻 #scarystories',
    scenes: [
      { colors: ['#020617', '#312e81', '#000000'], text: 'At 3 a.m., the phone rang.' },
      { colors: ['#1e1b4b', '#7f1d1d', '#020617'], text: 'It was room 313.' },
      { colors: ['#0f172a', '#4c1d95', '#000000'], text: "That room has been sealed since 1987." },
    ],
  },
];

const WORD_MS = 330;

function Scene({ colors, active }) {
  return (
    <div className={`absolute inset-0 transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`}>
      <div
        className="absolute -inset-[10%] animate-kenburns"
        style={{ background: `radial-gradient(circle at 70% 25%, ${colors[1]}cc 0 8%, transparent 9%), radial-gradient(ellipse at 50% 120%, ${colors[1]} 0, transparent 60%), linear-gradient(180deg, ${colors[0]}, ${colors[2]})` }}
      />
      {/* layered silhouette hills */}
      <svg className="absolute inset-x-0 bottom-0 h-1/2 w-full" viewBox="0 0 100 50" preserveAspectRatio="none">
        <path d="M0 30 Q15 18 30 26 T60 22 T100 26 V50 H0Z" fill="#000" opacity=".35" />
        <path d="M0 38 Q20 28 40 34 T75 31 T100 36 V50 H0Z" fill="#000" opacity=".55" />
      </svg>
    </div>
  );
}

export default function PhoneDemo({ demo = 0, className = '', small = false }) {
  const d = DEMOS[demo % DEMOS.length];
  const words = useMemo(() => d.scenes.flatMap((s, si) => s.text.split(' ').map((w) => ({ w, si }))), [d]);
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % (words.length + 3)), WORD_MS);
    return () => clearInterval(t);
  }, [words.length]);

  const idx = Math.min(i, words.length - 1);
  const scene = words[idx].si;
  // Show a 3-word window around the active word, within the current scene.
  const sceneWords = words.filter((x) => x.si === scene);
  const pos = sceneWords.indexOf(words[idx]);
  const start = Math.floor(pos / 3) * 3;
  const chunk = sceneWords.slice(start, start + 3);

  return (
    <div className={`${small ? 'w-[190px]' : 'w-[270px] sm:w-[300px]'} ${className || 'relative'}`}>
      <div className="relative aspect-[9/19] overflow-hidden rounded-[2.6rem] border-[7px] border-ink-700 bg-black shadow-2xl shadow-black/60">
        {d.scenes.map((s, si) => <Scene key={si} colors={s.colors} active={si === scene} />)}
        <div className="absolute inset-x-0 top-0 flex justify-center gap-4 pt-7 text-[11px] font-semibold text-white/70">
          <span>Following</span>
          <span className="text-white underline decoration-2 underline-offset-8">For You</span>
        </div>
        <div className="absolute left-3 right-12 top-[56%] flex flex-wrap justify-center gap-x-3 gap-y-1 text-center">
          {chunk.map((x, k) => (
            <span
              key={`${scene}-${start}-${k}`}
              className={`font-display font-extrabold uppercase leading-none tracking-tight transition-transform duration-150 ${small ? 'text-base' : 'text-[22px]'} ${x === words[idx] ? 'scale-105 text-yellow-300' : 'text-white'}`}
              style={{ WebkitTextStroke: small ? '1px #000' : '1.5px #000', textShadow: '0 3px 8px rgba(0,0,0,.6)' }}
            >
              {x.w}
            </span>
          ))}
        </div>
        <div className="absolute bottom-24 right-2.5 flex flex-col items-center gap-4 text-white">
          {[Heart, MessageCircle, Bookmark, Share2].map((Icon, k) => <Icon key={k} className={`${small ? 'size-5' : 'size-6'} drop-shadow`} />)}
        </div>
        <div className="absolute inset-x-3 bottom-5 text-left text-white">
          <p className="text-xs font-bold">{d.handle}</p>
          <p className="mt-1 line-clamp-2 text-[11px] text-white/85">{d.caption}</p>
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-white/70"><Music2 className="size-3" /> original sound · BlackCell</p>
        </div>
      </div>
    </div>
  );
}
