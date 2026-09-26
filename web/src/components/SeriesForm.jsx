import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Check, Upload, Wand2, Plus } from 'lucide-react';
import { AudioPreview, PlatformIcon, platformLabel } from './ui.jsx';
import { api, DAYS } from '../lib.jsx';

export const defaultForm = (catalog) => {
  const niche = catalog.niches[0];
  return {
    name: '',
    niche: niche.id,
    customTopic: '',
    language: 'en',
    voice: niche.voice,
    artStyle: niche.art,
    captionStyle: 'bold',
    music: niche.music,
    duration: 60,
    schedule: { days: [0, 1, 2, 3, 4, 5, 6], time: '18:00', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
    autoPost: true,
    accountIds: [],
  };
};

export function Section({ title, hint, children }) {
  return (
    <div className="mb-8">
      <p className="label">{title}</p>
      {hint && <p className="-mt-1 mb-3 text-sm text-ink-400">{hint}</p>}
      {children}
    </div>
  );
}

export function NichePicker({ catalog, form, setForm }) {
  const choose = (n) => setForm((f) => ({ ...f, niche: n.id, voice: n.voice, artStyle: n.art, music: f.music.startsWith('upload:') ? f.music : n.music }));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {catalog.niches.map((n) => (
          <button key={n.id} type="button" data-selected={form.niche === n.id} className="option relative overflow-hidden" onClick={() => choose(n)}>
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${n.colors[0]}, ${n.colors[1]})` }} />
            <span className="text-2xl">{n.emoji}</span>
            <p className="mt-3 font-semibold">{n.name}</p>
            <p className="mt-1 text-xs leading-snug text-ink-400">{n.tagline}</p>
          </button>
        ))}
        <button type="button" data-selected={form.niche === 'custom'} className="option border-dashed" onClick={() => setForm((f) => ({ ...f, niche: 'custom' }))}>
          <Wand2 className="size-6 text-brand-400" />
          <p className="mt-3 font-semibold">Custom topic</p>
          <p className="mt-1 text-xs leading-snug text-ink-400">Describe any niche and Nrrtv writes for it</p>
        </button>
      </div>
      {form.niche === 'custom' && (
        <div className="mt-4">
          <textarea
            className="input min-h-28"
            placeholder="e.g. Weird animal facts for kids, told with humour. Or: The rise and fall of famous tech companies."
            value={form.customTopic}
            onChange={(e) => setForm((f) => ({ ...f, customTopic: e.target.value }))}
          />
          {catalog.providers?.script?.provider === 'library' && (
            <p className="mt-2 text-xs text-amber-300/90">Custom topics need an ANTHROPIC_API_KEY on the server. Until then, demo scripts are used.</p>
          )}
        </div>
      )}
    </>
  );
}

const CAPTION_PREVIEW = {
  bold: <span className="font-display text-lg font-extrabold uppercase" style={{ WebkitTextStroke: '1px #000' }}>This <span className="text-yellow-300">is</span> it</span>,
  boxed: <span className="text-base font-extrabold uppercase">This <span className="rounded-md bg-brand-500 px-1.5">is</span> it</span>,
  neon: <span className="text-base font-extrabold uppercase">This <span className="text-cyan-200" style={{ textShadow: '0 0 12px #22d3ee' }}>is</span> it</span>,
  minimal: <span className="text-sm font-semibold">This is it</span>,
  none: <span className="text-xs text-ink-400">No captions</span>,
};

export function StylePicker({ catalog, form, setForm }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api('/uploads/music', { method: 'POST', form });
      set('music')(res.id);
      setUploadName(res.name);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Section title="Art style">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {catalog.artStyles.map((a) => (
            <button key={a.id} type="button" data-selected={form.artStyle === a.id} className="option p-2" onClick={() => set('artStyle')(a.id)}>
              <span className="block aspect-[4/3] rounded-xl" style={{ background: `linear-gradient(180deg, ${a.colors[0]}, ${a.colors[1]} 55%, ${a.colors[2]})` }} />
              <p className="mt-2 px-1 text-sm font-semibold">{a.name}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Narrator voice" hint={`Previews use your server's current voice engine (${catalog.providers?.voice?.provider}).`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.voices.map((v) => (
            <div key={v.id} role="button" tabIndex={0} data-selected={form.voice === v.id} className="option flex items-center justify-between gap-2 p-3" onClick={() => set('voice')(v.id)} onKeyDown={(e) => e.key === 'Enter' && set('voice')(v.id)}>
              <div>
                <p className="font-semibold">{v.name}</p>
                <p className="text-xs text-ink-400">{v.description}</p>
              </div>
              <AudioPreview src={`/api/voices/${v.id}/preview?language=${form.language}`} label="Play" />
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-x-6 md:grid-cols-2">
        <Section title="Language">
          <select className="input" value={form.language} onChange={(e) => set('language')(e.target.value)}>
            {catalog.languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Section>
        <Section title="Video length">
          <div className="grid grid-cols-3 gap-2">
            {catalog.durations.map((d) => (
              <button key={d.id} type="button" data-selected={form.duration === d.id} className="option py-3 text-center text-sm font-semibold" onClick={() => set('duration')(d.id)}>{d.name}</button>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Captions">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {catalog.captionStyles.map((c) => (
            <button key={c.id} type="button" data-selected={form.captionStyle === c.id} className="option p-2 text-center" onClick={() => set('captionStyle')(c.id)}>
              <span className="grid h-16 place-items-center whitespace-nowrap rounded-xl bg-gradient-to-b from-ink-700 to-ink-800">{CAPTION_PREVIEW[c.id]}</span>
              <p className="mt-2 text-sm font-semibold">{c.name}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Background music">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.music.map((m) => (
            <div key={m.id} role="button" tabIndex={0} data-selected={form.music === m.id} className="option flex items-center justify-between gap-2 p-3" onClick={() => set('music')(m.id)} onKeyDown={(e) => e.key === 'Enter' && set('music')(m.id)}>
              <div>
                <p className="font-semibold">{m.name}</p>
                {m.description && <p className="text-xs text-ink-400">{m.description}</p>}
              </div>
              {m.id !== 'none' && <AudioPreview src={`/api/music/${m.id}/preview`} label="Play" />}
            </div>
          ))}
          <button type="button" data-selected={form.music.startsWith('upload:')} className="option flex items-center gap-3 p-3" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="size-5 text-brand-400" />
            <div className="min-w-0">
              <p className="font-semibold">{uploading ? 'Uploading…' : 'Upload your own'}</p>
              <p className="truncate text-xs text-ink-400">{form.music.startsWith('upload:') ? uploadName || 'Custom track' : 'MP3, WAV or M4A, up to 15 MB'}</p>
            </div>
          </button>
          <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      </Section>
    </>
  );
}

export function SchedulePicker({ form, setForm, accounts }) {
  // Keep the current zone selectable even if the browser's list omits it (e.g. "UTC").
  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];
    return all.includes(form.schedule.timeZone) ? all : [form.schedule.timeZone, ...all];
  }, [form.schedule.timeZone]);
  const setSchedule = (patch) => setForm((f) => ({ ...f, schedule: { ...f.schedule, ...patch } }));
  const toggleDay = (d) => setSchedule({ days: form.schedule.days.includes(d) ? form.schedule.days.filter((x) => x !== d) : [...form.schedule.days, d].sort() });
  const toggleAccount = (id) => setForm((f) => ({ ...f, accountIds: f.accountIds.includes(id) ? f.accountIds.filter((x) => x !== id) : [...f.accountIds, id] }));

  return (
    <>
      <Section title="Posting days" hint="A new video is created and posted on each of these days.">
        <div className="flex flex-wrap gap-2">
          {DAYS.map((label, d) => (
            <button key={label} type="button" data-selected={form.schedule.days.includes(d)} className="option w-16 py-2.5 text-center text-sm font-semibold" onClick={() => toggleDay(d)}>{label}</button>
          ))}
        </div>
      </Section>
      <div className="grid gap-x-6 md:grid-cols-2">
        <Section title="Posting time">
          <input type="time" className="input" value={form.schedule.time} onChange={(e) => setSchedule({ time: e.target.value })} />
        </Section>
        <Section title="Timezone">
          <select className="input" value={form.schedule.timeZone} onChange={(e) => setSchedule({ timeZone: e.target.value })}>
            {zones.map((z) => <option key={z} value={z}>{z.replaceAll('_', ' ')}</option>)}
          </select>
        </Section>
      </div>

      <Section title="Post to">
        {accounts.length === 0 ? (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <p className="text-ink-300">No accounts connected yet. Videos will still be created, and you can post them later.</p>
            <Link to="/app/accounts" className="btn-secondary"><Plus className="size-4" /> Connect accounts</Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <button key={a.id} type="button" data-selected={form.accountIds.includes(a.id)} className="option flex items-center gap-3 p-3" onClick={() => toggleAccount(a.id)}>
                <PlatformIcon platform={a.platform} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.username}</p>
                  <p className="text-xs text-ink-400">{platformLabel(a.platform)}{a.demo ? ' · demo' : ''}</p>
                </div>
                {form.accountIds.includes(a.id) && <Check className="size-4 text-brand-400" />}
              </button>
            ))}
          </div>
        )}
      </Section>

      <label className="card flex cursor-pointer items-start gap-4 p-4">
        <input type="checkbox" className="mt-1 size-4 accent-brand-500" checked={form.autoPost} onChange={(e) => setForm((f) => ({ ...f, autoPost: e.target.checked }))} />
        <div>
          <p className="font-semibold">Auto-post on schedule</p>
          <p className="mt-0.5 text-sm text-ink-400">Off means review mode: videos are created on schedule and wait in your library until you post them.</p>
        </div>
      </label>
    </>
  );
}
