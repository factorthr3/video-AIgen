import { Link } from 'react-router';
import { Plus, Store, Megaphone, Sparkles, Upload, FileText, Share2 } from 'lucide-react';
import { PageHeader, Alert, Spinner } from '../components/ui.jsx';
import { AdSetCard } from './AdSets.jsx';
import { useApi, useSession, useCatalog, byId } from '../lib.jsx';

const STEPS = [
  { icon: Store, title: 'Set up a brand', body: 'Logo, colours and font, so every ad looks like you.' },
  { icon: Upload, title: 'Upload your assets', body: 'Product photos, lifestyle shots and video clips.' },
  { icon: FileText, title: 'Write a short brief', body: 'What you sell and why it’s great. We write the copy.' },
  { icon: Share2, title: 'Get every format', body: 'Video and image ads for each platform, with a client link.' },
];

export default function Dashboard() {
  const { user, usage } = useSession();
  const catalog = useCatalog();
  const { data: brands } = useApi('/brands');
  const { data: adsets } = useApi('/adsets', { poll: (d) => d.adsets.some((a) => ['queued', 'processing'].includes(a.status)) });
  if (!brands || !adsets) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const plan = byId(catalog?.plans)[usage?.plan];
  const fresh = !brands.brands.length;
  return (
    <>
      <PageHeader
        title={`Hi${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        subtitle="Professional ads for every platform, made from your own brand assets."
        actions={<Link to={fresh ? '/app/brands' : '/app/adsets/new'} className="btn-primary"><Sparkles className="size-4" /> {fresh ? 'Set up a brand' : 'New ads'}</Link>}
      />
      {usage?.needsPlan && <Alert tone="warn">Choose a plan on <Link to="/app/billing" className="underline">Plan &amp; billing</Link> to start making ads.</Alert>}

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        {[
          { icon: Megaphone, label: 'Ad sets this month', value: `${usage?.adsetsUsed ?? 0} / ${usage?.adsetsLimit ?? 0}` },
          { icon: Store, label: 'Brands', value: `${usage?.brandsUsed ?? 0} / ${usage?.brandsLimit ?? 0}` },
          { icon: Sparkles, label: 'Plan', value: plan?.name || 'None' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card p-5">
            <p className="flex items-center gap-2 text-sm text-ink-400"><Icon className="size-4" /> {label}</p>
            <p className="mt-2 font-display text-2xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      {fresh || !adsets.adsets.length ? (
        <section className="mb-10">
          <h2 className="mb-4 font-display text-lg font-bold">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="card p-5">
                <span className="mb-3 grid size-10 place-items-center rounded-xl bg-brand-500/15 text-brand-300"><Icon className="size-5" /></span>
                <p className="font-semibold">{i + 1}. {title}</p>
                <p className="mt-1 text-sm text-ink-400">{body}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Recent ad sets</h2>
            <Link to="/app/adsets" className="text-sm text-ink-400 hover:text-white">View all</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{adsets.adsets.slice(0, 8).map((a) => <AdSetCard key={a.id} adset={a} />)}</div>
        </section>
      )}
      {!fresh && (
        <div className="mt-10">
          <Link to="/app/brands" className="btn-ghost"><Plus className="size-4" /> Manage brands</Link>
        </div>
      )}
    </>
  );
}
