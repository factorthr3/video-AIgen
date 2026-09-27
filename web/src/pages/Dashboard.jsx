import { Link } from 'react-router';
import { Plus, Layers, Film, CalendarClock, Send, ArrowRight, Sparkles } from 'lucide-react';
import { PageHeader, VideoThumb, StatusBadge, EmptyState, Spinner } from '../components/ui.jsx';
import { useApi, useSession, useCatalog, byId, formatDateTime, relativeTime, describeDays } from '../lib.jsx';

const inProgress = (d) => d.videos?.some((v) => ['queued', 'processing'].includes(v.status));

export function VideoGrid({ videos }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {videos.map((v) => (
        <Link key={v.id} to={`/app/videos/${v.id}`} className="group">
          <VideoThumb video={v} className="transition group-hover:ring-2 group-hover:ring-brand-500/60" />
          <div className="mt-2.5 flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-medium leading-snug">{v.title || 'Writing script…'}</p>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge video={v} />
            {v.postCount > 0 && <span className="chip"><Send className="size-3" /> {v.postCount}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user, usage } = useSession();
  const catalog = useCatalog();
  const niches = byId(catalog?.niches);
  const { data: seriesData } = useApi('/series');
  const { data: videoData } = useApi('/videos', { poll: inProgress });
  const series = seriesData?.series;
  const videos = videoData?.videos;

  if (!series || !videos) return <div className="grid h-64 place-items-center"><Spinner /></div>;

  const upcoming = series.filter((s) => s.active && s.nextRunAt).sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))[0];
  const posted = videos.reduce((n, v) => n + (v.postCount || 0), 0);
  const firstName = user?.name?.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''}`}
        subtitle="Here's what your autopilot is up to."
        actions={<Link to="/app/series/new" className="btn-primary"><Plus className="size-4" /> New series</Link>}
      />

      {usage?.needsPlan && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm">
          <p className="text-brand-100">Welcome to BlackCell! Choose a plan to start creating and auto-posting videos.</p>
          <Link to="/app/billing" className="btn-primary">See plans</Link>
        </div>
      )}
      {catalog?.providers?.script?.provider === 'library' && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <p>Demo mode: scripts come from a built-in sample library and visuals are procedurally drawn. Add <code className="rounded bg-black/30 px-1">ANTHROPIC_API_KEY</code> (and optionally <code className="rounded bg-black/30 px-1">OPENAI_API_KEY</code>) to the server's <code className="rounded bg-black/30 px-1">.env</code> for AI-written scripts and AI images. <Link to="/app/settings" className="underline">Details</Link></p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Film, label: 'Videos this month', value: `${usage?.videosUsed ?? 0} / ${usage?.videosLimit ?? 0}` },
          { icon: Layers, label: 'Active series', value: series.filter((s) => s.active).length },
          { icon: Send, label: 'Posts published', value: posted },
          { icon: CalendarClock, label: 'Next post', value: upcoming ? relativeTime(upcoming.nextRunAt) : '-', hint: upcoming && formatDateTime(upcoming.nextRunAt) },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <s.icon className="size-5 text-brand-400" />
            <p className="mt-4 font-display text-2xl font-extrabold">{s.value}</p>
            <p className="mt-1 text-xs text-ink-400">{s.hint || s.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Your series</h2>
          {series.length > 0 && <Link to="/app/series" className="text-sm text-ink-400 hover:text-white">View all</Link>}
        </div>
        {series.length === 0 ? (
          <EmptyState icon={Layers} title="Start your first series" action={<Link to="/app/series/new" className="btn-primary"><Plus className="size-4" /> Create a series</Link>}>
            A series is a channel on autopilot: one niche, one style, posting on your schedule.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {series.slice(0, 4).map((s) => {
              const n = niches[s.niche];
              return (
                <Link key={s.id} to={`/app/series/${s.id}`} className="card flex items-center gap-4 p-4 transition hover:border-white/15">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: n ? `linear-gradient(135deg, ${n.colors[0]}, ${n.colors[1]})` : '#242434' }}>{n?.emoji || '✨'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {s.active ? `${describeDays(s.schedule.days)} at ${s.schedule.time}` : 'Paused'} · {s.stats.total} video{s.stats.total === 1 ? '' : 's'}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-ink-400" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Recent videos</h2>
          {videos.length > 0 && <Link to="/app/videos" className="text-sm text-ink-400 hover:text-white">View all</Link>}
        </div>
        {videos.length === 0
          ? <EmptyState icon={Film} title="No videos yet">Create a series and your first video starts rendering right away.</EmptyState>
          : <VideoGrid videos={videos.slice(0, 10)} />}
      </section>
    </>
  );
}
