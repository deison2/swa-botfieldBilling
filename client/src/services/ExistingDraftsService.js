import { getAuthToken, setAuthToken } from './runtimeConfig';

export async function getToken() {
  console.log('calling getToken');
  const res = await fetch('/api/getToken', {
    method: "POST"
  });
  const token = await res.text();
  if (!res.ok) { // capture error payload
    throw new Error(`Load failed: ${res.status} ${token}`);
  }
  return token;
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

export async function saveDraftFeeAnalysisRow(payload) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/POST/Analysis/${payload.draftFeeIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      payload
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Draft Edit Analysis failed: ${res.status} ${msg}`);
  }

  // May be empty / non-JSON, so use safeJson
  return safeJson(res);
}

export async function updateDraftFeeNarrative(payload) {
  const token = await getToken();
  setAuthToken(token);

  const res = await fetch(`/api/DraftEditing/POST/Narrative/${payload.draftFeeIdx}`, {
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
