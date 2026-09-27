import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { Play, Pause, Sparkles, Trash2, CalendarClock, Save, Film, TriangleAlert } from 'lucide-react';
import { PageHeader, Alert, Spinner, EmptyState } from '../components/ui.jsx';
import { NichePicker, StylePicker, SchedulePicker, Section } from '../components/SeriesForm.jsx';
import { VideoGrid } from './Dashboard.jsx';
import { api, useApi, useCatalog, useSession, byId, describeDays, formatDateTime, relativeTime } from '../lib.jsx';

const inProgress = (d) => d.videos?.some((v) => ['queued', 'processing'].includes(v.status));

export default function SeriesDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const { refresh } = useSession();
  const { data, reload, error: loadError } = useApi(`/series/${id}`, { poll: inProgress });
  const { data: accountData } = useApi('/accounts');
  const [tab, setTab] = useState('videos');
  const [form, setForm] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.series && !form) {
      const s = data.series;
      setForm({ ...s, customTopic: s.customTopic || '' });
    }
  }, [data, form]);

  if (loadError?.status === 404) return <EmptyState icon={TriangleAlert} title="Series not found" action={<Link to="/app/series" className="btn-secondary">Back to series</Link>} />;
  if (!data || !catalog || !accountData || !form) return <div className="grid h-64 place-items-center"><Spinner /></div>;

  const s = data.series;
  const niche = byId(catalog.niches)[s.niche];

  const run = async (fn, success) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice({ tone: 'success', text: success });
      await reload();
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const generate = () => run(async () => {
    const res = await api(`/series/${id}/generate`, { method: 'POST' });
    await refresh();
    navigate(`/app/videos/${res.video.id}`);
  });
  const toggleActive = () => run(() => api(`/series/${id}`, { method: 'PATCH', body: { active: !s.active } }), s.active ? 'Series paused.' : 'Series resumed.');
  const save = () => run(async () => {
    const res = await api(`/series/${id}`, { method: 'PATCH', body: form });
    setForm({ ...res.series, customTopic: res.series.customTopic || '' });
  }, 'Settings saved. New videos will use them.');
  const remove = () => {
    if (!confirm(`Delete "${s.name}"? Its videos stay in your library.`)) return;
    run(async () => {
      await api(`/series/${id}`, { method: 'DELETE' });
      await refresh();
      navigate('/app/series');
    });
  };

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><span>{niche?.emoji || '✨'}</span>{s.name}</span>}
        subtitle={
          s.active
            ? <span className="flex items-center gap-1.5"><CalendarClock className="size-4" /> {describeDays(s.schedule.days)} at {s.schedule.time} · next {s.nextRunAt ? `${relativeTime(s.nextRunAt)} (${formatDateTime(s.nextRunAt)})` : '-'}</span>
            : 'Paused - no new videos will be created.'
        }
        actions={
          <>
            <button className="btn-secondary" onClick={toggleActive} disabled={busy}>{s.active ? <><Pause className="size-4" /> Pause</> : <><Play className="size-4" /> Resume</>}</button>
            <button className="btn-primary" onClick={generate} disabled={busy}><Sparkles className="size-4" /> Generate video now</button>
          </>
        }
      />
      {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      {s.lastError && <Alert tone="warn">{s.lastError}</Alert>}

      <div className="mb-8 flex gap-1 border-b border-white/5">
        {[['videos', `Videos (${data.videos.length})`], ['settings', 'Settings']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-3 text-sm font-semibold ${tab === k ? 'border-brand-500 text-white' : 'border-transparent text-ink-400 hover:text-white'}`}>{label}</button>
        ))}
      </div>

      {tab === 'videos' && (data.videos.length
        ? <VideoGrid videos={data.videos} />
        : <EmptyState icon={Film} title="No videos yet" action={<button className="btn-primary" onClick={generate}><Sparkles className="size-4" /> Generate the first one</button>}>New videos appear here as they're created on schedule.</EmptyState>)}

      {tab === 'settings' && (
        <div>
          <Section title="Series name"><input className="input max-w-md" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Section>
          <Section title="Niche"><NichePicker catalog={catalog} form={form} setForm={setForm} /></Section>
          <StylePicker catalog={catalog} form={form} setForm={setForm} />
          <SchedulePicker form={form} setForm={setForm} accounts={accountData.accounts} />
          <div className="sticky bottom-0 mt-8 flex flex-wrap justify-between gap-3 border-t border-white/5 bg-ink-950/90 py-4 backdrop-blur">
            <button className="btn-danger" onClick={remove} disabled={busy}><Trash2 className="size-4" /> Delete series</button>
            <button className="btn-primary" onClick={save} disabled={busy}><Save className="size-4" /> Save changes</button>
          </div>
        </div>
      )}
    </>
  );
}
