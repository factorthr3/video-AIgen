import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Rocket, Check } from 'lucide-react';
import { PageHeader, Alert, Spinner } from '../components/ui.jsx';
import { NichePicker, StylePicker, SchedulePicker, Section, defaultForm } from '../components/SeriesForm.jsx';
import { api, useApi, useCatalog, useSession, byId, describeDays } from '../lib.jsx';

const STEPS = ['Niche', 'Look & voice', 'Schedule', 'Review'];

export default function SeriesNew() {
  const catalog = useCatalog();
  const { refresh } = useSession();
  const navigate = useNavigate();
  const { data: accountData } = useApi('/accounts');
  const [form, setForm] = useState(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (catalog && !form) setForm(defaultForm(catalog));
  }, [catalog, form]);
  // Pre-select every connected account.
  useEffect(() => {
    if (accountData && form && !form._accountsInit) {
      setForm((f) => ({ ...f, accountIds: accountData.accounts.map((a) => a.id), _accountsInit: true }));
    }
  }, [accountData, form]);

  if (!catalog || !form || !accountData) return <div className="grid h-64 place-items-center"><Spinner /></div>;

  const accounts = accountData.accounts;
  const niche = byId(catalog.niches)[form.niche];
  const canContinue = step !== 0 || form.niche !== 'custom' || form.customTopic.trim().length > 3;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { _accountsInit, ...body } = form;
      const res = await api('/series', { method: 'POST', body });
      await refresh();
      navigate(res.video ? `/app/videos/${res.video.id}?new=1` : `/app/series/${res.series.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const summary = [
    ['Niche', form.niche === 'custom' ? `Custom: ${form.customTopic}` : `${niche.emoji} ${niche.name}`],
    ['Art style', byId(catalog.artStyles)[form.artStyle]?.name],
    ['Voice', `${byId(catalog.voices)[form.voice]?.name} · ${byId(catalog.languages)[form.language]?.name}`],
    ['Captions', byId(catalog.captionStyles)[form.captionStyle]?.name],
    ['Music', form.music.startsWith('upload:') ? 'Your upload' : byId(catalog.music)[form.music]?.name],
    ['Length', byId(catalog.durations)[form.duration]?.name],
    ['Schedule', `${describeDays(form.schedule.days)} at ${form.schedule.time} (${form.schedule.timeZone.replaceAll('_', ' ')})`],
    ['Posting', form.accountIds.length ? `${form.autoPost ? 'Auto-post' : 'Review first'} to ${form.accountIds.length} account${form.accountIds.length > 1 ? 's' : ''}` : 'Library only (no accounts)'],
  ];

  return (
    <>
      <PageHeader title="Create a series" subtitle="Set it up once. Nrrtv keeps the channel running." />

      <ol className="mb-10 flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${i === step ? 'bg-white/10 text-white' : i < step ? 'text-brand-400 hover:bg-white/5' : 'text-ink-400'}`}
            >
              <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${i < step ? 'bg-brand-500 text-white' : i === step ? 'bg-gradient-brand' : 'bg-white/10'}`}>
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              {s}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-white/10" />}
          </li>
        ))}
      </ol>

      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}

      {step === 0 && <Section title="What should this channel be about?"><NichePicker catalog={catalog} form={form} setForm={setForm} /></Section>}
      {step === 1 && <StylePicker catalog={catalog} form={form} setForm={setForm} />}
      {step === 2 && <SchedulePicker form={form} setForm={setForm} accounts={accounts} />}
      {step === 3 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="card p-6">
            <Section title="Series name">
              <input className="input" placeholder={form.niche === 'custom' ? 'My channel' : niche.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Section>
            <dl className="divide-y divide-white/5">
              {summary.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6 py-3 text-sm">
                  <dt className="text-ink-400">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="card flex flex-col justify-between gap-6 p-6">
            <div>
              <Rocket className="size-8 text-brand-400" />
              <h3 className="mt-4 font-display text-xl font-bold">Ready for launch</h3>
              <p className="mt-2 text-sm text-ink-400">Your first video starts rendering as soon as you create the series. It takes a minute or two, and you can watch it build.</p>
            </div>
            <button className="btn-primary w-full py-3" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create series & first video'}</button>
          </div>
        </div>
      )}

      <div className="mt-10 flex justify-between border-t border-white/5 pt-6">
        <button className="btn-secondary" onClick={() => (step ? setStep(step - 1) : navigate(-1))}><ArrowLeft className="size-4" /> Back</button>
        {step < 3 && <button className="btn-primary" disabled={!canContinue} onClick={() => setStep(step + 1)}>Continue <ArrowRight className="size-4" /></button>}
      </div>
    </>
  );
}
