import { useState } from 'react';
import { Link } from 'react-router';
import { Film, Plus } from 'lucide-react';
import { PageHeader, EmptyState, Spinner } from '../components/ui.jsx';
import { VideoGrid } from './Dashboard.jsx';
import { useApi } from '../lib.jsx';

const FILTERS = [
  ['all', 'All'],
  ['processing', 'In progress'],
  ['ready', 'Ready'],
  ['posted', 'Posted'],
  ['failed', 'Failed'],
];

const inProgress = (d) => d.videos?.some((v) => ['queued', 'processing'].includes(v.status));

export default function Videos() {
  const { data } = useApi('/videos', { poll: inProgress });
  const [filter, setFilter] = useState('all');
  if (!data) return <div className="grid h-64 place-items-center"><Spinner /></div>;

  const videos = data.videos.filter((v) => {
    if (filter === 'all') return true;
    if (filter === 'processing') return ['queued', 'processing'].includes(v.status);
    if (filter === 'posted') return v.postCount > 0;
    return v.status === filter;
  });

  return (
    <>
      <PageHeader title="Videos" subtitle="Everything Nrrtv has made for you." actions={<Link to="/app/series/new" className="btn-primary"><Plus className="size-4" /> New series</Link>} />
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${filter === k ? 'bg-white text-ink-950' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>{label}</button>
        ))}
      </div>
      {videos.length ? <VideoGrid videos={videos} /> : <EmptyState icon={Film} title={filter === 'all' ? 'No videos yet' : 'Nothing here'}>{filter === 'all' ? 'Create a series to generate your first video.' : 'No videos match this filter.'}</EmptyState>}
    </>
  );
}
