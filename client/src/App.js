import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from './auth/AuthContext';
import UnderConstructionPage from './components/UnderConstructionPage';

// Import page components
//import RecurringRetainers from "./pages/RecurringRetainers";
//import TechFees from "./pages/TechFees";
import ExistingDrafts from "./pages/ExistingDrafts";
import MiscReports from "./pages/MiscReports";
import AutomatedBillingRecap from "./pages/AutomatedBillingRecap";

// WIP-Based-Billing nested pages
import GeneralInformation   from './pages/GeneralInformation';
import NarrativeStandards   from './pages/WIPBasedBilling/NarrativeStandards';
import BillingGroups from "./pages/BillingGroups";
import OfficeStandards from "./pages/WIPBasedBilling/OfficeStandards";
import PartnerStandards from "./pages/WIPBasedBilling/PartnerStandards";
import ClientStandards from "./pages/WIPBasedBilling/ClientStandards";
import RecurringClients from "./pages/RecurringRetainers";
//import OfficeStandards      from './pages/WIPBasedBilling/OfficeStandards';
//import PartnerStandards     from './pages/WIPBasedBilling/PartnerStandards';
//import ClientStandards      from './pages/WIPBasedBilling/ClientStandards';

/* ───────── layout for nested WIP pages ───────── */
function WIPBasedBillingLayout() {
  return <Outlet />;
}

export default function App() {

  /* ───────── default route ───────── */
  function DefaultRoute() {
    const { ready } = useAuth();
    if (!ready) return null;
    return <Navigate to="/General-Information" replace />;
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* Default route (redirect to General Information) */}
          <Route path="/" element={<DefaultRoute />} />

          {/* Top-level route for General Information */}
          <Route path="General-Information" element={<GeneralInformation />} />

          {/* WIP-Based-Billing parent with nested routes */}
          <Route path="WIP-Based-Billing" element={<WIPBasedBillingLayout />}>
            <Route path="Narrative-Standards" element={<NarrativeStandards />} />
            <Route path="Office-Standards" element={<OfficeStandards />} />
            <Route path="Partner-Standards" element={<PartnerStandards />} />
            <Route path="Client-Standards" element={<ClientStandards />} />
          </Route>

          {/* Other top-level routes */}
          <Route path="Existing-Drafts" element={<ExistingDrafts />} />
          <Route path="Automated-Billing-Recap" element={<AutomatedBillingRecap />} />
          <Route path="Recurring-Retainers" element={<RecurringClients />} />
          <Route path="Tech-Fees" element={<UnderConstructionPage />} />
          <Route path="Billing-Groups" element={<BillingGroups />} />
          <Route path="Misc-Reports" element={<MiscReports />} />

          {/* 404 fallback */}
          <Route path="*" element={<div>Page not found</div>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
