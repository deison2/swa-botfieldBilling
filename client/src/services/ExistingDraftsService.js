

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
  console.log('Draft Indexes - ', draftIndexes);
  const res = await fetch('/api/CreateBulkPrintList', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draftIndexes)
  });
  if (!res.ok) throw new Error("Create failed");
  return res;
}

export async function DownloadBulkList(listId) {
  const res = await fetch(`api/DownloadBulkList/${listId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) throw new Error("Create failed");
  return res.blob();
}