const API = "/api/narratives";
const loadJobAndServ = "/api/mapping";

export async function loadNarratives() {
  const res = await fetch(API);
  if (!res.ok) {
    const text = await res.text(); // capture error payload
    throw new Error(`Load failed: ${res.status} ${text}`);
  }
  return res.json();
}


export async function addNarrative(item) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item)
  });
  if (!res.ok) throw new Error("Create failed");
  return res.json();
}

export async function updateNarrative(uuid, partial) {
  const res = await fetch(`${API}/${uuid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial)
  });
  if (!res.ok) throw new Error("Update failed");
  return res.json();
}

export async function deleteNarrative(uuid) {
  const res = await fetch(`${API}/${uuid}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Delete failed");
}

export async function loadJobMapping() {
  const res = await fetch(`${loadJobAndServ}/jobMapping`);
  if (!res.ok) {
    const text = await res.text(); // capture error payload
    throw new Error(`Load failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function loadServiceMapping() {
  const res = await fetch(`${loadJobAndServ}/serviceMapping`);
  if (!res.ok) {
    const text = await res.text(); // capture error payload
    throw new Error(`Load failed: ${res.status} ${text}`);
  }
  return res.json();
}