// Billing, independent of the payment processor. Paystack or Stripe sells the
// plans (BILLING_PROVIDER picks when both are configured); the access rules,
// admin comps and prices shown in the app live here.
import { config } from '../config.js';
import { PLANS } from '../catalog.js';
import * as paystack from './paystack.js';
import * as stripe from './stripe.js';

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

/** "paystack", "stripe", or null when payments aren't set up. */
export function provider() {
  const wanted = config.billingProvider;
  if (wanted === 'paystack' || wanted === 'stripe') return (wanted === 'paystack' ? paystack : stripe).enabled() ? wanted : null;
  if (paystack.enabled()) return 'paystack';
  if (stripe.enabled()) return 'stripe';
  return null;
}
const impl = () => (provider() === 'paystack' ? paystack : stripe);

/** Test keys: nothing is really charged, so admins go through checkout too. */
export function testMode() {
  const key = provider() === 'paystack' ? config.paystack.secretKey : provider() === 'stripe' ? config.stripe.secretKey : '';
  return key.startsWith('sk_test_');
}

export const isAdmin = (user) => config.adminEmails.includes(String(user.email).toLowerCase());

// ---------- access ----------
// 'manual' = a plan an admin assigned (POA plans, billed outside the app).
const ACTIVE = new Set(['active', 'trialing', 'past_due', 'manual']);
const PAST_DUE_GRACE_MS = 7 * 86400_000;

export function billingState(user) {
  const which = provider();
  if (!which) return { enabled: false, active: true };
  const state = {
    enabled: true,
    provider: which,
    status: user.subscription_status || 'none',
    currentPeriodEnd: user.current_period_end || null,
    cancelAtPeriodEnd: Boolean(user.cancel_at_period_end),
    hasCustomer: Boolean(which === 'paystack' ? user.paystack_subscription_code : user.stripe_customer_id),
  };
  if (isAdmin(user)) return { ...state, active: true, comped: true };
  // Cancelled plans run to the end of the paid period; a failed renewal gets a week's grace.
  const end = user.current_period_end ? new Date(user.current_period_end).getTime() : null;
  let active = ACTIVE.has(user.subscription_status);
  if (active && end && state.cancelAtPeriodEnd && end < Date.now()) active = false;
  if (active && end && user.subscription_status === 'past_due' && end + PAST_DUE_GRACE_MS < Date.now()) active = false;
  return { ...state, active };
}

/** What the web app needs to know about payments. */
export function billingInfo() {
  const which = provider();
  return {
    enabled: Boolean(which),
    provider: which,
    testMode: testMode(),
    // Prices are shown in `currency`; Paystack outside Kenya/Nigeria charges the converted amount in `chargeCurrency`.
    currency: which === 'paystack' ? 'usd' : config.stripe.currency,
    chargeCurrency: which === 'paystack' ? paystack.currency()?.toLowerCase() || null : config.stripe.currency,
  };
}

/** Plans with their prices (and, when it differs, what is actually charged). */
export const displayPlans = () => (provider() === 'paystack' ? paystack.displayPlans() : PLANS);

// ---------- actions ----------
export const choosePlan = (user, planId) => impl().choosePlan(user, planId);
export const portalUrl = (user) => impl().portalUrl(user);

/** Stop renewing (Paystack; Stripe customers cancel in the Billing Portal). */
export async function cancelPlan(user) {
  if (provider() !== 'paystack') throw httpError(400, 'Cancel from Manage billing.');
  await paystack.cancelPlan(user);
}

/** Stop all billing now (the account is being deleted). */
export async function cancelSubscriptionNow(user) {
  await Promise.all([paystack.cancelSubscriptionNow(user), stripe.cancelSubscriptionNow(user)]);
}

export const warmUp = () => paystack.warmUp();
export { handleWebhook as handleStripeWebhook } from './stripe.js';
export { handleWebhook as handlePaystackWebhook, confirmReturn as confirmPaystackReturn, enabled as paystackEnabled } from './paystack.js';
