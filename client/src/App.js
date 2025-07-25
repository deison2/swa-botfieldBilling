import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import UnderConstructionPage from './components/UnderConstructionPage';

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
          <Route index element={<NarrativeStandards />} /> {/* default nested page */}





          {/* --- PROD--- ROUTES    */}
          {/* 
          <Route path="General-Information" element={<GeneralInformation />} />
          */}
          <Route path="Narrative-Standards" element={<NarrativeStandards />} />
          {/* 
          <Route path="Office-Standards" element={<OfficeStandards />} />
          <Route path="Partner-Standards" element={<PartnerStandards />} />
          <Route path="Client-Standards" element={<ClientStandards />} />
          */}



          {/* --- DEV --- (UNDER CONSTRUCTION) ROUTES    */}
          <Route path="General-Information" element={<UnderConstructionPage />} />
          {/* 
          <Route path="Narrative-Standards" element={<UnderConstructionPage />} />
          */}
          <Route path="Office-Standards" element={<UnderConstructionPage />} />
          <Route path="Partner-Standards" element={<UnderConstructionPage />} />
          <Route path="Client-Standards" element={<UnderConstructionPage />} />
        </Route>






        {/* --- Other top-level routes --- PROD --- */}
          {/* 
        <Route path="Recurring-Retainers" element={<RecurringRetainers />} />
        <Route path="Tech-Fees" element={<TechFees />} />
        <Route path="Billing-Groups" element={<BillingGroups />} />
          */}
        <Route path="Existing-Drafts" element={<ExistingDrafts />} />
          {/* 
        <Route path="Misc-Reports" element={<MiscReports />} />
          */}
        


        {/* --- Other top-level routes --- DEV --- */}
        <Route path="Recurring-Retainers" element={<UnderConstructionPage />} />
        <Route path="Tech-Fees" element={<UnderConstructionPage />} />
        <Route path="Billing-Groups" element={<UnderConstructionPage />} />
          {/* 
        <Route path="Existing-Drafts" element={<UnderConstructionPage />} />
          */}
        <Route path="Misc-Reports" element={<UnderConstructionPage />} />


        {/* Fallback for unmatched routes */}
        <Route path="*" element={<div>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
