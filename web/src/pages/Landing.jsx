import { useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight, Check, ChevronDown, Menu, X, Sparkles, Palette, Mic, Captions, Music, CalendarClock, Eye, Pencil,
  Wand2, Link2, Rocket, Minus,
} from 'lucide-react';
import { Logo, PlatformIcon } from '../components/ui.jsx';
import PhoneDemo from '../components/PhoneDemo.jsx';
import { useCatalog, useSession } from '../lib.jsx';

const NAV = [
  ['#how', 'How it works'],
  ['#niches', 'Niches'],
  ['#features', 'Features'],
  ['#pricing', 'Pricing'],
  ['#faq', 'FAQ'],
];

function Nav() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map(([href, label]) => <a key={href} href={href} className="btn-ghost">{label}</a>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Link to="/app" className="btn-primary">Open dashboard <ArrowRight className="size-4" /></Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">Sign in</Link>
              <Link to="/signup" className="btn-primary">Start free</Link>
            </>
          )}
        </div>
        <button className="btn-ghost md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
      </div>
      {open && (
        <div className="border-t border-white/5 px-4 pb-4 md:hidden">
          {NAV.map(([href, label]) => <a key={href} href={href} onClick={() => setOpen(false)} className="block py-3 text-ink-300">{label}</a>)}
          <Link to={user ? '/app' : '/signup'} className="btn-primary mt-2 w-full">{user ? 'Open dashboard' : 'Start free'}</Link>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[140px]" />
        <div className="absolute top-40 right-0 h-[400px] w-[500px] rounded-full bg-hot-500/15 blur-[120px]" />
      </div>
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pb-28 lg:pt-20">
        <div className="min-w-0">
          <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-400">
            <Sparkles className="size-3.5" /> AI faceless video generator
          </span>
          <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl">
            Faceless videos that <span className="text-gradient">make — and post —</span> themselves.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
            Pick a niche. BlackCell writes the script, generates the visuals, records the voiceover, adds captions and music,
            then posts to TikTok, Instagram and YouTube on your schedule. <span className="text-white">Everything handled.</span>
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/signup" className="btn-primary px-6 py-3.5 text-base">Create your first video <ArrowRight className="size-4" /></Link>
            <a href="#how" className="btn-secondary px-6 py-3.5 text-base">See how it works</a>
          </div>
          <p className="mt-4 text-sm text-ink-400">Free to start · No editing skills · No camera · No credit card</p>
          <div className="mt-10 flex items-center gap-3 text-sm text-ink-400">
            <span>Auto-posts to</span>
            {['tiktok', 'instagram', 'youtube'].map((p) => <PlatformIcon key={p} platform={p} size="sm" />)}
          </div>
        </div>
        <div className="relative mx-auto flex items-end justify-center">
          <PhoneDemo demo={1} small className="absolute -left-16 bottom-10 hidden rotate-[-8deg] opacity-80 sm:block" />
          <PhoneDemo demo={0} className="relative z-10 animate-float" />
        </div>
      </div>
      <div className="relative border-y border-white/5 bg-ink-900/60">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 text-center sm:px-6 md:grid-cols-4">
          {[
            ['< 5 min', 'from idea to finished video'],
            ['3 platforms', 'TikTok, Reels & Shorts'],
            ['12 languages', 'with native-sounding voices'],
            ['24/7', 'autopilot posting'],
          ].map(([big, small]) => (
            <div key={big}>
              <p className="font-display text-3xl font-extrabold">{big}</p>
              <p className="mt-1 text-sm text-ink-400">{small}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Niches() {
  const catalog = useCatalog();
  const niches = catalog?.niches || [];
  const row = [...niches, ...niches];
  return (
    <section id="niches" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Niches</p>
        <h2 className="mt-3 max-w-2xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">A channel for every niche. Or invent your own.</h2>
        <p className="mt-4 max-w-2xl text-ink-300">Start from a proven faceless format, or describe any topic and BlackCell builds a series around it.</p>
      </div>
      <div className="relative mt-12 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        <div className="flex w-max animate-marquee gap-4 hover:[animation-play-state:paused]">
          {row.map((n, i) => (
            <div key={`${n.id}-${i}`} className="relative flex h-80 w-56 shrink-0 flex-col justify-between overflow-hidden rounded-3xl p-5" style={{ background: `linear-gradient(160deg, ${n.colors[0]}, ${n.colors[1]})` }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <span className="relative text-3xl">{n.emoji}</span>
              <div className="relative">
                <p className="font-display text-xl font-extrabold">{n.name}</p>
                <p className="mt-2 text-sm leading-snug text-white/80">“{n.hook}”</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Wand2, title: 'Pick a niche', body: 'Choose a proven format like scary stories or untold history, or type any topic you like.' },
    { icon: Palette, title: 'Choose the look & voice', body: 'Art style, narrator, captions, music, language and length. Preview voices before you commit.' },
    { icon: Link2, title: 'Connect & go autopilot', body: 'Link TikTok, Instagram and YouTube, set your posting days and time. New videos go out on their own.' },
  ];
  return (
    <section id="how" className="border-y border-white/5 bg-ink-900/40 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">How it works</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Three steps. Then never touch it again.</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="card relative overflow-hidden p-7">
              <span className="absolute -right-3 -top-6 font-display text-[120px] font-extrabold leading-none text-white/[0.04]">{i + 1}</span>
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-brand"><s.icon className="size-5" /></span>
              <h3 className="mt-6 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-ink-300">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { icon: Sparkles, title: 'Hook-first AI scripts', body: 'Written for retention: a hook in the first two seconds and a payoff at the end. A series never repeats a story.' },
    { icon: Palette, title: '10 art styles', body: 'Cinematic, anime, dark fantasy, comic book, watercolor, pixel art and more, generated fresh for every scene.' },
    { icon: Mic, title: 'Natural voiceovers', body: '8 narrator voices across 12 languages, from deep and dramatic to warm and upbeat.' },
    { icon: Captions, title: 'Animated captions', body: 'Word-by-word captions in four styles, because most people scroll with the sound off.' },
    { icon: Music, title: 'Background music', body: 'Mood-matched beds for suspense, epic or calm, or upload your own track.' },
    { icon: CalendarClock, title: 'Scheduled autopilot', body: 'Pick days, time and timezone. Videos render ahead of time and post right on schedule.' },
    { icon: Eye, title: 'Review mode', body: 'Prefer to approve first? Turn off auto-post and new videos wait in your library.' },
    { icon: Pencil, title: 'Edit anything', body: 'Rewrite a line, change a visual or swap the voice, then re-render in about a minute.' },
  ];
  return (
    <section id="features" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Features</p>
        <h2 className="mt-3 max-w-3xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">A whole content team, in one tab.</h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="card p-6 transition hover:border-white/15">
              <f.icon className="size-6 text-brand-400" />
              <h3 className="mt-5 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  const rows = [
    ['Research & scriptwriting', '1–2 hours', 'Seconds'],
    ['Finding or making visuals', 'An hour or more', 'Generated per scene'],
    ['Voiceover', 'Record, retake, clean up', '8 AI narrators'],
    ['Editing & captions', '1–2 hours', 'Automatic'],
    ['Posting to 3 platforms', 'Every day, by hand', 'On autopilot'],
    ['Consistency', 'Whenever you find time', 'Every scheduled slot'],
  ];
  return (
    <section className="border-y border-white/5 bg-ink-900/40 py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="text-center font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Stop editing. Start posting.</h2>
        <div className="card mt-12 overflow-hidden">
          <div className="grid grid-cols-[1.3fr_1fr_1fr] border-b border-white/8 bg-white/[0.02] text-sm font-semibold">
            <div className="p-4" />
            <div className="p-4 text-ink-400">Doing it yourself</div>
            <div className="p-4 text-gradient">With BlackCell</div>
          </div>
          {rows.map(([label, diy, us]) => (
            <div key={label} className="grid grid-cols-[1.3fr_1fr_1fr] border-b border-white/5 text-sm last:border-0">
              <div className="p-4 font-medium">{label}</div>
              <div className="flex items-center gap-2 p-4 text-ink-400"><Minus className="size-4 shrink-0 text-red-400/70" />{diy}</div>
              <div className="flex items-center gap-2 p-4"><Check className="size-4 shrink-0 text-emerald-400" />{us}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PricingCards({ onSelect, currentPlan, busyPlan }) {
  const catalog = useCatalog();
  const plans = catalog?.plans || [];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((p) => (
        <div key={p.id} className={`relative flex flex-col rounded-3xl border p-6 ${p.popular ? 'glow border-brand-500/50 bg-gradient-to-b from-brand-600/15 to-ink-900' : 'border-white/8 bg-ink-900/80'}`}>
          {p.popular && <span className="absolute -top-3 left-6 rounded-full bg-gradient-brand px-3 py-1 text-xs font-bold">Most popular</span>}
          <p className="font-display text-lg font-bold">{p.name}</p>
          <p className="mt-4 flex items-baseline gap-1">
            <span className="font-display text-5xl font-extrabold">${p.price}</span>
            <span className="text-sm text-ink-400">/month</span>
          </p>
          <ul className="mt-6 flex-1 space-y-3 text-sm">
            {p.features.map((f) => <li key={f} className="flex gap-2.5 text-ink-300"><Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />{f}</li>)}
          </ul>
          {onSelect ? (
            <button className={`${p.popular ? 'btn-primary' : 'btn-secondary'} mt-8 w-full`} disabled={currentPlan === p.id || busyPlan} onClick={() => onSelect(p.id)}>
              {currentPlan === p.id ? 'Current plan' : busyPlan === p.id ? 'Switching…' : `Switch to ${p.name}`}
            </button>
          ) : (
            <Link to="/signup" className={`${p.popular ? 'btn-primary' : 'btn-secondary'} mt-8 w-full`}>{p.price ? 'Get started' : 'Start free'}</Link>
          )}
        </div>
      ))}
    </div>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Pricing</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Grow on autopilot, from $0.</h2>
          <p className="mt-4 text-ink-300">Every plan includes every niche, art style, voice and platform. Upgrade when you're ready to post more.</p>
        </div>
        <div className="mt-14"><PricingCards /></div>
      </div>
    </section>
  );
}

const FAQS = [
  ['What is a faceless video?', "A short video where you never appear on camera: narration over visuals, with captions. It's one of the fastest ways to grow on TikTok, Reels and Shorts without showing your face."],
  ['Do I need any editing skills?', 'None. BlackCell writes, voices, illustrates, captions and edits every video. You can tweak the script if you want to, but you never have to.'],
  ['Which platforms can it post to?', 'TikTok, Instagram Reels and YouTube Shorts, through their official APIs. You connect each account once and pick which ones each series posts to.'],
  ['Can I review videos before they go live?', 'Yes. Turn off auto-post on a series and new videos wait in your library until you post them.'],
  ['Will my videos be unique?', 'Every script is written fresh, and each series remembers what it has already posted so it never repeats a story.'],
  ['Which languages are supported?', 'Twelve, including English, Spanish, French, German, Portuguese, Hindi, Japanese and Chinese. Scripts, voiceover and captions all switch together.'],
  ['Can I use my own music?', 'Yes. Upload a track when you set up a series, or pick one of the built-in mood beds.'],
  ['Do I own the videos?', 'Yes. Download any video as an MP4 whenever you like and use it anywhere.'],
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="border-t border-white/5 bg-ink-900/40 py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Questions, answered.</h2>
        <div className="mt-12 space-y-3">
          {FAQS.map(([q, a], i) => (
            <div key={q} className="card overflow-hidden">
              <button className="flex w-full items-center justify-between gap-4 p-5 text-left font-semibold" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                {q}
                <ChevronDown className={`size-5 shrink-0 text-ink-400 transition ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && <p className="-mt-1 px-5 pb-5 text-ink-300">{a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-brand p-10 text-center sm:p-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.25),transparent_40%)]" />
          <Rocket className="relative mx-auto size-10" />
          <h2 className="relative mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Your first video is five minutes away.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-white/85">Pick a niche, hit create, and watch BlackCell do the rest. Free to start.</p>
          <Link to="/signup" className="btn relative mt-8 bg-white px-7 py-3.5 text-base text-ink-950 hover:bg-white/90">Create your first video <ArrowRight className="size-4" /></Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-ink-400 sm:px-6">
        <Logo />
        <p>AI faceless video generator for TikTok, Reels & Shorts.</p>
        <p>© {new Date().getFullYear()} BlackCell</p>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <Niches />
      <HowItWorks />
      <Features />
      <Comparison />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}
