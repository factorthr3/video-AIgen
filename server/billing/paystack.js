// Paystack subscriptions: hosted checkout with a plan code subscribes the
// customer; the return URL verifies the payment straight away (so plans
// activate even without webhooks, e.g. in local testing); a signed webhook
// keeps renewals, failures and cancellations in sync. Plans are created in
// Paystack on first use. Inactive until PAYSTACK_SECRET_KEY is set.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { PLAN, PLANS, SELF_SERVE_PLANS } from '../catalog.js';
import { db, update } from '../db.js';

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });
export const enabled = () => Boolean(config.paystack.secretKey);

async function ps(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${config.paystack.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.paystack.secretKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    throw Object.assign(new Error(`Paystack ${res.status}: ${json.message || 'request failed'}`), { paystack: true, httpStatus: res.status });
  }
  return json.data;
}

// Customers get a clear message; the log gets Paystack's exact reply.
async function withPaystack(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.expose || !err.paystack) throw err;
    console.error(`[paystack] ${err.message}`);
    throw httpError(502, 'Payments are temporarily unavailable. Please try again in a moment, or contact support@blackcell.app.');
  }
}

// ---------- currency & prices ----------
// PAYSTACK_CURRENCY, else the account's own currency (read from /balance).
// Null until known: prices then show in USD and checkout waits for it.
let detectedCurrency = null;
export const currency = () => (config.paystack.currency || detectedCurrency || null)?.toUpperCase() || null;

async function ensureCurrency() {
  if (currency()) return currency();
  detectedCurrency = (await ps('/balance'))?.[0]?.currency || null;
  if (!currency()) throw httpError(503, 'Payments are being set up. Please try again soon.');
  return currency();
}

// ---------- prices ----------
// Prices are set in US dollars (the catalog). Paystack charges in the
// account's currency (rand in South Africa), so the dollar price is converted
// at the day's exchange rate and rounded up to a whole unit. A Paystack plan
// is reused while its amount is within 3% of today's conversion, so small rate
// moves don't create new plans; subscribers keep the amount they signed up at.
// PAYSTACK_EXCHANGE_RATE fixes the rate; PAYSTACK_PRICES fixes exact amounts.
const REFRESH_MS = 12 * 3600_000;
const REPRICE_AT = 0.03;
let fx = null; // { currency, rate, at }

async function fetchRate(to) {
  const sources = [
    [`https://api.frankfurter.app/latest?from=USD&to=${to}`, (d) => d.rates?.[to]],
    ['https://open.er-api.com/v6/latest/USD', (d) => d.rates?.[to]],
  ];
  for (const [url, pick] of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const rate = Number(pick(await res.json()));
      if (rate > 0) return rate;
    } catch {
      // try the next source
    }
  }
  return null;
}

function currentRate() {
  if (currency() === 'USD') return 1;
  if (config.paystack.exchangeRate) return config.paystack.exchangeRate;
  return fx?.currency === currency() ? fx.rate : null;
}

async function ensureRate() {
  const stale = !fx || fx.currency !== currency() || Date.now() - fx.at > REFRESH_MS;
  if (currency() !== 'USD' && !config.paystack.exchangeRate && stale) {
    const rate = await fetchRate(currency());
    if (rate) fx = { currency: currency(), rate, at: Date.now() };
    else console.error(`[paystack] could not fetch the USD→${currency()} rate${currentRate() ? '; keeping the last one' : ''}`);
  }
  if (!currentRate()) throw httpError(503, 'Payments are temporarily unavailable. Please try again in a moment.');
  return currentRate();
}

/** What a plan costs in the Paystack currency (major units), or null until the rate is known. */
function chargeFor(planId) {
  if (PLAN[planId]?.poa) return null; // priced on application
  if (config.paystack.prices[planId]) return config.paystack.prices[planId];
  const rate = currentRate();
  if (!rate) return null;
  return currency() === 'USD' ? PLAN[planId].price : Math.ceil(PLAN[planId].price * rate);
}

/** Dollar prices, plus what is actually charged when that isn't dollars. */
export function displayPlans() {
  const cur = currency();
  if (!cur || cur === 'USD') return PLANS;
  return PLANS.map((p) => {
    const amount = planCache.get(p.id)?.amount ?? chargeFor(p.id);
    return amount ? { ...p, charge: { amount, currency: cur.toLowerCase() } } : p;
  });
}

// ---------- plans ----------
const planName = (planId) => `BlackCell ${PLAN[planId].name}`;
const planCache = new Map(); // planId → { code, amount, at }
const planIdByCode = new Map();

async function planFor(planId) {
  const cached = planCache.get(planId);
  if (cached && Date.now() - cached.at < REFRESH_MS) return cached;
  await ensureCurrency();
  await ensureRate();
  const amount = Math.round(chargeFor(planId) * 100);
  const exact = Boolean(config.paystack.prices[planId]) || currency() === 'USD';
  const near = (p) => (exact ? Number(p.amount) === amount : Math.abs(Number(p.amount) - amount) / amount <= REPRICE_AT);
  const existing = ((await ps('/plan?perPage=100&interval=monthly')) || [])
    .filter((p) => p.name === planName(planId) && String(p.currency).toUpperCase() === currency() && !p.is_deleted && !p.is_archived && near(p))
    .sort((a, b) => Math.abs(a.amount - amount) - Math.abs(b.amount - amount));
  const plan = existing[0] || await ps('/plan', {
    method: 'POST',
    body: { name: planName(planId), amount, interval: 'monthly', currency: currency(), description: `${planName(planId)} plan, billed monthly` },
  });
  const entry = { code: plan.plan_code, amount: Number(plan.amount) / 100, at: Date.now() };
  planCache.set(planId, entry);
  planIdByCode.set(plan.plan_code, planId);
  return entry;
}

/** Look up the currency, rate and plans at startup, then twice a day, so shown prices match checkout. */
export async function warmUp() {
  if (!enabled()) return;
  const refresh = async () => {
    try {
      await ensureCurrency();
      for (const p of SELF_SERVE_PLANS) await planFor(p.id);
      const plans = SELF_SERVE_PLANS.map((p) => `${p.id} $${p.price}${currency() === 'USD' ? '' : ` = ${planCache.get(p.id).amount} ${currency()}`}`);
      console.log(`[paystack] ${currency()}${currency() === 'USD' ? '' : ` at ${currentRate()}/USD`}: ${plans.join(', ')}`);
    } catch (err) {
      console.error('[paystack] price setup failed:', err.message);
    }
  };
  await refresh();
  setInterval(refresh, REFRESH_MS + 60_000).unref();
}

function planIdFrom(plan) {
  const code = typeof plan === 'string' ? plan : plan?.plan_code;
  if (code && planIdByCode.has(code)) return planIdByCode.get(code);
  return PLANS.find((p) => planName(p.id) === plan?.name)?.id || null;
}

// ---------- syncing ----------
// Paystack statuses → ours. "non-renewing" stays active until the period ends.
const STATUS = { active: 'active', 'non-renewing': 'active', attention: 'past_due', completed: 'canceled', cancelled: 'canceled' };
const inAMonth = () => new Date(Date.now() + 31 * 86400_000).toISOString();
const iso = (d) => (d ? new Date(d).toISOString() : null);

function applySubscription(user, sub) {
  const planId = planIdFrom(sub.plan);
  update('users', user.id, {
    ...(PLAN[planId] ? { plan: planId } : {}),
    paystack_subscription_code: sub.subscription_code,
    paystack_email_token: sub.email_token,
    subscription_status: STATUS[sub.status] || sub.status,
    cancel_at_period_end: sub.status === 'non-renewing' ? 1 : 0,
    current_period_end: iso(sub.next_payment_date) || user.current_period_end,
  });
}

/** Pull the customer's current subscription from Paystack (it can appear a few seconds after payment). */
export async function refreshSubscription(user) {
  if (!enabled() || !user.paystack_customer_id) return;
  const subs = (await ps(`/subscription?customer=${user.paystack_customer_id}&perPage=20`)) || [];
  const current = subs
    .filter((s) => ['active', 'non-renewing', 'attention'].includes(s.status))
    .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))[0];
  if (current) applySubscription(db.get('SELECT * FROM users WHERE id = ?', user.id), current);
}

function findUser(data) {
  const meta = parseMeta(data.metadata);
  return (meta.userId && db.get('SELECT * FROM users WHERE id = ?', meta.userId))
    || (data.customer?.customer_code && db.get('SELECT * FROM users WHERE paystack_customer_code = ?', data.customer.customer_code))
    || (data.customer?.email && db.get('SELECT * FROM users WHERE email = ?', String(data.customer.email).toLowerCase()))
    || null;
}

function parseMeta(meta) {
  if (!meta) return {};
  if (typeof meta === 'object') return meta;
  try {
    return JSON.parse(meta);
  } catch {
    return {};
  }
}

// Record a successful plan payment (from the return URL or charge.success).
function recordPayment(user, tx) {
  const meta = parseMeta(tx.metadata);
  const planId = PLAN[meta.plan] ? meta.plan : planIdFrom(tx.plan_object || tx.plan);
  update('users', user.id, {
    ...(PLAN[planId] ? { plan: planId } : {}),
    subscription_status: 'active',
    cancel_at_period_end: 0,
    paystack_customer_code: tx.customer?.customer_code || user.paystack_customer_code,
    paystack_customer_id: tx.customer?.id != null ? String(tx.customer.id) : user.paystack_customer_id,
    paystack_authorization: tx.authorization?.reusable ? tx.authorization.authorization_code : user.paystack_authorization,
    current_period_end: user.current_period_end && new Date(user.current_period_end) > new Date() ? user.current_period_end : inAMonth(),
  });
}

// ---------- actions ----------
export async function choosePlan(user, planId) {
  if (!PLAN[planId]) throw httpError(400, 'Unknown plan.');
  return withPaystack(async () => {
    const plan = await planFor(planId);
    // A cancelled plan that has run out means a fresh checkout, not a switch.
    const lapsed = user.cancel_at_period_end && user.current_period_end && new Date(user.current_period_end) < new Date();
    const subscribed = user.paystack_subscription_code && ['active', 'past_due'].includes(user.subscription_status) && !lapsed;
    if (subscribed && user.paystack_customer_code && user.paystack_authorization) {
      // Switch: start the new plan on the saved card, then stop the old one
      // renewing (after saving the new one, so the old one's events are ignored).
      const sub = await ps('/subscription', {
        method: 'POST',
        body: { customer: user.paystack_customer_code, plan: plan.code, authorization: user.paystack_authorization },
      });
      update('users', user.id, {
        plan: planId,
        subscription_status: 'active',
        cancel_at_period_end: 0,
        paystack_subscription_code: sub.subscription_code,
        paystack_email_token: sub.email_token,
        current_period_end: iso(sub.next_payment_date) || inAMonth(),
      });
      await ps('/subscription/disable', { method: 'POST', body: { code: user.paystack_subscription_code, token: user.paystack_email_token } })
        .catch((err) => console.error('[paystack] could not disable the previous subscription:', err.message));
      return { switched: true };
    }
    const init = await ps('/transaction/initialize', {
      method: 'POST',
      body: {
        email: user.email,
        amount: String(Math.round(plan.amount * 100)),
        plan: plan.code,
        currency: currency(),
        channels: ['card'], // renewals charge the saved card, so subscriptions start with one
        callback_url: `${config.appUrl}/api/paystack/return`,
        metadata: JSON.stringify({ userId: user.id, plan: planId }),
      },
    });
    return { url: init.authorization_url };
  });
}

/**
 * Paystack sends the customer back here after checkout. The payment is
 * verified with Paystack itself, and the account comes from the metadata we
 * set when starting checkout, so this doesn't depend on the browser session.
 */
export async function confirmReturn(reference) {
  return withPaystack(async () => {
    const tx = await ps(`/transaction/verify/${encodeURIComponent(reference)}`).catch((err) => {
      if ([400, 404].includes(err.httpStatus)) return null; // unknown reference
      throw err;
    });
    if (tx?.status !== 'success') return { ok: false };
    const user = findUser(tx);
    if (!user || !PLAN[parseMeta(tx.metadata).plan]) return { ok: false };
    recordPayment(user, tx);
    await refreshSubscription(db.get('SELECT * FROM users WHERE id = ?', user.id))
      .catch((err) => console.error('[paystack] subscription lookup failed:', err.message));
    return { ok: true };
  });
}

/** Paystack's hosted page to update the card (it also offers cancelling). */
export async function portalUrl(user) {
  if (!user.paystack_subscription_code) throw httpError(400, 'Your subscription is still being set up. Try again in a minute.');
  return withPaystack(async () => (await ps(`/subscription/${user.paystack_subscription_code}/manage/link`)).link);
}

/** Stop renewing; access continues until the end of the paid period. */
export async function cancelPlan(user) {
  if (!user.paystack_subscription_code) throw httpError(400, 'No active subscription to cancel.');
  await withPaystack(() => ps('/subscription/disable', { method: 'POST', body: { code: user.paystack_subscription_code, token: user.paystack_email_token } }));
  update('users', user.id, { cancel_at_period_end: 1 });
}

export async function cancelSubscriptionNow(user) {
  if (!enabled() || !user.paystack_subscription_code) return;
  await ps('/subscription/disable', { method: 'POST', body: { code: user.paystack_subscription_code, token: user.paystack_email_token } }).catch(() => {});
}

// ---------- webhook ----------
export async function handleWebhook(rawBody, signature) {
  if (!enabled()) throw httpError(404, 'Paystack is not set up on this server.');
  const expected = crypto.createHmac('sha512', config.paystack.secretKey).update(rawBody).digest('hex');
  const valid = typeof signature === 'string' && signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) throw httpError(400, 'Invalid Paystack signature.');

  const { event, data = {} } = JSON.parse(rawBody.toString('utf8'));
  const user = findUser(data);
  if (!user) return event;
  const sameSub = (code) => !user.paystack_subscription_code || user.paystack_subscription_code === code;

  switch (event) {
    case 'charge.success':
      // Only plan payments matter here (a plan object or our metadata).
      if (planIdFrom(data.plan) || PLAN[parseMeta(data.metadata).plan]) {
        recordPayment(user, data);
        await refreshSubscription(db.get('SELECT * FROM users WHERE id = ?', user.id)).catch(() => {});
      }
      break;
    case 'subscription.create':
      applySubscription(user, data);
      break;
    case 'subscription.not_renew':
      if (sameSub(data.subscription_code)) update('users', user.id, { cancel_at_period_end: 1 });
      break;
    case 'subscription.disable':
      // Paid time is honoured: access continues until the period ends.
      if (sameSub(data.subscription_code)) {
        const paidUp = user.current_period_end && new Date(user.current_period_end) > new Date();
        update('users', user.id, paidUp ? { cancel_at_period_end: 1 } : { subscription_status: 'canceled', cancel_at_period_end: 0 });
      }
      break;
    case 'invoice.payment_failed':
      if (sameSub(data.subscription?.subscription_code)) update('users', user.id, { subscription_status: 'past_due' });
      break;
    case 'invoice.update':
      if (data.paid && data.status === 'success' && sameSub(data.subscription?.subscription_code)) {
        update('users', user.id, { subscription_status: 'active', current_period_end: iso(data.subscription?.next_payment_date) || user.current_period_end });
      }
      break;
    default:
      break;
  }
  return event;
}
