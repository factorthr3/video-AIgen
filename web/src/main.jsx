import { StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import './index.css';
import { SessionProvider, CatalogProvider, useSession } from './lib.jsx';
import Landing from './pages/Landing.jsx';
import { Privacy, Terms } from './pages/Legal.jsx';
import { Login, Signup } from './pages/Auth.jsx';
import AppLayout from './components/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Brands from './pages/Brands.jsx';
import BrandDetail from './pages/BrandDetail.jsx';
import AdSets from './pages/AdSets.jsx';
import AdSetNew from './pages/AdSetNew.jsx';
import AdSetDetail from './pages/AdSetDetail.jsx';
import Share from './pages/Share.jsx';
import Billing from './pages/Billing.jsx';
import Settings from './pages/Settings.jsx';

function RequireAuth({ children }) {
  const { loading, user } = useSession();
  if (loading) return <div className="grid min-h-screen place-items-center text-ink-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Bounce people who arrive already signed in. Someone who signs in on this
// page is navigated by the form itself (to the wizard, after sign-up).
function GuestOnly({ children }) {
  const { loading, user } = useSession();
  const signedInOnArrival = useRef(null);
  if (loading) return null;
  if (signedInOnArrival.current === null) signedInOnArrival.current = Boolean(user);
  if (signedInOnArrival.current) return <Navigate to="/app" replace />;
  return children;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <CatalogProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
            <Route path="/share/:token" element={<Share />} />
            <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="brands" element={<Brands />} />
              <Route path="brands/:id" element={<BrandDetail />} />
              <Route path="adsets" element={<AdSets />} />
              <Route path="adsets/new" element={<AdSetNew />} />
              <Route path="adsets/:id" element={<AdSetDetail />} />
              <Route path="billing" element={<Billing />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CatalogProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
