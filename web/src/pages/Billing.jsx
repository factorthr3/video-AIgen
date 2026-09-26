import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CreditCard, ExternalLink } from 'lucide-react';
import { PageHeader, Alert, ProgressBar } from '../components/ui.jsx';
import { PricingCards } from './Landing.jsx';
import { api, useSession, useCatalog, usePrice, byId } from '../lib.jsx';

const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');

function StatusChip({ billing }) {
  if (!billing?.enabled) return null;
  if (billing.comped) return <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-300">Admin access</span>;
  const map = {
    active: ['Active', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'],
    trialing: ['Trial', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'],
    past_due: ['Payment failed', 'border-amber-500/30 bg-amber-500/10 text-amber-200'],
  };
  const [label, cls] = map[billing.status] || ['No active plan', 'border-white/10 bg-white/5 text-ink-300'];
  return <span className={`chip ${cls}`}>{billing.cancelAtPeriodEnd && billing.status === 'active' ? 'Cancelling' : label}</span>;
}

export default function Billing() {
  const { usage, setSession, refresh } = useSession();
  const catalog = useCatalog();
  const price = usePrice();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const plan = byId(catalog?.plans)[usage?.plan];
  const billing = usage?.billing || {};
  const stripe = Boolean(catalog?.providers?.billing?.stripe);

  // Back from Stripe Checkout: the webhook activates the plan within seconds.
  const checkout = params.get('checkout');
  useEffect(() => {
    if (checkout === 'cancelled') {
      setNotice({ tone: 'info', text: "Checkout cancelled. You haven't been charged." });
      setParams({}, { replace: true });
    }
    if (checkout !== 'success') return undefined;
    setNotice({ tone: 'info', text: 'Payment received. Activating your plan…' });
    let tries = 0;
    const timer = setInterval(async () => {
      const data = await refresh();
      tries++;
      if (data?.usage?.billing?.active) {
        clearInterval(timer);
        setNotice({ tone: 'success', text: `You're all set: your ${byId(catalog?.plans)[data.usage.plan]?.name || ''} plan is active.` });
        setParams({}, { replace: true });
      } else if (tries >= 15) {
        clearInterval(timer);
        setNotice({ tone: 'warn', text: "Your payment went through, but activation is taking longer than usual. Refresh in a minute, or contact support@blackcell.app if it doesn't update." });
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [checkout]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = async (id) => {
    setBusy(id);
    setNotice(null);
    try {
      const res = await api('/billing/plan', { method: 'POST', body: { plan: id } });
      if (res.url) {
        window.location.href = res.url; // Stripe Checkout
        return;
      }
      setSession(res);
      setNotice({ tone: 'success', text: `You're now on the ${byId(catalog.plans)[id].name} plan.` });
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    }
    setBusy(null);
  };

  const manage = async () => {
    setBusy('portal');
    try {
      window.location.href = (await api('/billing/portal', { method: 'POST' })).url;
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
      setBusy(null);
    }
  };

  const activePlan = !billing.enabled || billing.active;

  return (
    <>
      <PageHeader
        title="Plan & billing"
        subtitle={stripe ? 'Monthly plans, billed securely by Stripe. Change or cancel any time.' : 'Change plans any time.'}
        actions={stripe && billing.hasCustomer && (
          <button className="btn-secondary" onClick={manage} disabled={busy === 'portal'}>
            <CreditCard className="size-4" /> {busy === 'portal' ? 'Opening…' : 'Manage billing'} <ExternalLink className="size-3.5 opacity-60" />
          </button>
        )}
      />
      {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      {stripe && !activePlan && !notice && <Alert tone="warn">Choose a plan below to start creating videos. You can change or cancel any time.</Alert>}
      {stripe && billing.status === 'past_due' && (
        <Alert tone="warn">Your last payment failed. Update your card in <strong>Manage billing</strong> to keep your series running.</Alert>
      )}
      {!stripe && (catalog?.providers?.demoBilling
        ? <Alert tone="info">Demo billing: payments aren't connected, so plan changes apply instantly and nothing is charged.</Alert>
        : <Alert tone="info">Paid plans are coming soon. Payments haven't been set up on this server yet.</Alert>)}

      {usage && (
        <div className="card mb-10 grid gap-6 p-6 sm:grid-cols-3">
          <div>
            <p className="label">Current plan</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-2xl font-extrabold">{activePlan ? plan?.name : 'None'}</p>
              <StatusChip billing={billing} />
            </div>
            {activePlan && plan && <p className="text-sm text-ink-400">{price.format(plan.price)}/month</p>}
            {billing.enabled && billing.currentPeriodEnd && !billing.comped && (
              <p className="mt-1 text-xs text-ink-400">{billing.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on {dateLabel(billing.currentPeriodEnd)}</p>
            )}
          </div>
          <div>
            <p className="label">Videos this month</p>
            <p className="font-display text-2xl font-extrabold">{usage.videosUsed} <span className="text-base text-ink-400">/ {usage.videosLimit}</span></p>
            <ProgressBar value={usage.videosLimit ? usage.videosUsed / usage.videosLimit : 0} className="mt-3" />
          </div>
          <div>
            <p className="label">Series</p>
            <p className="font-display text-2xl font-extrabold">{usage.seriesUsed} <span className="text-base text-ink-400">/ {usage.seriesLimit}</span></p>
            <ProgressBar value={usage.seriesLimit ? usage.seriesUsed / usage.seriesLimit : 0} className="mt-3" />
          </div>
        </div>
      )}
      <PricingCards
        onSelect={select}
        currentPlan={activePlan ? usage?.plan : null}
        busyPlan={busy === 'portal' ? null : busy}
        verb={stripe && !activePlan ? 'Subscribe to' : 'Switch to'}
      />
      {stripe && <p className="mt-6 text-center text-xs text-ink-400">Switching plans takes effect immediately and is prorated. Cancel any time from Manage billing; you keep access until the end of the period.</p>}
    </>
  );
}
