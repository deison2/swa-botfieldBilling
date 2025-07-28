import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import './GeneralInformation.css';

export default function GeneralInformation() {
  return (
    <div className="app-container">
      <Sidebar />
      <TopBar />
      <main className="main-content">
        <section className="app-overview">
          <h2>Application Overview</h2>
          <ul>
            <li>
              <strong>Existing Drafts:</strong> View and manage draft bills currently in progress. This process updates the draft bill directly in PE. 
            <ul>
              <li>When clicking the 'drill-down' button for a job, you employ PE's draft locking mechanism. </li>
              <li>This means you cannot access drafts someone in PE is using and no one in PE can access a draft you're currently editing.</li>
              <li>Once you close the 'drill down' menu, the draft will be unlocked.</li>
            </ul>
            </li>
            <li>
              <strong>Recurring Retainers:</strong> View and manage ongoing retainer and recurring bills/clients. <em>(Under Construction)</em>
            <ul>
              <li>Configure which clients/jobs are considered recurring or retainers. </li>
              <li>Configure the frequency they are billed at. </li>
              <li>Configure the amount they are billed at. </li>
              <li>Configure whether they receive a progress or interim bill. </li>
            </ul>
            </li>
            <li>
              <strong>Tech Fees:</strong> Track technology fee allocations. <em>(Under Construction)</em>
            </li>
            <li>
              <strong>Billing Groups:</strong> Organize and manage client billing into billing groups to determine who should receive a given client's bill. <em>(Under Construction)</em>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
