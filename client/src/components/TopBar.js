import React, { useState } from 'react';
import './TopBar.css';
import UserAvatar from './UserAvatar';
import { useAuth } from '../auth/AuthContext';
import { useLocation } from 'react-router-dom';


export default function TopBar() {
  const { ready } = useAuth();
  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);
  const [page, setPage] = useState(0);

  // Help content mapping
  const helpContent = {
    '/Existing-Drafts': 
    
    `FAQs for Automated Billing
This short guide covers frequently asked questions regarding the automated billing process.

<i>Last Updated - 10/23/2025</i>
    

    Who Gets Automated Drafts?
  - Any Client Manager tied to a respective billing cycle
- The client is NOT excluded by the Client Partner (Exclusion requests made to Don/Todd/Scott G)
- The client has NOT received a bill within the last 30 days
- The client does NOT have any active ETF or GovCon jobs (clients with no WIP on ETF jobs are included)
- The client has at least $500 in outstanding WIP OR a job in finalization status


Client-Specific Questions
- <b>What if a client(s) should be billed to a different client?</b>
    - Changes to a client's billing group can be requested through the Billing Team. 
    (Bulk edit requests can be sent to Data Analytics)

- <b>What if my client (or groups of clients) should be billed at a specific realization rate?</b>
    - Changes to a client's realization rate can be requested through the Billing Team. 
    (Bulk edit requests can be sent to Data Analytics)

- <b>What if I want different services billed at different rates for the same client?</b>
    - Changes to a client's service realization rate can be requested through the Billing Team. 
    (Bulk edit requests can be sent to Data Analytics)



How is the Bill Amount Calculated?
  <b>Progress bills - </b>
  The realization rate is calculated by checking each of the following set rates, <b>with the left-most 
  rate taking priority - </b>
    
  Client Service Rate > Client Rate > CP Rate > CM Rate > Greater of Office Rate & client TTM average

<b>Final bills - </b> 
  The realization rate on final bills are calculated by taking the greater of -
    Normal progress bill calculation (see above)
    110% of PY billed
    Office standard for the whole job
      <i>e.g. For a BHM client, if we have billed $5,000 of the total $10,000 WIP for a job,
      and there is $1,000 WIP outstanding -> bill amount is $3,500 to meet office standard (85%)</i>
    
<b>Important notes - </b> 
  - <b>If there is a client or client-service rate set, we will ALWAYS bill at that rate,</b>
    regardless of if it is a progress bill or final bill
  - We will NOT bill above the Knuula quoted fee unless there is OOS WIP


Narratives (Billing Team)
Narrative standards at the job and service level are set and managed by <b>the Billing Team.</b>

If you have any requests regarding adding or modifying existing narratives
, please reach out to the Billing Team directly.

Below are a couple of exceptional cases you may encounter as you review narratives: 
  <b>- Detailed Invoices – </b>“PROFESSIONAL SERVICES RENDERED AS FOLLOWS –”
         - When a client is listed as 'Detailed Fee' in PE
         , <b>then they will only receive the detailed invoice narrative.</b>
             - This can be found/managed by going to PE > Client Details > WIP/Billing > Bill Layout

  <b>- Out of Scope – </b>“OUT OF SCOPE –”
         - For any out of scope WIP, <b>then only the out of scope narrative will populate for that WIP</b>
  
  
Please reach out to the Billing Team or Data Analytics Team if your question is not answered here!`
  };

  const helpText = helpContent[location.pathname] || 'No specific help content available for this page.';
  const helpPagesRaw = helpText.trim().split(/\n\s*\n\s*\n/) // split on triple newlines

// For each page, split first line as title, rest as body
const helpPages = helpPagesRaw.map(pageText => {
  const [titleLine, ...bodyLines] = pageText.trim().split('\n');
  return {
    title: titleLine.trim(),
    body: bodyLines.join('\n').trim()
  };
});
  const totalPages = helpPages.length;

  const nextPage = () => setPage((p) => Math.min(p + 1, totalPages - 1));
  const prevPage = () => setPage((p) => Math.max(p - 1, 0));

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="app-name"></span>
      </div>

      <div className="topbar-right">
        <button className="icon-button" title="Notifications">
          <i className="fas fa-bell"></i>
        </button>

        <button
  className={`icon-button ${location.pathname === '/Existing-Drafts' ? 'pulse' : ''}`}
  title="Help"
  onClick={() => {
    setShowHelp(true);
    setPage(0);
  }}
>
  <i className="fas fa-question-circle"></i>
</button>


        <div className="user-profile" title="User Profile">
          {ready ? <UserAvatar size={40} /> : null}
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="help-modal">
          <div className="help-content">
            <div className="help-title"> <h2>{helpPages[page].title || `Help — Page ${page + 1}`}</h2> </div>
            <pre className="help-text">{<div
  className="help-body"
  dangerouslySetInnerHTML={{ __html: helpPages[page].body.replace(/\n/g, '<br/>') }}
/>}</pre>


            <div className="help-controls">
              <button onClick={prevPage} disabled={page === 0}>← Previous</button>
              {page < totalPages - 1 ? (
                <button onClick={nextPage}>Next →</button>
              ) : (
                <button onClick={() => setShowHelp(false)}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
