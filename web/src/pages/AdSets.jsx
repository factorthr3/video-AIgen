import { Link } from 'react-router';
import { Plus, Megaphone } from 'lucide-react';
import { PageHeader, Alert, Spinner, EmptyState } from '../components/ui.jsx';
import { AdSetStatus } from '../components/ads.jsx';
import { useApi, relativeTime } from '../lib.jsx';

export function AdSetCard({ adset }) {
  return (
    <Link to={`/app/adsets/${adset.id}`} className="card group overflow-hidden transition hover:border-white/20">
      <div className="relative aspect-[4/3] overflow-hidden bg-ink-800">
        {adset.cover
          ? <img src={adset.cover} alt="" className="size-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
          : <div className="grid size-full place-items-center bg-gradient-to-br from-brand-600/25 via-ink-800 to-hot-500/15"><Megaphone className="size-7 text-white/50" /></div>}
        <span className="absolute left-3 top-3 rounded-full bg-black/60 backdrop-blur"><AdSetStatus adset={adset} /></span>
      </div>
      <div className="p-4">
        <p className="truncate font-semibold">{adset.name}</p>
        <p className="mt-0.5 text-xs text-ink-400">{adset.brandName ? `${adset.brandName} · ` : ''}{adset.ads.ready}/{adset.ads.total} ads · {relativeTime(adset.createdAt)}</p>
      </div>
    </Link>
  );
}

export default function AdSets() {
  const { data, error } = useApi('/adsets', { poll: (d) => d.adsets.some((a) => ['queued', 'processing'].includes(a.status)) });
  if (error) return <Alert>{error.message}</Alert>;
  if (!data) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  return (
    <>
      <PageHeader title="Ad sets" subtitle="Every brief, with its ads in every format." actions={<Link to="/app/adsets/new" className="btn-primary"><Plus className="size-4" /> New ads</Link>} />
      {data.adsets.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{data.adsets.map((a) => <AdSetCard key={a.id} adset={a} />)}</div>
      ) : (
        <EmptyState icon={Megaphone} title="No ads yet" action={<Link to="/app/adsets/new" className="btn-primary"><Plus className="size-4" /> New ads</Link>}>
          Describe a product and BlackCell makes video and image ads for every platform from your brand's own photos and footage.
        </EmptyState>
      )}
    </>
  );
}
