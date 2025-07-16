import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";

// Import page components
import RecurringRetainers from "./pages/RecurringRetainers";
import TechFees from "./pages/TechFees";
import BillingGroups from "./pages/BillingGroups";
import ExistingDrafts from "./pages/ExistingDrafts";
import MiscReports from "./pages/MiscReports";

// WIP-Based-Billing nested pages
import GeneralInformation from "./pages/WIPBasedBilling/GeneralInformation";
import NarrativeStandards from "./pages/WIPBasedBilling/NarrativeStandards";
import OfficeStandards from "./pages/WIPBasedBilling/OfficeStandards";
import PartnerStandards from "./pages/WIPBasedBilling/PartnerStandards";
import ClientStandards from "./pages/WIPBasedBilling/ClientStandards";

// Layout for WIP-Based-Billing parent route (to render nested routes)
function WIPBasedBillingLayout() {
  return (
    <div>
      {/* 
      <h1>WIP Based Billing</h1>
      Commenting out for now. Acts as a header for pages falling under WIP-Based-Billing.
      */}
      <Outlet />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirect root to WIP-Based-Billing or any landing page */}
        <Route path="/" element={<Navigate to="/WIP-Based-Billing" />} />

        {/* WIP-Based-Billing parent with nested routes */}
        <Route path="WIP-Based-Billing" element={<WIPBasedBillingLayout />}>
          <Route index element={<GeneralInformation />} /> {/* default nested page */}
          <Route path="General-Information" element={<GeneralInformation />} />
          <Route path="Narrative-Standards" element={<NarrativeStandards />} />
          <Route path="Office-Standards" element={<OfficeStandards />} />
          <Route path="Partner-Standards" element={<PartnerStandards />} />
          <Route path="Client-Standards" element={<ClientStandards />} />
        </Route>

        {/* Other top-level routes */}
        <Route path="Recurring-Retainers" element={<RecurringRetainers />} />
        <Route path="Tech-Fees" element={<TechFees />} />
        <Route path="Billing-Groups" element={<BillingGroups />} />
        <Route path="Existing-Drafts" element={<ExistingDrafts />} />
        <Route path="Misc-Reports" element={<MiscReports />} />

        {/* Fallback for unmatched routes */}
        <Route path="*" element={<div>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
