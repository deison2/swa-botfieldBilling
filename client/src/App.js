// App.js
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';

// Page components
import RecurringRetainers   from './pages/RecurringRetainers';
import TechFees             from './pages/TechFees';
import BillingGroups        from './pages/BillingGroups';
import ExistingDrafts       from './pages/ExistingDrafts';
import MiscReports          from './pages/MiscReports';

// WIP-Based-Billing nested pages
import GeneralInformation   from './pages/WIPBasedBilling/GeneralInformation';
import NarrativeStandards   from './pages/WIPBasedBilling/NarrativeStandards';
import OfficeStandards      from './pages/WIPBasedBilling/OfficeStandards';
import PartnerStandards     from './pages/WIPBasedBilling/PartnerStandards';
import ClientStandards      from './pages/WIPBasedBilling/ClientStandards';

/* ───────── layout for nested WIP pages ───────── */
function WIPBasedBillingLayout() {
  return <Outlet />;
}

/* ───────── decide where “/” should go ───────── */
function DefaultRoute() {
  const { ready, isSuperUser } = useAuth();

  /* wait for /.auth/me to finish – render nothing for a tick */
  if (!ready) return null;

  const to = isSuperUser ? '/WIP-Based-Billing' : '/Existing-Drafts';
  console.log('[DefaultRoute] redirecting to', to, { ready, isSuperUser });

  return <Navigate to={to} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* smart landing page */}
          <Route path="/" element={<DefaultRoute />} />

          {/* WIP-Based-Billing parent with nested routes */}
          <Route path="WIP-Based-Billing" element={<WIPBasedBillingLayout />}>
            <Route index                element={<GeneralInformation />} />
            <Route path="General-Information" element={<GeneralInformation />} />
            <Route path="Narrative-Standards" element={<NarrativeStandards />} />
            <Route path="Office-Standards"    element={<OfficeStandards />} />
            <Route path="Partner-Standards"   element={<PartnerStandards />} />
            <Route path="Client-Standards"    element={<ClientStandards />} />
          </Route>

          {/* Other top-level routes */}
          <Route path="Recurring-Retainers" element={<RecurringRetainers />} />
          <Route path="Tech-Fees"           element={<TechFees />} />
          <Route path="Billing-Groups"      element={<BillingGroups />} />
          <Route path="Existing-Drafts"     element={<ExistingDrafts />} />
          <Route path="Misc-Reports"        element={<MiscReports />} />

          {/* 404 fallback */}
          <Route path="*" element={<div>Page not found</div>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}