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

async function fetchWithErrors(url) {
  try {
    const res = await fetch(url);
    // HTTP-level failures still resolve; check .ok
    if (!res.ok) {
      const payload = await res.text();
      if (res.status === 504) {
        throw new Error(`Gateway timeout (504) when loading ${url}`);
      }
      throw new Error(`Load failed: ${res.status} ${payload}`);
    }
    return res.json();
  } catch (err) {
    // This will catch network/proxy failures (TypeError) as well
    console.error('Error fetching - ', err);
    throw err; 
  }
}

export function GetDrafts() {
  return fetchWithErrors('/api/getDraftPopulation');
}

export function GetGranularJobData() {
  return fetchWithErrors('/api/getGranularJobData');
}