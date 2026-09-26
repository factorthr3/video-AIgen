import { Link } from 'react-router';
import { Plus, Layers, CalendarClock, TriangleAlert } from 'lucide-react';
import { PageHeader, EmptyState, Spinner, PlatformIcon } from '../components/ui.jsx';
import { useApi, useCatalog, byId, describeDays, formatDateTime } from '../lib.jsx';

export default function SeriesList() {
  const catalog = useCatalog();
  const { data } = useApi('/series');
  const { data: accountData } = useApi('/accounts');
  if (!data || !catalog || !accountData) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const niches = byId(catalog.niches);
  const accounts = byId(accountData.accounts);

  return (
    <>
      <PageHeader title="Series" subtitle="Each series is a channel on autopilot." actions={<Link to="/app/series/new" className="btn-primary"><Plus className="size-4" /> New series</Link>} />
      {data.series.length === 0 ? (
        <EmptyState icon={Layers} title="No series yet" action={<Link to="/app/series/new" className="btn-primary"><Plus className="size-4" /> Create your first series</Link>}>
          Pick a niche, a look and a schedule, and Nrrtv creates and posts new videos for you.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.series.map((s) => {
            const n = niches[s.niche];
            return (
              <Link key={s.id} to={`/app/series/${s.id}`} className="card overflow-hidden transition hover:border-white/15">
                <div className="relative h-28" style={{ background: n ? `linear-gradient(135deg, ${n.colors[0]}, ${n.colors[1]})` : 'linear-gradient(135deg,#4c1d95,#be185d)' }}>
                  <span className="absolute bottom-3 left-4 text-4xl">{n?.emoji || '✨'}</span>
                  <span className={`chip absolute right-3 top-3 ${s.active ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200' : 'bg-black/40'}`}>{s.active ? 'Active' : 'Paused'}</span>
                </div>
                <div className="p-5">
                  <p className="font-display text-lg font-bold">{s.name}</p>
                  <p className="mt-1 text-sm text-ink-400">{s.niche === 'custom' ? s.customTopic : n?.tagline}</p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-ink-300">
                    <CalendarClock className="size-3.5" />
                    {s.active && s.nextRunAt ? `Next: ${formatDateTime(s.nextRunAt)}` : describeDays(s.schedule.days)}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex -space-x-1.5">
                      {s.accountIds.map((id) => accounts[id] && <PlatformIcon key={id} platform={accounts[id].platform} size="sm" />)}
                      {s.accountIds.length === 0 && <span className="text-xs text-ink-400">No accounts</span>}
                    </div>
                    <span className="text-xs text-ink-400">{s.stats.total} video{s.stats.total === 1 ? '' : 's'}</span>
                  </div>
                  {s.lastError && <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-300"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{s.lastError}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
