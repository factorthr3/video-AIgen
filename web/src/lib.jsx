import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------- API ----------
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- Session ----------
const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, usage: null });
  const refresh = useCallback(async () => {
    const data = await api('/auth/me').catch(() => ({ user: null }));
    setState({ loading: false, user: data.user, usage: data.usage || null });
    return data;
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const setSession = useCallback((data) => setState({ loading: false, user: data.user, usage: data.usage || null }), []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setState({ loading: false, user: null, usage: null });
  }, []);
  return <SessionContext.Provider value={{ ...state, refresh, setSession, logout }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

// ---------- Catalog (niches, voices, styles, plans…) ----------
const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    api('/catalog').then(setCatalog).catch(() => setCatalog(null));
  }, []);
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

export const useCatalog = () => useContext(CatalogContext);
export const byId = (list = []) => Object.fromEntries(list.map((x) => [x.id, x]));

// ---------- Data hooks ----------
/**
 * Fetch JSON and keep polling every 2s while `poll(data)` is true. Calling
 * `reload()` also resumes polling (e.g. after starting a render or a post).
 */
export function useApi(path, { poll } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(poll);
  pollRef.current = poll;
  const timer = useRef(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await api(path);
      if (!alive.current) return d;
      setData(d);
      setError(null);
      // One timer chain at a time, however many loads overlap.
      clearTimeout(timer.current);
      if (pollRef.current?.(d)) timer.current = setTimeout(load, 2000);
      return d;
    } catch (err) {
      if (alive.current) setError(err);
      return null;
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, [load]);

  return { data, error, reload: load, setData };
}

// ---------- formatting ----------
/** "$19", "£5.99", "₦29,000": whole amounts drop the pence. */
export function formatPrice(amount, currency = 'usd') {
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency: currency.toUpperCase(), currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}

/** Price formatter bound to the server's billing currency. */
export function usePrice() {
  const catalog = useCatalog();
  const currency = catalog?.providers?.billing?.currency || 'usd';
  const cheapest = Math.min(...(catalog?.plans || [{ price: 5.99 }]).map((p) => p.price));
  return { format: (amount) => formatPrice(amount, currency), from: formatPrice(cheapest, currency) };
}

export function relativeTime(iso) {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  return rtf.format(Math.round(diff / 86_400_000), 'day');
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export const formatDuration = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '-');

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function describeDays(days = []) {
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Weekdays';
  if (!days.length) return 'Paused';
  return days.map((d) => DAYS[d]).join(', ');
}
