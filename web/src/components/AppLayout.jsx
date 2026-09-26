import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router';
import { LayoutDashboard, Layers, Film, Link2, CreditCard, Settings, LogOut, Plus, Menu, X } from 'lucide-react';
import { Logo, ProgressBar } from './ui.jsx';
import { useSession, useCatalog, byId } from '../lib.jsx';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/series', label: 'Series', icon: Layers },
  { to: '/app/videos', label: 'Videos', icon: Film },
  { to: '/app/accounts', label: 'Accounts', icon: Link2 },
  { to: '/app/billing', label: 'Plan & billing', icon: CreditCard },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

function Sidebar({ onNavigate }) {
  const { user, usage, logout } = useSession();
  const catalog = useCatalog();
  const plan = byId(catalog?.plans)[usage?.plan];
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col gap-6 p-5">
      <Logo to="/app" />
      <Link to="/app/series/new" onClick={onNavigate} className="btn-primary w-full"><Plus className="size-4" /> New series</Link>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white' : 'text-ink-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Icon className="size-4.5" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-4">
        {usage && (
          <Link to="/app/billing" onClick={onNavigate} className="card block p-4 transition hover:border-white/15">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">{plan?.name || 'Tester'} plan</span>
              <span className="text-ink-400">{usage.videosUsed}/{usage.videosLimit} videos</span>
            </div>
            <ProgressBar value={usage.videosUsed / usage.videosLimit} className="mt-3" />
            <p className="mt-2 text-xs text-ink-400">Resets on the 1st of each month</p>
          </Link>
        )}
        <div className="flex items-center gap-3">
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt="" className="size-9 rounded-full" />
            : <span className="grid size-9 place-items-center rounded-full bg-brand-600 text-sm font-bold">{(user?.name || user?.email || '?')[0].toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="truncate text-xs text-ink-400">{user?.email}</p>
          </div>
          <button className="btn-ghost p-2" title="Sign out" onClick={async () => { await logout(); navigate('/'); }}><LogOut className="size-4" /></button>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-white/5 bg-ink-900/60 lg:block">
        <Sidebar />
      </aside>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-ink-950/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo to="/app" />
        <button className="btn-ghost p-2" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-white/10 bg-ink-900">
            <button className="btn-ghost absolute right-3 top-4 p-2" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
