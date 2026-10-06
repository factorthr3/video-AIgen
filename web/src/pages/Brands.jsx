import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus, Store, Images, Megaphone } from 'lucide-react';
import { PageHeader, Alert, Spinner, EmptyState } from '../components/ui.jsx';
import { api, useApi, useSession } from '../lib.jsx';

export function BrandLogo({ brand, className = 'size-12' }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white ${className}`}>
      {brand.logo?.status === 'ready'
        ? <img src={`/api/assets/${brand.logo.id}/thumb`} alt="" className="max-h-[80%] max-w-[80%] object-contain" />
        : <span className="font-display text-lg font-extrabold text-ink-950">{brand.name[0]?.toUpperCase()}</span>}
    </span>
  );
}

export function NewBrandForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({ name: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { brand } = await api('/brands', { method: 'POST', body: form });
      onCreated(brand);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="card mb-8 p-6">
      <h2 className="mb-4 font-display text-lg font-bold">New brand</h2>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="bname">Brand name</label>
          <input id="bname" className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Northwind Coffee" autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="bweb">Website <span className="normal-case text-ink-400">(optional)</span></label>
          <input id="bweb" className="input" maxLength={200} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="northwindcoffee.com" />
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create brand'}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export default function Brands() {
  const { data, error } = useApi('/brands');
  const { usage } = useSession();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  if (error) return <Alert>{error.message}</Alert>;
  if (!data) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const atLimit = usage && usage.brandsUsed >= usage.brandsLimit;
  return (
    <>
      <PageHeader
        title="Brands"
        subtitle="Each brand keeps its logo, colours, font and assets, so every ad stays on-brand."
        actions={!adding && <button className="btn-primary" onClick={() => setAdding(true)} disabled={atLimit} title={atLimit ? 'Your plan’s brand limit is reached' : ''}><Plus className="size-4" /> New brand</button>}
      />
      {atLimit && !usage.needsPlan && <Alert tone="info">Your plan includes {usage.brandsLimit} brand{usage.brandsLimit === 1 ? '' : 's'}. <Link to="/app/billing" className="underline">Upgrade</Link> to add more.</Alert>}
      {usage?.needsPlan && <Alert tone="warn">Choose a plan on <Link to="/app/billing" className="underline">Plan &amp; billing</Link> to set up brands.</Alert>}
      {adding && <NewBrandForm onCreated={(b) => navigate(`/app/brands/${b.id}?new=1`)} onCancel={() => setAdding(false)} />}
      {data.brands.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.brands.map((b) => (
            <Link key={b.id} to={`/app/brands/${b.id}`} className="card flex items-center gap-4 p-5 transition hover:border-white/20">
              <BrandLogo brand={b} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold">{b.name}</p>
                <p className="mt-1 flex items-center gap-3 text-xs text-ink-400">
                  <span className="flex items-center gap-1"><Images className="size-3.5" /> {b.assets} asset{b.assets === 1 ? '' : 's'}</span>
                  <span className="flex items-center gap-1"><Megaphone className="size-3.5" /> {b.adsets} ad set{b.adsets === 1 ? '' : 's'}</span>
                </p>
              </div>
              <span className="flex gap-1">{b.colors.map((c) => <span key={c} className="size-4 rounded-full border border-white/20" style={{ background: c }} />)}</span>
            </Link>
          ))}
        </div>
      ) : !adding && (
        <EmptyState icon={Store} title="Set up your first brand" action={<button className="btn-primary" onClick={() => setAdding(true)} disabled={usage?.needsPlan}><Plus className="size-4" /> New brand</button>}>
          Add the logo, colours and the product photos or videos you want in your ads.
        </EmptyState>
      )}
    </>
  );
}
