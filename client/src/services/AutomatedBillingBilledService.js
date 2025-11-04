export async function listBilledPeriods() {
  const r = await fetch("/api/autoBillingBilled?list=1");
  if (!r.ok) throw new Error(`listBilledPeriods failed: ${r.status}`);
  return r.json(); // [{ymd, label, name, ...}]
}

export async function getBilledData(ymd) {
  const r = await fetch(`/api/autoBillingBilled?date=${encodeURIComponent(ymd)}`);
  if (!r.ok) throw new Error(`getBilledData failed: ${r.status}`);
  return r.json(); // the raw rows array for that period
}