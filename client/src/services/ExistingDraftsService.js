import { getAuthToken, setAuthToken } from './runtimeConfig';

export async function getToken() {
    console.log('calling getToken');
    const res = await fetch('/api/getToken', {
    method: "POST"
    })
    ;
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
        "indexArray": draftIndexes,
        "token": token
        })
  });
  if (!res.ok) throw new Error("Create failed");
  const bulkListId = res.text();
  return bulkListId;
}

export async function DownloadBulkList(listId) {
  const token = await getAuthToken();
  const res = await fetch(`api/ProcessBulkList/${listId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        "token": token
        })
  });
  if (!res.ok) throw new Error("Create failed");
  const response = await res.blob();
  return response;
}

async function fetchWithErrors(url, init = {}) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const payload = await res.text();
      if (res.status === 504) throw new Error(`Gateway timeout (504) when loading ${url}`);
      throw new Error(`Load failed: ${res.status} ${payload}`);
    }
    return res.json();
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
  return res.json();
}


export async function GetDrafts(billThroughDate) {
  const res = await fetch('/api/getDraftPopulation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billThroughDate }),
  });
  return res.json();
}

export async function GetGranularJobData(billThroughDate) {
  const res = await fetch('/api/getGranularJobData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billThroughDate }),
  });
  return res.json();
}

export async function GetGranularWIPData() {
    console.log('calling GetGranularWIPData');
    const res = await fetch('/api/GetGranularWIPData', {
    method: "POST"
    })
    ;
  return res.json();
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

  return res.json();
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
  return res.text();
}
