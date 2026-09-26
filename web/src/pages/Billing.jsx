import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CreditCard, ExternalLink } from 'lucide-react';
import { PageHeader, Alert, ProgressBar } from '../components/ui.jsx';
import { PricingCards } from './Landing.jsx';
import { api, useSession, useCatalog, usePrice, byId } from '../lib.jsx';

const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const PROCESSOR = { paystack: 'Paystack', stripe: 'Stripe' };

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
  const payments = catalog?.providers?.billing || {};
  const paid = Boolean(payments.enabled);
  const paystack = payments.provider === 'paystack';
  const processor = PROCESSOR[payments.provider];
  const chargedIn = payments.chargeCurrency && payments.chargeCurrency !== payments.currency ? payments.chargeCurrency.toUpperCase() : null;

  // Back from hosted checkout. Paystack is confirmed before the redirect;
  // Stripe's webhook activates the plan within seconds, so poll until it has.
  const checkout = params.get('checkout');
  useEffect(() => {
    if (checkout === 'cancelled' || checkout === 'failed') {
      setNotice({ tone: 'info', text: "The payment wasn't completed, so you haven't been charged." });
      setParams({}, { replace: true });
    }
    if (checkout === 'error') {
      setNotice({ tone: 'warn', text: "We couldn't confirm your payment just now. If you were charged, your plan will activate shortly; otherwise contact support@blackcell.app." });
      setParams({}, { replace: true });
    }
    if (checkout !== 'success') return undefined;
    setNotice({ tone: 'info', text: 'Payment received. Activating your plan…' });
    let tries = 0;
    const timer = setInterval(async () => {
      const data = await refresh();
      tries++;
      if (data?.usage?.billing?.active && (data.usage.billing.hasCustomer || data.usage.billing.status === 'active')) {
        clearInterval(timer);
        setNotice({ tone: 'success', text: `You're all set: your ${byId(catalog?.plans)[data.usage.plan]?.name || ''} plan is active.` });
        setParams({}, { replace: true });
      } else if (tries >= 15) {
        clearInterval(timer);
        setNotice({ tone: 'warn', text: "Your payment went through, but activation is taking longer than usual. Refresh in a minute, or contact support@blackcell.app if it doesn't update." });
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [checkout]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = async (id) => {
    setBusy(id);
    setNotice(null);
    try {
      const res = await api('/billing/plan', { method: 'POST', body: { plan: id } });
      if (res.url) {
        window.location.href = res.url; // hosted checkout
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

  const cancel = async () => {
    const until = billing.currentPeriodEnd ? ` You'll keep your plan until ${dateLabel(billing.currentPeriodEnd)}.` : '';
    if (!window.confirm(`Cancel your plan? It won't renew.${until}`)) return;
    setBusy('cancel');
    setNotice(null);
    try {
      setSession(await api('/billing/cancel', { method: 'POST' }));
      setNotice({ tone: 'success', text: `Your plan is cancelled and won't renew.${until}` });
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    }
    setBusy(null);
  };

  const activePlan = !billing.enabled || billing.active;
  const canCancel = paystack && billing.hasCustomer && billing.status === 'active' && !billing.cancelAtPeriodEnd;
  // In test mode admins can try the real checkout before they've subscribed.
  const tryingCheckout = paid && payments.testMode && billing.comped && !billing.hasCustomer;

  return (
    <>
      <PageHeader
        title="Plan & billing"
        subtitle={paid ? `Monthly plans, billed securely by ${processor}. Change or cancel any time.` : 'Change plans any time.'}
        actions={paid && billing.hasCustomer && (
          <div className="flex flex-wrap gap-2">
            {canCancel && (
              <button className="btn-ghost" onClick={cancel} disabled={busy === 'cancel'}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel plan'}</button>
            )}
            <button className="btn-secondary" onClick={manage} disabled={busy === 'portal'}>
              <CreditCard className="size-4" /> {busy === 'portal' ? 'Opening…' : paystack ? 'Update card' : 'Manage billing'} <ExternalLink className="size-3.5 opacity-60" />
            </button>
          </div>
        )}
      />
      {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      {paid && payments.testMode && (
        <Alert tone="info">
          <strong>Test mode:</strong> no real money moves. {paystack
            ? <>Pay with card <span className="font-mono">4084 0840 8408 4081</span>, any future expiry, CVV <span className="font-mono">408</span>.</>
            : <>Pay with card <span className="font-mono">4242 4242 4242 4242</span>, any future expiry and CVC.</>}
        </Alert>
      )}
      {paid && !activePlan && !notice && <Alert tone="warn">Choose a plan below to start creating videos. You can change or cancel any time.</Alert>}
      {paid && billing.status === 'past_due' && (
        <Alert tone="warn">Your last payment failed. {paystack ? 'Update your card' : <>Update your card in <strong>Manage billing</strong></>} to keep your series running.</Alert>
      )}
      {!paid && (catalog?.providers?.demoBilling
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
        currentPlan={activePlan && !tryingCheckout ? usage?.plan : null}
        busyPlan={busy === 'portal' || busy === 'cancel' ? null : busy}
        verb={paid && (!activePlan || tryingCheckout) ? 'Subscribe to' : 'Switch to'}
      />
      {paid && (
        <p className="mt-6 text-center text-xs text-ink-400">
          {paystack
            ? `${chargedIn ? `Prices are in US dollars; Paystack charges the ${chargedIn} equivalent shown on each plan, so your statement shows ${chargedIn}. ` : ''}Switching plans starts the new plan today on your saved card. Cancel any time; you keep access until the end of the period you paid for.`
            : 'Switching plans takes effect immediately and is prorated. Cancel any time from Manage billing; you keep access until the end of the period.'}
        </p>
      )}
    </>
  );
}
