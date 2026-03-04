export async function listExcludedPeriods() {
  const res = await fetch(`/api/automatedBillingExcluded?list=1`);
  if (!res.ok) throw new Error(`listExcludedPeriods ${res.status}`);
  /** @type {{ymd:string,label:string}[]} */
  const arr = await res.json();
  return Array.isArray(arr) ? arr : [];
}

export async function getExcludedData(ymd) {
  const res = await fetch(`/api/automatedBillingExcluded?date=${encodeURIComponent(ymd)}`);
  if (!res.ok) throw new Error(`getExcludedData ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function getUserName(email) {
  const r = await fetch(`/api/getUserName/${encodeURIComponent(email)}`);
  if (!r.ok) throw new Error(`getUserName failed: ${r.status}`);
  return r.text(); // the user name for the given email
}