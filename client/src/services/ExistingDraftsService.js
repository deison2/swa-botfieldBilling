import { getAuthToken } from './runtimeConfig';

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
  const token = await getAuthToken();
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
