import { getAuthToken, setAuthToken } from './runtimeConfig';

export async function getToken() {
  return getAuthToken();
}

export async function getKnuulaFees() {
  console.log('calling getKnuulaFees');
  const res = await fetch('/api/getKnuulaData/feeData', {
    method: "GET"
  });
  if (!res.ok) { // capture error payload
    throw new Error(`Load failed: ${res.status}`);
  }
  const responseBody = await res.json();
  return responseBody;
}

export async function getKnuulaContracts() {
  console.log('calling getKnuulaContracts');
  const res = await fetch('/api/getKnuulaData/contractData', {
    method: "GET"
  });
  if (!res.ok) { // capture error payload
    throw new Error(`Load failed: ${res.status}`);
  }
  const responseBody = await res.json();
  return responseBody;
}

export async function CombineDrafts(parent, children) {
  console.log('Draft Index - ', parent, children);
  const token = await getToken();
  setAuthToken(token);
  const res = await fetch('/api/combineDrafts', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parentDraftIndex: parent,
      childDraftIndexes: children,
      token
    })
  });
  if (!res.ok) throw new Error("Create failed");
  const bulkListId = await res.text(); // <-- need await
  return bulkListId;
}

export async function AbandonDraft(DebtTranIndex, { userEmail, debtTranDate, draftFeeIdx, reason } = {}) {
  console.log('Draft Index - ', DebtTranIndex);
  const token = await getToken();
  setAuthToken(token);
  const res = await fetch('/api/AbandonDraft', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      DebtTranIndex: DebtTranIndex,
      token,
      userEmail,
      debtTranDate,
      draftFeeIdx,
      reason,
    })
  });
  if (!res.ok) throw new Error("Create failed");
  const bulkListId = await res.text(); // <-- need await
  return bulkListId;
}

export async function CreateBulkPrintList(draftIndexes) {
  console.log('Draft Indexes - ', draftIndexes);
  const token = await getToken();
  setAuthToken(token);
  const res = await fetch('/api/CreateBulkPrintList', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      indexArray: draftIndexes,
      token
    })
  });
  if (!res.ok) throw new Error("Create failed");
  const bulkListId = await res.text(); // <-- need await
  return bulkListId;
}

export async function DownloadBulkList(listId) {
  const token = await getAuthToken();
  const res = await fetch(`api/ProcessBulkList/${listId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token
    })
  });
  if (!res.ok) throw new Error("Create failed");
  const response = await res.blob();
  return response;
}

/* ------------ SAFE JSON HELPER ------------ */

async function safeJson(res) {
  const text = await res.text();
  if (!text) {
    // empty / 204 / etc.
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn('Non-JSON response from', res.url, '=>', text);
    // fall back to raw text so callers still get something
    return text;
  }
}

/* ------------ GENERIC FETCH WRAPPER ------------ */

async function fetchWithErrors(url, init = {}) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const payload = await res.text();
      if (res.status === 504) {
        throw new Error(`Gateway timeout (504) when loading ${url}`);
      }
      throw new Error(`Load failed: ${res.status} ${payload}`);
    }
    return safeJson(res);
  } catch (err) {
    console.error('Error fetching - ', err);
    throw err;
  }
}

// Read current bill-through date (or server will return default)
export async function GetBillThroughBlob() {
  return fetchWithErrors('/api/billingDate'); // GET
}

// Update bill-through date (super users only)
export async function SetBillThroughBlob({ billThroughDate, updatedBy }) {
  const token = await getAuthToken(); // reuse existing mechanism
  const res = await fetch('/api/billingDate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billThroughDate, updatedBy, token }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`SetBillThroughBlob failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

export async function GetDrafts(billThroughDate) {
  const res = await fetch('/api/getDraftPopulation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billThroughDate }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`GetDrafts failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

export async function GetGranularJobData(billThroughDate) {
  const res = await fetch('/api/getGranularJobData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billThroughDate }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`GetGranularJobData failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

export async function GetGranularWIPData() {
  console.log('calling GetGranularWIPData');
  const res = await fetch('/api/GetGranularWIPData', {
    method: "POST"
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`GetGranularWIPData failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

export async function GetInvoiceLineItems({ clientCode, startDate, endDate, dateRange } = {}) {
  if (!clientCode) throw new Error("GetInvoiceLineItems: clientCode is required");

  // helpers
  const pad = n => String(n).padStart(2, '0');
  const toIso = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };
  const jan1 = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();

  const startIso = toIso(startDate || jan1);
  const endIso   = toIso(endDate   || today);

  const payload = {
    clientCode: String(clientCode),
    dateRange : dateRange ?? `'${startIso}' and '${endIso}'`,
  };

  const res = await fetch('/api/invoiceLineItems', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`GetInvoiceLineItems failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// in services/ExistingDraftsService.js

export async function CreateInvoiceBulkPrintList(debtTranIndexes) {
  // Same token dance as the draft flow
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch('/api/CreateInvoiceBulkPrintList', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      indexArray: debtTranIndexes,  // array of integers (DebtTranIndex)
      token
    })
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`CreateInvoiceBulkPrintList failed: ${res.status} ${msg}`);
  }
  // server returns text listId (like the draft flow)
  return await res.text();
}

export async function lockUnlockDraft(DebtTranIndex, User) {
  const token = await getToken();
  setAuthToken(token); // assuming this puts the token on fetch headers globally

  // Build path segments safely (no trailing/double slashes)
  const segments = ['/api', 'lockUnlockDraft', String(DebtTranIndex)];
  if (User && User.trim()) {
    segments.push(encodeURIComponent(User.trim()));
  }
  const url = segments.join('/');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // If your backend expects the token in headers only, remove it from body
    body: JSON.stringify({ token })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`lockUnlockDraft failed: ${res.status} ${res.statusText} ${text}`);
  }
  // Handle empty 204 or JSON
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Convenience helpers so the page code can be explicit:

export async function lockDraft(draftFeeIdx, userEmail) {
  if (!userEmail || !String(userEmail).trim()) {
    throw new Error('lockDraft: user email is required when locking a draft.');
  }
  // route = /api/lockUnlockDraft/{idx}/{user}
  return lockUnlockDraft(draftFeeIdx, userEmail);
}

export async function unlockDraft(draftFeeIdx) {
  // route = /api/lockUnlockDraft/{idx}  (no user segment → UNLOCK)
  return lockUnlockDraft(draftFeeIdx);
}


export async function checkDraftInUse(DebtTranIndex) {
  const url = ['/api', 'checkDraftInUse', String(DebtTranIndex)].join('/');
  const res = await fetch(url, { method: 'GET' });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`checkDraftInUse failed: ${res.status} ${res.statusText} ${text}`);
  }

  const raw = (await res.text()).trim();

  // Empty → not in use
  if (!raw) {
    return { inUse: false, user: null };
  }

  // Fallback support if backend ever returns boolean-ish values
  if (raw === 'true' || raw === '1') {
    return { inUse: true, user: null };
  }
  if (raw === 'false' || raw === '0') {
    return { inUse: false, user: null };
  }

  // If backend just returns the email as plain text (our current pattern)
  // then `raw` IS the user email.
  return {
    inUse: true,
    user: raw
  };
}


// === Draft editing (PE APIs) SURGICAL EDITS ===

// recalculateWIPAllocFromSummary
export async function populateWIPAnalysisDrillDown(draftIdx, drillType, allocIndex) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/PUT/WIP/${draftIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      payload: { "DraftFeeIndex": draftIdx
               , "DrillType": drillType
               , "AllocIdx": allocIndex
              }
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Draft Get WIP List failed: ${res.status} ${msg}`);
  }

  // May be empty / non-JSON, so use safeJson
  return safeJson(res);
}

export async function recalculateWIPAllocFromSummary(payload) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/DELETE/WIP/${payload.DebtTranIndex}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      payload: { ...payload
              }
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Draft Get WIP List failed: ${res.status} ${msg}`);
  }

  // May be empty / non-JSON, so use safeJson
  return safeJson(res);
}

// WIP ALLOCATION POPULATION
export async function draftFeeClientOrGroupWIPList(draftIdx, contindex) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/GET/WIP/${draftIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      payload: { "DraftFeeIndex": draftIdx
               , "Client": contindex 
              }
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Draft Get WIP List failed: ${res.status} ${msg}`);
  }

  // May be empty / non-JSON, so use safeJson
  return safeJson(res);
}
export async function getDraftFeeWIPSpecialList(draftIdx) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/POST/WIP/${draftIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Draft Get WIP List failed: ${res.status} ${msg}`);
  }

  // May be empty / non-JSON, so use safeJson
  return safeJson(res);
}
// ANALYSIS SECTION
export async function getDraftFeeAnalysis(draftFeeIdx) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/GET/Analysis/${draftFeeIdx}`, {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Get Draft Analysis Fail - ${draftFeeIdx} failed: ${res.status} ${msg}`);
  }
  return safeJson(res);
}

export async function draftFeeAddClients(draftIdx, contindexarray, wipindexes) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/POST/Analysis/${draftIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      payload: { "DraftFeeIdx": draftIdx
               , "Clients": contindexarray
               , "WIPIndexes": wipindexes 
              }
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Draft Add Analysis failed: ${res.status} ${msg}`);
  }

  // May be empty / non-JSON, so use safeJson
  return safeJson(res);
}

export async function saveDraftFeeAnalysisRow(draftIdx, payload) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/PUT/Analysis/${draftIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      payload
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Draft Edit/Update Analysis failed: ${res.status} ${msg}`);
  }

  // May be empty / non-JSON, so use safeJson
  return safeJson(res);
}

export async function draftFeeDeleteWipAllocation(draftFeeIdx, allocIndexes) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/DELETE/Analysis/${draftFeeIdx}`, {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, 
              payload: { 
                "DraftFeeIdx": draftFeeIdx,
                "AllocIndexes": allocIndexes 
              }

              })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Delete Draft Analysis Rows - ${draftFeeIdx} failed: ${res.status} ${msg}`);
  }
  return safeJson(res); // array of narrative rows (or null/text)
}

// NARRATIVES SECTION

export async function getDraftFeeNarratives(draftFeeIdx) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/GET/Narrative/${draftFeeIdx}`, {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Get Draft Narratives - ${draftFeeIdx} failed: ${res.status} ${msg}`);
  }
  return safeJson(res); // array of narrative rows (or null/text)
}

export async function addDraftFeeNarrative(draftFeeIdx) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/POST/Narrative/${draftFeeIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`addDraftFeeNarrative failed: ${res.status} ${msg}`);
  }

  // May be empty / non-JSON, so use safeJson
  return safeJson(res);
}

export async function updateDraftFeeNarrative(payload) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/PUT/Narrative/${payload.DraftFeeIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      payload
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`UpdateDraftFeeNarrative failed: ${res.status} ${msg}`);
  }

  // May be empty / non-JSON, so use safeJson
  return safeJson(res);
}

export async function deleteDraftFeeNarrative(draftFeeIdx, debtNarrIndex) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/DELETE/Narrative/${draftFeeIdx}/${debtNarrIndex}`, {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Delete Draft Narratives - ${draftFeeIdx} - ${debtNarrIndex} failed: ${res.status} ${msg}`);
  }
  return safeJson(res); // array of narrative rows (or null/text)
}

export async function underLyingEntries(entryLevel, draftFeeIdx, WIPIds) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/POST/DraftFeeWIPEditAnalysis/${draftFeeIdx}/`, {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, 
              payload: { 
                "entryLevel": entryLevel,
                "WIPIds": WIPIds 
              }
              })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`DraftFeeWIPEditAnalysis failed: ${res.status} ${msg}`);
  }
  return safeJson(res); // array of narrative rows (or null/text)
}

// (optional placeholder) – you’ll wire this to your own audit API later
export async function logDraftEdits(auditPayload) {
  try {
    const res = await fetch('/api/draftEditAudit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auditPayload),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      console.warn(
        `logDraftEdits failed: ${res.status} ${msg}`
      );
    }
  } catch (err) {
    console.error('logDraftEdits error:', err);
    // Intentionally do not throw – audit failure shouldn’t block billing
  }
}


// recalculateWIPAllocFromSummary
export async function DraftFeeAddInterimFeeAutoAllocate(payload) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch('/api/AutoAllocateWIP', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PE-Token': token },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Add and auto allocate failed: ${res.status} ${msg}`);
  }

  // May be empty / non-JSON, so use safeJson
  return safeJson(res);
}

export async function DraftFeeAddInterimFee(payload) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch('/api/AddInterimFee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PE-Token': token },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Add interim fee failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// CREATE DRAFT SECTION
export async function newDraftFeeJobs(payload) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch('/api/DraftEditing/GET/createDraft/GetCreateDraftPop', {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, payload })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Get New Draft Fee Jobs: ${res.status} ${msg}`);
  }
  return safeJson(res);
}
export async function createDraft(payload) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch('/api/DraftEditing/POST/createDraft/CreateDraft', {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, payload })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Create Draft failed: ${res.status} ${msg}`);
  }
  return safeJson(res);
}

// ── Reviewal Workflow ───────────────────────────────────────────
// Fetches workflow instance + action history for a draft
export async function getWorkflowReviewData(draftFeeIdx) {
  const res = await fetch(`/api/workflowInstances?draftFeeIdx=${draftFeeIdx}`, {
    method: 'GET',
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`getWorkflowReviewData failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Ensures a workflow instance exists for a draft, creating one if needed.
// Accepts optional PE row data to seed reviewer emails.
export async function ensureWorkflowInstance(draftFeeIdx, rowData) {
  const res = await fetch('/api/workflowEnsure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      draftFeeIdx,
      contIndex: rowData?.CONTINDEX || 0,
      clientCode: rowData?.CLIENTCODE || rowData?.CLIENTS?.[0]?.code || '',
      clientName: rowData?.CLIENTNAME || rowData?.CLIENTS?.[0]?.name || '',
      clientOffice: rowData?.CLIENTOFFICE || '',
      wipAmount: rowData?.WIP || 0,
      billedAmount: rowData?.BILLED || 0,
      writeOffUp: rowData?.WRITEOFFUP || rowData?.['Write Off(Up)'] || 0,
      draftHyperlink: rowData?.DRAFTHYPERLINK || null,
      managerEmail: rowData?.CMEmail || rowData?.ROLES?.[2] || null,
      partnerEmail: rowData?.CPEmail || rowData?.ROLES?.[1] || null,
      originatorEmail: rowData?.COEmail || rowData?.ROLES?.[0] || null,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`ensureWorkflowInstance failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Fetches unified activity feed (workflow actions + audit blob summaries) for a draft
export async function getDraftActivityFeed(draftFeeIdx) {
  const res = await fetch(`/api/draftActivity/${draftFeeIdx}`, {
    method: 'GET',
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`getDraftActivityFeed failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Posts a comment to the workflow actions table
export async function postWorkflowComment(instanceId, comment) {
  const res = await fetch(`/api/workflowAction/${instanceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_type: 'COMMENT', comments: comment }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`postWorkflowComment failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Logs that the user viewed the reviewal modal
export async function logWorkflowViewed(instanceId) {
  const res = await fetch(`/api/workflowAction/${instanceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_type: 'VIEWED', comments: null }),
  });

  // Non-blocking: don't throw on failure
  if (!res.ok) {
    console.warn('logWorkflowViewed failed:', res.status);
  }
}

// Marks the current stage as reviewed (advances to next stage)
export async function markDraftReviewed(instanceId, comments) {
  const res = await fetch(`/api/workflowAction/${instanceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_type: 'APPROVED', comments: comments || null }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`markDraftReviewed failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Sends a draft back to the previous reviewal stage
export async function sendBackDraft(instanceId, comments) {
  const res = await fetch(`/api/workflowAction/${instanceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_type: 'SEND_BACK', comments: comments || null }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`sendBackDraft failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// ── Draft Versions (SQL) ──────────────────────────────────────

// Fetches all saved versions for a draft in the active billing cycle
export async function getDraftVersions(draftFeeIdx) {
  const res = await fetch(`/api/draftVersions/${draftFeeIdx}`, {
    method: 'GET',
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`getDraftVersions failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Saves a new version snapshot of analysis + narrative data to SQL
export async function saveDraftVersion({ draftFeeIdx, versionNumber, analysisData, narrativeData, reason }) {
  const res = await fetch('/api/draftVersions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftFeeIdx, versionNumber, analysisData, narrativeData, reason }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`saveDraftVersion failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Fetch global reviewal tracker data — syncs PE drafts into workflow DB first
export async function getWorkflowTrackerData(drafts = []) {
  const res = await fetch('/api/workflowTracker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drafts }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`getWorkflowTrackerData failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Bulk advance selected drafts to a target stage
export async function bulkReviewalUpdate({ draftFeeIdxs, targetStageId, actionType = 'APPROVED', comments = '' }) {
  const res = await fetch('/api/workflowBulkAction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      draft_fee_idxs: draftFeeIdxs,
      target_stage_id: targetStageId,
      action_type: actionType,
      comments,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`bulkReviewalUpdate failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Fetch auto-approval relationships
export async function getAutoApprovals(type) {
  const url = type ? `/api/partnerAutoApprovals?type=${type}` : '/api/partnerAutoApprovals';
  const res = await fetch(url, { method: 'GET' });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`getAutoApprovals failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Create an auto-approval relationship
export async function createAutoApproval({ relationshipType, approverEmail, revieweeEmail }) {
  const res = await fetch('/api/partnerAutoApprovals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relationshipType, approverEmail, revieweeEmail }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`createAutoApproval failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Revoke an auto-approval relationship
export async function revokeAutoApproval(id) {
  const res = await fetch(`/api/partnerAutoApprovals/${id}`, { method: 'DELETE' });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`revokeAutoApproval failed: ${res.status} ${msg}`);
  }

  return safeJson(res);
}

// Fetch unread @mentions for the current user
export async function getUnreadMentions() {
  const res = await fetch('/api/mentions', { method: 'GET' });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`getUnreadMentions failed: ${res.status} ${msg}`);
  }
  return safeJson(res);
}

// Mark all mentions for a specific draft as read
export async function markMentionsRead(draftFeeIdx) {
  const res = await fetch('/api/mentions/markRead', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft_fee_idx: draftFeeIdx }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`markMentionsRead failed: ${res.status} ${msg}`);
  }
  return safeJson(res);
}