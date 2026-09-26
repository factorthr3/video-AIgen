import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Logo, Alert } from '../components/ui.jsx';
import PhoneDemo from '../components/PhoneDemo.jsx';
import { api, useCatalog, useSession } from '../lib.jsx';

function GoogleButton() {
  const catalog = useCatalog();
  if (!catalog?.providers?.googleSignIn) return null;
  return (
    <>
      <a href="/api/auth/google" className="btn-secondary w-full py-3">
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
        Continue with Google
      </a>
      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-ink-400">
        <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
      </div>
    </>
  );
}

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-ink-400">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-center text-sm text-ink-400">{footer}</p>
        </div>
      </div>
      <div className="relative hidden items-center justify-center overflow-hidden border-l border-white/5 bg-ink-900 lg:flex">
        <div className="absolute h-[500px] w-[500px] rounded-full bg-brand-600/30 blur-[120px]" />
        <PhoneDemo demo={0} className="relative" />
      </div>
    </div>
  );
}

function useAuthSubmit(path) {
  const navigate = useNavigate();
  const { setSession } = useSession();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (body) => {
    setBusy(true);
    setError(null);
    try {
      setSession(await api(path, { method: 'POST', body }));
      navigate(path === '/auth/signup' ? '/app/series/new' : '/app');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return { submit, error, busy };
}

export function Login() {
  const [params] = useSearchParams();
  const { submit, error, busy } = useAuthSubmit('/auth/login');
  const [form, setForm] = useState({ email: '', password: '' });
  const oauthError = params.get('error');
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your autopilot." footer={<>New to BlackCell? <Link to="/signup" className="font-semibold text-white hover:underline">Create an account</Link></>}>
      {(error || oauthError) && <Alert>{error || (oauthError === 'google_not_configured' ? 'Google sign-in is not configured on this server.' : oauthError)}</Alert>}
      <GoogleButton />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(form); }}>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight className="size-4" /></button>
      </form>
    </AuthShell>
  );
}

export function Signup() {
  const { submit, error, busy } = useAuthSubmit('/auth/signup');
  const catalog = useCatalog();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  return (
    <AuthShell title="Create your account" subtitle="Your first video can be ready in minutes." footer={<>Already have an account? <Link to="/login" className="font-semibold text-white hover:underline">Sign in</Link></>}>
      {catalog?.providers?.signupMode === 'invite' && !error && <Alert tone="info">BlackCell is in private beta. Sign up with the email address your invite was sent to.</Alert>}
      {error && <Alert>{error}</Alert>}
      <GoogleButton />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(form); }}>
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Creating account…' : 'Create account'} <ArrowRight className="size-4" /></button>
        <p className="text-center text-xs text-ink-400">By creating an account you agree to our <Link to="/terms" className="underline hover:text-white">Terms</Link> and <Link to="/privacy" className="underline hover:text-white">Privacy Policy</Link>, and confirm you are 18 or older.</p>
      </form>
    </AuthShell>
  );
}
