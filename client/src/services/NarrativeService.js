const API = "/api/narratives";
const loadJobAndServ = "/api/mapping";

export async function loadNarratives() {
  const res = await fetch(API);
  if (!res.ok) {
    const text = await res.text(); // capture error payload
    throw new Error(`Load failed: ${res.status} ${text}`);
  }
  const tempBody = await res.json();
  const returnbodyNarr = tempBody.sort((a, b) => a.Narrative.localeCompare(b.Narrative));
  const returnbodyLevel = returnbodyNarr.sort((a, b) => (b.Level === 'SERV') - (a.Level === 'SERV') || a.Level.localeCompare(b.Level));
  const returnbodyServ = returnbodyLevel.sort((a, b) => (b.Serv === 'ALL') - (a.Serv === 'ALL') || a.Serv.localeCompare(b.Serv));
  return returnbodyServ;
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

async function fetchWithErrors(url, name) {
  try {
    const res = await fetch(url);
    // HTTP-level failures still resolve; check .ok
    if (!res.ok) {
      const payload = await res.text();
      if (res.status === 504) {
        throw new Error(`Gateway timeout (504) when loading ${name}`);
      }
      throw new Error(`Load ${name} failed: ${res.status} ${payload}`);
    }
    return res.json();
  } catch (err) {
    // This will catch network/proxy failures (TypeError) as well
    console.error(`Error fetching ${name}:`, err);
    throw err; 
  }
}

export function loadJobMapping() {
  return fetchWithErrors(
    `${loadJobAndServ}/jobMapping`,
    'job mapping'
  );
}

export function loadServiceMapping() {
  return fetchWithErrors(
    `${loadJobAndServ}/serviceMapping`,
    'service mapping'
  );
}