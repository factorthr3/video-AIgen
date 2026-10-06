import { useParams } from 'react-router';
import { Logo, Spinner } from '../components/ui.jsx';
import { AdGroups, Captions } from '../components/ads.jsx';
import { useApi, formatDateTime } from '../lib.jsx';

// The client's view of an ad set: no login, just the ads, downloads and post copy.
export default function Share() {
  const { token } = useParams();
  const { data, error } = useApi(`/share/${token}`);
  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div><Logo /><p className="mt-6 text-lg font-semibold">This link isn't active</p><p className="mt-1 text-sm text-ink-400">Ask whoever sent it for a new one.</p></div>
      </div>
    );
  }
  if (!data) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  const { brand, adset, items } = data;
  const accent = brand.colors?.[0] || '#7c3aed';
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5" style={{ background: `linear-gradient(180deg, ${accent}22, transparent)` }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-5 px-4 py-8 sm:px-6">
          {brand.logo && <span className="grid h-16 min-w-16 place-items-center rounded-2xl bg-white px-3"><img src={brand.logo} alt={brand.name} className="max-h-11 max-w-40 object-contain" /></span>}
          <div>
            <p className="text-sm text-ink-400">{brand.name}</p>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">{adset.name}</h1>
            <p className="mt-1 text-sm text-ink-400">{items.length} ad{items.length === 1 ? '' : 's'} · {formatDateTime(adset.createdAt)}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {items.length ? <AdGroups items={items} /> : <p className="text-ink-400">The ads are still being made. Check back in a few minutes.</p>}
        {adset.captions && (
          <section className="mt-4">
            <h2 className="mb-4 font-display text-lg font-bold">Post copy</h2>
            <Captions captions={adset.captions} />
          </section>
        )}
      </main>
      <footer className="border-t border-white/5 py-8 text-center text-sm text-ink-400">
        Made with <a href="/" className="font-semibold text-white hover:underline">BlackCell</a>
      </footer>
    </div>
  );
}
