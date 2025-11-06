const API = "/api/recurrings";
const loadJobAndServ = "/api/mapping";
const loadClient = "/api/clientMapping";

export async function loadRecurrings() {
  const res = await fetch(API);
  if (!res.ok) {
    const text = await res.text(); // capture error payload
    throw new Error(`Load failed: ${res.status} ${text}`);
  }
  const tempBody = await res.json();
  const returnbody = tempBody.sort((a, b) => a.ClientCode.localeCompare(b.ClientCode));
  return returnbody;
}


export async function addRecurrings(item) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item)
  });
  if (!res.ok) throw new Error("Create failed");
  return res.json();
}

export async function reqAddRecurrings(item) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item)
  });
  if (!res.ok) throw new Error("Create failed");
  return res.json();
}

export async function updateRecurrings(uuid, partial) {
  const res = await fetch(`${API}/${uuid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial)
  });
  if (!res.ok) throw new Error("Update failed");
  return res.json();
}

export async function reqUpdateRecurrings(uuid, partial) {
  const res = await fetch(`${API}/${uuid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial)
  });
  if (!res.ok) throw new Error("Update failed");
  return res.json();
}

export async function reqDeleteRecurrings(uuid) {
  const res = await fetch(`${API}/${uuid}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Delete failed");
}

export async function deleteRecurrings(uuid) {
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

export function loadServMapping() {
  return fetchWithErrors(
    `${loadJobAndServ}/serviceMapping`,
    'service mapping'
  );
}


export function loadClientMapping() {
  return fetchWithErrors(
    `${loadClient}`,
    'client mapping'
  );
}