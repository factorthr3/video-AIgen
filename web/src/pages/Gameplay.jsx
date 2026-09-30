import { useRef, useState } from 'react';
import { Gamepad2, Upload, Trash2, Users, Lock, AlertTriangle, Pencil } from 'lucide-react';
import { PageHeader, Alert, Spinner, EmptyState } from '../components/ui.jsx';
import { useApi, api, formatDuration } from '../lib.jsx';

// Upload with progress (fetch can't report upload progress).
function uploadClip(file, game, credit, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('game', game);
    form.append('credit', credit);
    form.append('file', file);
    xhr.open('POST', '/api/gameplay');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || (xhr.status === 413 ? 'That file is too big.' : `Upload failed (${xhr.status})`)));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.send(form);
  });
}

function ClipCard({ clip, onDelete, onCredit }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-video bg-ink-800">
        {clip.status === 'ready' ? (
          playing
            ? <video src={`/api/gameplay/${clip.id}/video.mp4`} autoPlay controls muted className="absolute inset-0 size-full object-cover" />
            : (
              <button type="button" onClick={() => setPlaying(true)} className="absolute inset-0" title="Preview">
                <img src={`/api/gameplay/${clip.id}/thumb.jpg`} alt="" loading="lazy" className="size-full object-cover" />
                <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold">{formatDuration(clip.duration)}</span>
              </button>
            )
        ) : clip.status === 'processing' ? (
          <div className="grid size-full place-items-center text-sm text-ink-300"><span className="flex items-center gap-2"><Spinner className="size-4" /> Processing…</span></div>
        ) : (
          <div className="grid size-full place-items-center p-4 text-center text-xs text-red-300"><span><AlertTriangle className="mx-auto mb-1 size-5" />{clip.error || 'Processing failed.'}</span></div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={clip.name}>{clip.name}</p>
          <p className="flex items-center gap-1 text-xs text-ink-400">
            {clip.shared ? <><Users className="size-3" /> Shared with everyone</> : <><Lock className="size-3" /> Only you</>}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-400" title={clip.credit || ''}>{clip.credit ? `Credit: ${clip.credit}` : 'No credit set'}</p>
        </div>
        {clip.canDelete && (
          <div className="flex shrink-0">
            <button type="button" className="btn-ghost p-2 text-ink-400 hover:text-white" onClick={() => onCredit(clip)} title="Edit credit"><Pencil className="size-4" /></button>
            <button type="button" className="btn-ghost p-2 text-ink-400 hover:text-red-300" onClick={() => onDelete(clip)} title="Delete clip"><Trash2 className="size-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Gameplay() {
  const { data, reload } = useApi('/gameplay', { poll: (d) => d.clips.some((c) => c.status === 'processing') });
  const fileRef = useRef(null);
  const [game, setGame] = useState('');
  const [credit, setCredit] = useState('');
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState(null);

  if (!data) return <div className="grid h-64 place-items-center"><Spinner /></div>;

  const gameNames = [...new Set(data.clips.map((c) => c.gameName))];
  const byGame = gameNames.map((name) => ({ name, clips: data.clips.filter((c) => c.gameName === name) }));

  const upload = async (e) => {
    e.preventDefault();
    if (!game.trim() || !files.length) return;
    setNotice(null);
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress({ index: i, total: files.length, fraction: 0 });
        await uploadClip(files[i], game.trim(), credit.trim(), (fraction) => setProgress({ index: i, total: files.length, fraction }));
        reload();
      }
      setNotice({ tone: 'success', text: `Uploaded ${files.length} clip${files.length === 1 ? '' : 's'}. ${files.length === 1 ? 'It' : 'They'}'ll be ready to use in a minute or two, once processed.` });
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    }
    setProgress(null);
    reload();
  };

  const editCredit = async (clip) => {
    const next = window.prompt('Credit added to the caption of every video that uses this clip (e.g. the channel that made it). Leave empty for none.', clip.credit || '');
    if (next === null) return;
    try {
      await api(`/gameplay/${clip.id}`, { method: 'PATCH', body: { credit: next } });
      reload();
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    }
  };

  const remove = async (clip) => {
    if (!window.confirm(`Delete "${clip.name}"? Videos already made keep their footage.`)) return;
    try {
      await api(`/gameplay/${clip.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    }
  };

  const pct = progress ? Math.round(((progress.index + progress.fraction) / progress.total) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Gameplay library"
        subtitle="Footage for gameplay videos. Choose Gameplay footage under Visuals when creating a series, and BlackCell cuts these clips to fit each video."
      />
      {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <form onSubmit={upload} className="card mb-10 grid gap-5 p-6 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <div>
          <label className="label" htmlFor="game">Game</label>
          <input id="game" className="input" list="games" placeholder="e.g. GTA V, Marvel's Spider-Man 2" value={game} onChange={(e) => setGame(e.target.value)} maxLength={60} required />
          <datalist id="games">{gameNames.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor="credit">Credit <span className="normal-case text-ink-400">(optional)</span></label>
          <input id="credit" className="input" placeholder="e.g. Orbital - No Copyright Gameplay" value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={200} />
        </div>
        <div>
          <label className="label" htmlFor="clips">Video files</label>
          <input id="clips" ref={fileRef} type="file" accept="video/*,.mkv" multiple className="input py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-sm file:text-white" onChange={(e) => setFiles([...(e.target.files || [])])} required />
        </div>
        <button className="btn-primary py-3" disabled={Boolean(progress) || !files.length || !game.trim()}>
          <Upload className="size-4" /> {progress ? `Uploading ${pct}%` : `Upload${files.length > 1 ? ` ${files.length} clips` : ''}`}
        </button>
        {progress && (
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10 lg:col-span-4"><div className="h-full bg-gradient-brand transition-all" style={{ width: `${pct}%` }} /></div>
        )}
        <p className="text-xs leading-relaxed text-ink-400 lg:col-span-4">
          Use footage you're allowed to use: your own recordings, or gameplay packs whose creators allow reuse. Don't upload clips taken from other people's videos, as platforms flag reposted footage.
          If the footage's licence asks for credit (Creative Commons usually does), fill in <strong className="text-ink-300">Credit</strong>: it's added to the caption of every video that uses it.
          A series works through the footage in order, so each video gets a fresh stretch until it's all used, then starts over.
          Upload long videos in parts if they're over the size limit. Up to {data.maxUploadMb >= 1024 ? `${data.maxUploadMb / 1024} GB` : `${data.maxUploadMb} MB`} per file; game audio is removed.
          {data.shareUploads ? ' As an admin, your uploads are shared with every user.' : ' Your uploads are only visible to you.'}
        </p>
      </form>

      {byGame.length ? byGame.map(({ name, clips }) => {
        const ready = clips.filter((c) => c.status === 'ready');
        return (
          <section key={name} className="mb-10">
            <h2 className="mb-4 flex flex-wrap items-baseline gap-x-3 font-display text-xl font-bold">
              {name}
              <span className="text-sm font-normal text-ink-400">{ready.length} clip{ready.length === 1 ? '' : 's'} · {formatDuration(ready.reduce((sum, c) => sum + (c.duration || 0), 0))} of footage</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {clips.map((c) => <ClipCard key={c.id} clip={c} onDelete={remove} onCredit={editCredit} />)}
            </div>
          </section>
        );
      }) : (
        <EmptyState icon={Gamepad2} title="No gameplay yet">
          Upload clips from a game above, then create a series with <strong>Gameplay footage</strong> visuals.
        </EmptyState>
      )}
    </>
  );
}
