import { useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight, Check, ChevronDown, Menu, X, Sparkles, Upload, FileText, Share2, Palette, Crop, Type, Link2,
  Mic, Images, ShieldCheck, Rocket, Minus, Store,
} from 'lucide-react';
import { Logo } from '../components/ui.jsx';
import { AdShowcase, ShowcaseGlow, LandscapeAd } from '../components/AdShowcase.jsx';
import { useCatalog, useSession, usePrice, formatPrice } from '../lib.jsx';

const NAV = [
  ['#how', 'How it works'],
  ['#formats', 'Formats'],
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
              <Link to="/signup" className="btn-primary">Get started</Link>
            </>
          )}
        </div>
        <button className="btn-ghost md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
      </div>
      {open && (
        <div className="border-t border-white/5 px-4 pb-4 md:hidden">
          {NAV.map(([href, label]) => <a key={href} href={href} onClick={() => setOpen(false)} className="block py-3 text-ink-300">{label}</a>)}
          <Link to={user ? '/app' : '/signup'} className="btn-primary mt-2 w-full">{user ? 'Open dashboard' : 'Get started'}</Link>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const price = usePrice();
  return (
    <section className="relative overflow-hidden">
      <ShowcaseGlow />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pb-28 lg:pt-20">
        <div className="min-w-0">
          <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-400">
            <Sparkles className="size-3.5" /> Social ads from your own brand assets
          </span>
          <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl">
            Professional ads for <span className="text-gradient">every platform</span>, in minutes.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
            Upload your logo, product photos and footage, describe what you sell, and BlackCell writes the copy, picks your best shots
            and edits video and image ads in every size: TikTok, Reels, Shorts, Stories, feeds and YouTube. <span className="text-white">Real assets, not AI imagery.</span>
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/signup" className="btn-primary px-6 py-3.5 text-base">Make your first ads <ArrowRight className="size-4" /></Link>
            <a href="#how" className="btn-secondary px-6 py-3.5 text-base">See how it works</a>
          </div>
          <p className="mt-4 text-sm text-ink-400">Plans from {price.from} · No design skills · Share a review link with your client</p>
        </div>
        <AdShowcase />
      </div>
    </section>
  );
}

const STEPS = [
  { icon: Store, title: 'Set up the brand', body: 'Add the logo. Colours are picked up automatically; choose a headline font and describe the brand voice.' },
  { icon: Upload, title: 'Upload assets', body: 'Product photos, lifestyle shots, cut-outs and video clips. Each one is reviewed so ads use the best shots, framed around the product.' },
  { icon: FileText, title: 'Write a short brief', body: 'What you sell, why it’s great, any offer. The copy is written from your brief, with no invented claims.' },
  { icon: Share2, title: 'Get every format', body: 'Video ads (6, 15 or 30 seconds) and image ads in 9:16, 4:5, 1:1 and 16:9, with post copy and a client link.' },
];

function HowItWorks() {
  return (
    <section id="how" className="border-y border-white/5 bg-ink-900/40 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">How it works</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">From brief to a full ad set.</h2>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="card relative overflow-hidden p-7">
              <span className="absolute -right-3 -top-6 font-display text-8xl font-extrabold text-white/[0.04]">{i + 1}</span>
              <span className="grid size-11 place-items-center rounded-xl bg-brand-500/15 text-brand-300"><Icon className="size-5" /></span>
              <h3 className="mt-5 font-display text-xl font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FORMATS = [
  ['9:16', 'Vertical', 'TikTok, Instagram Reels, YouTube Shorts, Stories', 'aspect-[9/16] w-16'],
  ['4:5', 'Portrait', 'Instagram and Facebook feeds', 'aspect-[4/5] w-20'],
  ['1:1', 'Square', 'Instagram, Facebook, LinkedIn, X', 'aspect-square w-20'],
  ['16:9', 'Landscape', 'YouTube, LinkedIn, X, Facebook', 'aspect-video w-28'],
];

function Formats() {
  return (
    <section id="formats" className="py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Formats</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">One brief. Every placement.</h2>
          <p className="mt-4 text-ink-300">Each ad is laid out for its format, not just cropped: text stays inside each platform’s safe zone, clear of buttons and captions, and every crop is framed around your product.</p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {FORMATS.map(([id, name, where, shape]) => (
              <div key={id} className="card flex items-center gap-4 p-4">
                <span className="grid h-24 w-28 shrink-0 place-items-center"><span className={`${shape} rounded-md border-2 border-brand-400/70 bg-brand-500/10`} /></span>
                <div><p className="font-semibold">{name} <span className="text-ink-400">{id}</span></p><p className="mt-1 text-xs text-ink-400">{where}</p></div>
              </div>
            ))}
          </div>
        </div>
        <LandscapeAd />
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Images, title: 'Your real photos and footage', body: 'Ads are built only from the assets you upload. No AI-generated imagery, so what customers see is what you sell.' },
  { icon: Type, title: 'Copy that sells', body: 'Hooks, benefits and offers written from your brief by an AI copywriter, in your brand voice. It never invents stats, reviews or prices.' },
  { icon: Crop, title: 'Smart framing', body: 'Each asset is reviewed for its subject and quality, so crops keep the product in shot and the strongest visuals lead.' },
  { icon: Palette, title: 'On-brand, automatically', body: 'Your logo, colours and headline font on every ad, in one of four styles: Clean, Bold, Luxury or Promo.' },
  { icon: Mic, title: 'Optional voiceover', body: 'Text and music by default, or add a natural, human-sounding voiceover in 12 languages.' },
  { icon: Link2, title: 'Client review links', body: 'Share a private page where your client can watch, download and copy the post text. No login needed.' },
];

function Features() {
  return (
    <section id="features" className="border-t border-white/5 bg-ink-900/40 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Features</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Agency-quality ads, without the agency.</h2>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-7">
              <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-brand-300"><Icon className="size-5" /></span>
              <h3 className="mt-5 font-display text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  const rows = [
    ['Time to a full set of ads', 'Days to weeks', 'Minutes'],
    ['Every format and length', 'Billed per size', 'Included'],
    ['Copy written from your brief', 'Extra', 'Included'],
    ['Revisions', 'Rounds and invoices', 'Edit and re-render'],
    ['Client review link', 'Email attachments', 'Included'],
  ];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <h2 className="text-center font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Why brands switch.</h2>
        <div className="card mt-12 overflow-hidden">
          <div className="grid grid-cols-3 border-b border-white/5 bg-white/[0.02] px-5 py-4 text-sm font-semibold">
            <span />
            <span className="text-center text-ink-400">Agency or freelancer</span>
            <span className="text-center text-brand-300">BlackCell</span>
          </div>
          {rows.map(([label, them, us]) => (
            <div key={label} className="grid grid-cols-3 items-center border-b border-white/5 px-5 py-4 text-sm last:border-0">
              <span className="font-medium">{label}</span>
              <span className="flex items-center justify-center gap-1.5 text-center text-ink-400"><Minus className="size-4 shrink-0" />{them}</span>
              <span className="flex items-center justify-center gap-1.5 text-center text-white"><Check className="size-4 shrink-0 text-emerald-400" />{us}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const contactHref = (plan) => `mailto:support@blackcell.app?subject=${encodeURIComponent(`BlackCell ${plan.name} plan`)}`;

export function PricingCards({ onSelect, currentPlan, busyPlan, verb = 'Switch to', canSelectPoa = false }) {
  const catalog = useCatalog();
  const price = usePrice();
  const plans = catalog?.plans || [];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((p) => (
        <div key={p.id} className={`relative flex flex-col rounded-3xl border p-6 ${p.popular ? 'glow border-brand-500/50 bg-gradient-to-b from-brand-600/15 to-ink-900' : 'border-white/8 bg-ink-900/80'}`}>
          {p.popular && <span className="absolute -top-3 left-6 rounded-full bg-gradient-brand px-3 py-1 text-xs font-bold">Most popular</span>}
          <p className="font-display text-lg font-bold">{p.name}</p>
          {p.poa ? (
            <p className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-5xl font-extrabold">POA</span>
              <span className="text-sm text-ink-400">Price on application</span>
            </p>
          ) : (
            <p className="mt-4 flex items-baseline gap-1">
              <span className="font-display text-5xl font-extrabold">{price.format(p.price)}</span>
              <span className="text-sm text-ink-400">/month</span>
            </p>
          )}
          {p.charge && <p className="mt-1 text-xs text-ink-400">Charged in {p.charge.currency.toUpperCase()}: {formatPrice(p.charge.amount, p.charge.currency)}/month</p>}
          <ul className="mt-6 flex-1 space-y-3 text-sm">
            {p.features.map((f) => <li key={f} className="flex gap-2.5 text-ink-300"><Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />{f}</li>)}
          </ul>
          {onSelect && currentPlan === p.id ? (
            <button className={`${p.popular ? 'btn-primary' : 'btn-secondary'} mt-8 w-full`} disabled>Current plan</button>
          ) : p.poa && !(onSelect && canSelectPoa) ? (
            <a href={contactHref(p)} className={`${p.popular ? 'btn-primary' : 'btn-secondary'} mt-8 w-full`}>Contact us</a>
          ) : onSelect ? (
            <button className={`${p.popular ? 'btn-primary' : 'btn-secondary'} mt-8 w-full`} disabled={busyPlan} onClick={() => onSelect(p.id)}>
              {busyPlan === p.id ? 'Just a moment…' : `${verb} ${p.name}`}
            </button>
          ) : (
            <Link to="/signup" className={`${p.popular ? 'btn-primary' : 'btn-secondary'} mt-8 w-full`}>Get started</Link>
          )}
        </div>
      ))}
    </div>
  );
}

function Pricing() {
  const price = usePrice();
  return (
    <section id="pricing" className="border-t border-white/5 bg-ink-900/40 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Pricing</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Every format in every plan, from {price.from}.</h2>
          <p className="mt-4 text-ink-300">An ad set is one brief made into video and image ads in every size you choose. Growth and Agency are priced to your volume: get in touch for a quote.</p>
        </div>
        <div className="mt-14"><PricingCards /></div>
      </div>
    </section>
  );
}

const FAQS = [
  ['Do the ads use AI-generated images?', 'No. Ads are built only from the photos, cut-outs and footage you upload. AI is used to review your assets, write the copy and plan the edit, and the renderer lays out each ad with your logo, colours and font.'],
  ['What should I upload?', 'Your best product photos (a transparent cut-out PNG works beautifully), lifestyle shots of the product in use, and short video clips if you have them, plus your logo. Five to ten good assets make great ads.'],
  ['Which platforms are covered?', 'Vertical 9:16 for TikTok, Instagram Reels, YouTube Shorts and Stories; 4:5 and 1:1 for Instagram, Facebook, LinkedIn and X feeds; and 16:9 for YouTube, LinkedIn, X and Facebook. You also get ready-to-paste post copy for each.'],
  ['Can I change the copy?', 'Yes. Edit any headline, line, button or offer badge and re-render, or ask for fresh copy. Nothing claims more than your brief says.'],
  ['How do my clients see the ads?', 'Turn on a client link for any ad set. It opens a private page with every ad, downloads and the post copy, and works without an account. You can switch it off at any time.'],
  ['Do you publish the ads for me?', 'You download the files and upload them to Ads Manager, TikTok Ads or each platform, where you control targeting and budget.'],
  ['Who owns the ads?', 'You do. You keep the rights to your assets and to the ads made from them.'],
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="py-24">
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
  const price = usePrice();
  return (
    <section className="pb-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-brand p-10 text-center sm:p-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.25),transparent_40%)]" />
          <Rocket className="relative mx-auto size-10" />
          <h2 className="relative mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Your next ad set is minutes away.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-white/85">Upload your assets, write a brief, and get every format. Plans from {price.from}.</p>
          <Link to="/signup" className="btn relative mt-8 bg-white px-7 py-3.5 text-base text-ink-950 hover:bg-white/90">Make your first ads <ArrowRight className="size-4" /></Link>
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
        <p className="flex items-center gap-1.5"><ShieldCheck className="size-4" /> Social ads from your own brand assets.</p>
        <nav className="flex gap-4">
          <Link to="/privacy" className="hover:text-white">Privacy</Link>
          <Link to="/terms" className="hover:text-white">Terms</Link>
          <a href="mailto:support@blackcell.app" className="hover:text-white">Contact</a>
        </nav>
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
      <HowItWorks />
      <Formats />
      <Features />
      <Comparison />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}
