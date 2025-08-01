

export async function getToken() {
    console.log('calling getToken');
    const res = await fetch('/api/getToken', {
    method: "POST"
    })
    ;
  if (!res.ok) {
    const text = await res.text(); // capture error payload
    throw new Error(`Load failed: ${res.status} ${text}`);
  }
}

export async function CreateBulkPrintList(draftIndexes) {
  const res = await fetch('/api/CreateBulkPrintList', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: draftIndexes
  });
  if (!res.ok) throw new Error("Create failed");
  return res.json();
}

export async function DownloadBulkList(listId) {
  const res = await fetch('/api/DownloadBulkList', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: listId
  });
  if (!res.ok) throw new Error("Create failed");
  return res.blob();
}