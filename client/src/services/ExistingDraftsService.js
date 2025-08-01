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
  console.log(token);
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