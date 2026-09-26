import { useState } from 'react';
import { PageHeader, Alert, ProgressBar } from '../components/ui.jsx';
import { PricingCards } from './Landing.jsx';
import { api, useSession, useCatalog, byId } from '../lib.jsx';

export default function Billing() {
  const { usage, setSession } = useSession();
  const catalog = useCatalog();
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const plan = byId(catalog?.plans)[usage?.plan];

  const select = async (id) => {
    setBusy(id);
    setNotice(null);
    try {
      setSession(await api('/billing/plan', { method: 'POST', body: { plan: id } }));
      setNotice({ tone: 'success', text: `You're now on the ${byId(catalog.plans)[id].name} plan.` });
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Plan & billing" subtitle="Change plans any time." />
      {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      {catalog?.providers?.demoBilling
        ? <Alert tone="info">Demo billing: payments aren’t connected, so plan changes apply instantly and nothing is charged. Wire up Stripe Checkout in <code>server/index.js</code> (<code>/api/billing/plan</code>) before launch.</Alert>
        : <Alert tone="info">Paid plans are coming soon. Payments haven’t been set up on this server yet.</Alert>}

      {usage && (
        <div className="card mb-10 grid gap-6 p-6 sm:grid-cols-3">
          <div>
            <p className="label">Current plan</p>
            <p className="font-display text-2xl font-extrabold">{plan?.name}</p>
            <p className="text-sm text-ink-400">${plan?.price}/month</p>
          </div>
          <div>
            <p className="label">Videos this month</p>
            <p className="font-display text-2xl font-extrabold">{usage.videosUsed} <span className="text-base text-ink-400">/ {usage.videosLimit}</span></p>
            <ProgressBar value={usage.videosUsed / usage.videosLimit} className="mt-3" />
          </div>
          <div>
            <p className="label">Series</p>
            <p className="font-display text-2xl font-extrabold">{usage.seriesUsed} <span className="text-base text-ink-400">/ {usage.seriesLimit}</span></p>
            <ProgressBar value={usage.seriesUsed / usage.seriesLimit} className="mt-3" />
          </div>
        </div>
      )}
      <PricingCards onSelect={select} currentPlan={usage?.plan} busyPlan={busy} />
    </>
  );
}
