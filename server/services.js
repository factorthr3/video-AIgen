// Domain rules shared by the HTTP routes.
import { db } from './db.js';
import { PLAN } from './catalog.js';
import { billingState } from './billing/index.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- quota ----------
const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};

export function usage(user) {
  const plan = PLAN[user.plan] || PLAN.free;
  const adsets = db.get("SELECT COUNT(*) AS n FROM adsets WHERE user_id = ? AND created_at >= ? AND status != 'failed'", user.id, monthStart()).n;
  const brands = db.get('SELECT COUNT(*) AS n FROM brands WHERE user_id = ?', user.id).n;
  const billing = billingState(user);
  // With payments on, creating needs an active subscription (or admin access).
  const needsPlan = !billing.active;
  return {
    plan: plan.id,
    adsetsUsed: adsets,
    adsetsLimit: needsPlan ? 0 : plan.adsets,
    brandsUsed: brands,
    brandsLimit: needsPlan ? 0 : plan.brands,
    needsPlan,
    billing,
  };
}

export const NEEDS_PLAN_MESSAGE = 'Choose a plan on Plan & billing to start making ads.';
