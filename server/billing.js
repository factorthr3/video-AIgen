// Stripe subscriptions: Checkout to subscribe, subscription updates to switch
// plans, the Billing Portal to manage or cancel, and a webhook that keeps each
// user's plan and status in sync. Everything here is inactive until
// STRIPE_SECRET_KEY is set.
import Stripe from 'stripe';
import { config } from './config.js';
import { PLAN, PLANS } from './catalog.js';
import { db, update } from './db.js';

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

// Stripe failures: customers get a clear message (card problems verbatim),
// the log gets the exact cause.
async function withStripe(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.expose || !String(err.type || '').startsWith('Stripe')) throw err;
    console.error(`[billing] ${err.type}: ${err.message}`);
    throw httpError(502, err.type === 'StripeCardError'
      ? err.message
      : 'Payments are temporarily unavailable. Please try again in a moment, or contact support@blackcell.app.');
  }
}

let client;
export const stripeEnabled = () => Boolean(config.stripe.secretKey);
const stripe = () => (client ??= new Stripe(config.stripe.secretKey));

// ---------- access ----------
// past_due keeps access while Stripe retries the payment (Smart Retries).
const ACTIVE = new Set(['active', 'trialing', 'past_due']);
export const isAdmin = (user) => config.adminEmails.includes(String(user.email).toLowerCase());

export function billingState(user) {
  if (!stripeEnabled()) return { enabled: false, active: true };
  const state = {
    enabled: true,
    status: user.subscription_status || 'none',
    currentPeriodEnd: user.current_period_end || null,
    cancelAtPeriodEnd: Boolean(user.cancel_at_period_end),
    hasCustomer: Boolean(user.stripe_customer_id),
  };
  if (isAdmin(user)) return { ...state, active: true, comped: true };
  return { ...state, active: ACTIVE.has(user.subscription_status) };
}

// ---------- prices ----------
// Products and prices are created on first use and found again by lookup_key,
// so no Stripe dashboard setup is needed. If a plan's price changes in the
// catalog, a new Stripe price is created and takes over the lookup_key.
const lookupKey = (planId) => `blackcell_${planId}_monthly`;
const planFromLookupKey = (key) => PLANS.find((p) => lookupKey(p.id) === key)?.id;
const priceCache = new Map();

async function priceIdFor(planId) {
  if (priceCache.has(planId)) return priceCache.get(planId);
  const plan = PLAN[planId];
  const unitAmount = Math.round(plan.price * 100);
  const key = lookupKey(planId);
  let price = (await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 })).data[0];
  if (!price || price.unit_amount !== unitAmount || price.currency !== config.stripe.currency) {
    const productId = price
      ? (typeof price.product === 'string' ? price.product : price.product.id)
      : (await stripe().products.create({ name: `BlackCell ${plan.name}`, metadata: { plan: planId } })).id;
    price = await stripe().prices.create({
      product: productId,
      unit_amount: unitAmount,
      currency: config.stripe.currency,
      recurring: { interval: 'month' },
      lookup_key: key,
      transfer_lookup_key: true,
      metadata: { plan: planId },
    });
  }
  priceCache.set(planId, price.id);
  return price.id;
}

async function customerIdFor(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await stripe().customers.create({ email: user.email, name: user.name || undefined, metadata: { userId: user.id } });
  update('users', user.id, { stripe_customer_id: customer.id });
  return customer.id;
}

// ---------- sync ----------
const idOf = (x) => (typeof x === 'string' ? x : x?.id);

export function syncSubscription(sub) {
  const customerId = idOf(sub.customer);
  const user = (sub.metadata?.userId && db.get('SELECT * FROM users WHERE id = ?', sub.metadata.userId))
    || db.get('SELECT * FROM users WHERE stripe_customer_id = ?', customerId);
  if (!user) return;
  // Ignore late events about an old subscription once the user has a newer one.
  if (user.stripe_subscription_id && user.stripe_subscription_id !== sub.id && !ACTIVE.has(sub.status)) return;
  const item = sub.items?.data?.[0];
  const planId = planFromLookupKey(item?.price?.lookup_key) || sub.metadata?.plan;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  const fields = {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end ? 1 : 0,
  };
  if (PLAN[planId]) fields.plan = planId;
  update('users', user.id, fields);
}

// ---------- actions ----------
/** Subscribe (returns a Checkout URL) or switch an existing subscription's plan. */
export async function choosePlan(user, planId) {
  if (!PLAN[planId]) throw httpError(400, 'Unknown plan.');
  return withStripe(() => subscribeOrSwitch(user, planId));
}

async function subscribeOrSwitch(user, planId) {
  const price = await priceIdFor(planId);
  if (user.stripe_subscription_id && ACTIVE.has(user.subscription_status)) {
    const sub = await stripe().subscriptions.retrieve(user.stripe_subscription_id);
    const updated = await stripe().subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0].id, price }],
      proration_behavior: 'create_prorations',
      cancel_at_period_end: false,
      metadata: { userId: user.id, plan: planId },
    });
    syncSubscription(updated);
    return { switched: true };
  }
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: await customerIdFor(user),
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: user.id, plan: planId } },
    metadata: { userId: user.id, plan: planId },
    success_url: `${config.appUrl}/app/billing?checkout=success`,
    cancel_url: `${config.appUrl}/app/billing?checkout=cancelled`,
  });
  return { url: session.url };
}

/** Stripe-hosted page to update the card, see invoices or cancel. */
export async function portalUrl(user) {
  if (!user.stripe_customer_id) throw httpError(400, 'You have no billing account yet. Choose a plan first.');
  return withStripe(async () => (await stripe().billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: `${config.appUrl}/app/billing` })).url);
}

/** Stop billing immediately (used when an account is deleted). */
export async function cancelSubscriptionNow(user) {
  if (!stripeEnabled() || !user.stripe_subscription_id || !ACTIVE.has(user.subscription_status)) return;
  await stripe().subscriptions.cancel(user.stripe_subscription_id);
}

export async function handleWebhook(rawBody, signature) {
  if (!config.stripe.webhookSecret) throw httpError(500, 'STRIPE_WEBHOOK_SECRET is not set.');
  let event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  } catch (err) {
    throw httpError(400, `Webhook signature verification failed: ${err.message}`);
  }
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        syncSubscription(await stripe().subscriptions.retrieve(idOf(session.subscription)));
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      syncSubscription(event.data.object);
      break;
    default:
      break;
  }
  return event.type;
}
