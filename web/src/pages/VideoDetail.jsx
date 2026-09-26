import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Download, RefreshCw, Send, Trash2, Save, Sparkles, ExternalLink, Check, TriangleAlert, LoaderCircle, Clock, ArrowLeft, Wand2,
} from 'lucide-react';
import { Alert, Spinner, ProgressBar, PlatformIcon, platformLabel, StatusBadge, EmptyState } from '../components/ui.jsx';
import { api, useApi, useCatalog, useSession, byId, formatDateTime, formatDuration } from '../lib.jsx';

const STAGES = ['Writing script', 'Generating visuals', 'Recording voiceover', 'Animating scenes', 'Mixing audio', 'Rendering video'];
const busyVideo = (v) => ['queued', 'processing'].includes(v?.status);
const shouldPoll = (d) => busyVideo(d.video) || d.posts?.some((p) => ['pending', 'uploading'].includes(p.status));

function Progress({ video, withClips }) {
  const stages = withClips ? STAGES : STAGES.filter((s) => s !== 'Animating scenes');
  // "Waiting to render" sits between the remote stages and the render.
  const current = video.stage === 'Waiting to render' ? stages.indexOf('Mixing audio') : stages.indexOf(video.stage);
  return (
    <div className="flex aspect-[9/16] w-full flex-col justify-center rounded-3xl border border-white/8 bg-gradient-to-b from-brand-600/20 via-ink-900 to-ink-900 p-8">
      <LoaderCircle className="mx-auto size-10 animate-spin text-brand-400" />
      <p className="mt-5 text-center font-display text-xl font-bold">{video.status === 'queued' ? 'Waiting in queue' : 'Creating your video'}</p>
      <p className="mt-1 text-center text-sm text-ink-400">
        {Math.round(video.progress * 100)}% · {video.stage === 'Waiting to render' ? 'waiting for another video to finish rendering' : withClips ? 'AI video usually takes 3–8 minutes' : 'usually 1–3 minutes'}
      </p>
      <ProgressBar value={video.progress} className="mt-6" />
      <ol className="mt-8 space-y-3">
        {stages.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 text-sm ${i < current ? 'text-ink-300' : i === current ? 'font-semibold text-white' : 'text-ink-400/60'}`}>
            {i < current ? <Check className="size-4 text-emerald-400" /> : i === current ? <LoaderCircle className="size-4 animate-spin text-brand-400" /> : <Clock className="size-4" />}
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

function PostStatus({ post }) {
  const icon = {
    published: <Check className="size-4 text-emerald-400" />,
    failed: <TriangleAlert className="size-4 text-red-400" />,
  }[post.status] || <LoaderCircle className="size-4 animate-spin text-brand-400" />;
  return (
    <li className="flex items-start gap-3 py-3">
      <PlatformIcon platform={post.platform} size="sm" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{post.username || platformLabel(post.platform)} {post.demo && <span className="chip ml-1 py-0">demo</span>}</p>
        <p className="text-xs text-ink-400">{post.status === 'published' ? 'Posted' : post.status === 'failed' ? 'Failed' : 'Uploading…'} · {formatDateTime(post.updatedAt)}</p>
        {post.note && <p className="mt-1 text-xs text-ink-400">{post.note}</p>}
        {post.error && <p className="mt-1 text-xs text-red-300">{post.error}</p>}
      </div>
      {icon}
      {post.url && <a href={post.url} target="_blank" rel="noreferrer" className="text-ink-400 hover:text-white"><ExternalLink className="size-4" /></a>}
    </li>
  );
}

export default function VideoDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const { refresh } = useSession();
  const { data, reload, error: loadError } = useApi(`/videos/${id}`, { poll: shouldPoll });
  const { data: accountData } = useApi('/accounts');
  const [meta, setMeta] = useState(null);
  const [scenes, setScenes] = useState(null);
  const [selected, setSelected] = useState([]);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const video = data?.video;
  // Load editable copies once the script exists (and after each re-render).
  useEffect(() => {
    if (video && !busyVideo(video)) {
      setMeta({ title: video.title || '', description: video.description || '', hashtags: video.hashtags.map((h) => `#${h}`).join(' ') });
      setScenes(video.scenes);
    }
  }, [video?.updatedAt, video?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (accountData) setSelected(accountData.accounts.map((a) => a.id));
  }, [accountData]);
  useEffect(() => {
    if (video?.status === 'ready') refresh();
  }, [video?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError?.status === 404) return <EmptyState icon={TriangleAlert} title="Video not found" action={<Link to="/app/videos" className="btn-secondary">Back to videos</Link>} />;
  if (!data || !accountData || !catalog) return <div className="grid h-64 place-items-center"><Spinner /></div>;

  const accounts = accountData.accounts;
  const settings = video.settings;
  const niche = byId(catalog.niches)[settings.niche];
  const dirty = meta && scenes && (
    meta.title !== (video.title || '') || meta.description !== (video.description || '')
    || meta.hashtags !== video.hashtags.map((h) => `#${h}`).join(' ')
    || JSON.stringify(scenes) !== JSON.stringify(video.scenes)
  );
  const scriptDirty = scenes && JSON.stringify(scenes) !== JSON.stringify(video.scenes);

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

  const saveBody = () => ({
    title: meta.title,
    description: meta.description,
    hashtags: meta.hashtags.split(/[\s,]+/).filter(Boolean),
    scenes,
  });
  const save = () => run(() => api(`/videos/${id}`, { method: 'PATCH', body: saveBody() }), 'Saved.');
  const rerender = (newScript = false) => run(async () => {
    if (!newScript && dirty) await api(`/videos/${id}`, { method: 'PATCH', body: saveBody() });
    await api(`/videos/${id}/rerender`, { method: 'POST', body: { newScript } });
  });
  const publish = () => run(() => api(`/videos/${id}/publish`, { method: 'POST', body: { accountIds: selected } }), 'Posting started. Status updates below.');
  const remove = () => {
    if (!confirm('Delete this video? This cannot be undone.')) return;
    run(async () => {
      await api(`/videos/${id}`, { method: 'DELETE' });
      await refresh();
      navigate(video.seriesId ? `/app/series/${video.seriesId}` : '/app/videos');
    });
  };

  return (
    <>
      <Link to={video.seriesId ? `/app/series/${video.seriesId}` : '/app/videos'} className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="size-4" /> {video.seriesId ? 'Back to series' : 'All videos'}
      </Link>
      {params.get('new') && busyVideo(video) && <Alert tone="info">Your series is live 🎉 The first video is being created now, and you can watch its progress here.</Alert>}
      {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        <div className="mx-auto w-full max-w-sm lg:sticky lg:top-8 lg:max-w-none lg:self-start">
          {video.status === 'ready' ? (
            <video key={video.updatedAt} src={`/api/videos/${id}/file?v=${encodeURIComponent(video.updatedAt)}`} poster={`/api/videos/${id}/thumb?v=${encodeURIComponent(video.updatedAt)}`} controls playsInline className="aspect-[9/16] w-full rounded-3xl bg-black shadow-2xl shadow-black/50" />
          ) : video.status === 'failed' ? (
            <div className="flex aspect-[9/16] w-full flex-col items-center justify-center rounded-3xl border border-red-500/20 bg-red-500/5 p-8 text-center">
              <TriangleAlert className="size-10 text-red-400" />
              <p className="mt-4 font-display text-xl font-bold">Rendering failed</p>
              <p className="mt-2 text-sm text-ink-400">{video.error}</p>
              <button className="btn-primary mt-6" onClick={() => rerender(false)} disabled={busy}><RefreshCw className="size-4" /> Try again</button>
            </div>
          ) : <Progress video={video} withClips={video.settings.motion !== 'still' && Boolean(catalog.providers?.video?.provider)} />}

          {video.status === 'ready' && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={`/api/videos/${id}/file?download=1`} className="btn-secondary"><Download className="size-4" /> Download</a>
              <button className="btn-secondary" onClick={() => rerender(false)} disabled={busy}><RefreshCw className="size-4" /> Re-render</button>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <StatusBadge video={video} />
            {video.duration && <span className="chip">{formatDuration(video.duration)}</span>}
            {niche && <span className="chip">{niche.emoji} {niche.name}</span>}
            {video.providers && <span className="chip" title="Engines used for this video">script: {video.providers.script} · images: {video.providers.images} · voice: {video.providers.voice}{video.providers.video ? ` · video: ${video.providers.video}${video.providers.clips ? ` (${video.providers.clips} clips)` : ''}` : ''}</span>}
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          {video.status === 'ready' && (
            <div className="card p-6">
              <h2 className="font-display text-lg font-bold">Post this video</h2>
              {accounts.length === 0 ? (
                <p className="mt-2 text-sm text-ink-400">No accounts connected. <Link to="/app/accounts" className="text-white underline">Connect TikTok, YouTube or Instagram</Link> to post.</p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {accounts.map((a) => {
                      const on = selected.includes(a.id);
                      return (
                        <button key={a.id} type="button" data-selected={on} className="option flex items-center gap-2 px-3 py-2" onClick={() => setSelected(on ? selected.filter((x) => x !== a.id) : [...selected, a.id])}>
                          <PlatformIcon platform={a.platform} size="sm" />
                          <span className="text-sm font-medium">{a.username}</span>
                          {a.demo && <span className="text-[10px] uppercase text-ink-400">demo</span>}
                        </button>
                      );
                    })}
                  </div>
                  <button className="btn-primary mt-4" onClick={publish} disabled={busy || !selected.length}><Send className="size-4" /> Post now</button>
                  {video.autoPost && video.publishAt && <p className="mt-3 text-xs text-ink-400">Scheduled to auto-post {formatDateTime(video.publishAt)}.</p>}
                </>
              )}
              {data.posts.length > 0 && <ul className="mt-5 divide-y divide-white/5 border-t border-white/5">{data.posts.map((p) => <PostStatus key={p.id} post={p} />)}</ul>}
            </div>
          )}

          {meta && scenes && (
            <fieldset disabled={busyVideo(video)} className="min-w-0 space-y-6 disabled:opacity-60">
              <div className="card space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold">Details</h2>
                  {video.scriptSource === 'library' && <span className="chip border-amber-500/30 bg-amber-500/10 text-amber-200">Demo script</span>}
                </div>
                <div>
                  <label className="label" htmlFor="title">Title</label>
                  <input id="title" className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="description">Caption</label>
                  <textarea id="description" className="input min-h-20" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="hashtags">Hashtags</label>
                  <input id="hashtags" className="input" value={meta.hashtags} onChange={(e) => setMeta({ ...meta, hashtags: e.target.value })} />
                </div>
              </div>

              <div className="card p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">Script</h2>
                    <p className="text-sm text-ink-400">Edit narration or visuals, then re-render. Unchanged images are reused.</p>
                  </div>
                  <button className="btn-ghost" onClick={() => confirm('Write a brand-new script and re-render?') && rerender(true)} disabled={busy}><Wand2 className="size-4" /> New script</button>
                </div>
                <ol className="mt-6 space-y-4">
                  {scenes.map((sc, i) => (
                    <li key={i} className="flex gap-4 rounded-2xl border border-white/5 bg-ink-850 p-3">
                      <div className="relative w-20 shrink-0 sm:w-24">
                        {video.status === 'ready' && !scriptDirty
                          ? <img src={`/api/videos/${id}/scenes/${i}?v=${encodeURIComponent(video.updatedAt)}`} alt="" className="aspect-[9/16] w-full rounded-lg object-cover" loading="lazy" />
                          : <div className="aspect-[9/16] w-full rounded-lg bg-ink-700" />}
                        <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 text-xs font-bold">{i + 1}</span>
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <textarea className="input min-h-16 py-2" value={sc.narration} onChange={(e) => setScenes(scenes.map((x, k) => (k === i ? { ...x, narration: e.target.value } : x)))} />
                        <input className="input py-2 text-xs text-ink-300" value={sc.visual} title="Visual prompt" placeholder="What the image shows" onChange={(e) => setScenes(scenes.map((x, k) => (k === i ? { ...x, visual: e.target.value } : x)))} />
                        {settings.motion !== 'still' && (
                          <input className="input py-2 text-xs text-ink-300" value={sc.motion || ''} title="Motion prompt" placeholder="How it moves in the video clip (optional)" onChange={(e) => setScenes(scenes.map((x, k) => (k === i ? { ...x, motion: e.target.value } : x)))} />
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flex flex-wrap justify-between gap-3">
                <button className="btn-danger" onClick={remove} disabled={busy || video.status === 'processing'}><Trash2 className="size-4" /> Delete video</button>
                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={save} disabled={busy || !dirty}><Save className="size-4" /> Save</button>
                  <button className="btn-primary" onClick={() => rerender(false)} disabled={busy || busyVideo(video)}><Sparkles className="size-4" /> {scriptDirty ? 'Save & re-render' : 'Re-render'}</button>
                </div>
              </div>
            </fieldset>
          )}
        </div>
      </div>
    </>
  );
}
