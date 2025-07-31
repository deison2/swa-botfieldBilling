

export async function getToken() {
  return fetchWithErrors(
    '/getToken',
    'Get Token'
  );
}

export async function CreateBulkPrintList(draftIndexes) {
  const res = await fetch('/CreateBulkPrintList', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: draftIndexes
  });
  if (!res.ok) throw new Error("Create failed");
  return res.json();
}

export async function DownloadBulkList(listId) {
  const res = await fetch('/DownloadBulkList', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: listId
  });
  if (!res.ok) throw new Error("Create failed");
  return res.blob();
}