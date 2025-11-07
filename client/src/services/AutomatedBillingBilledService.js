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

// services/AutomatedBillingBilledService.js

// mode: "Date" | "Month" | "Year"
// period: "YYYY-MM-DD" | "YYYY-MM" | "YYYY"
// dates: array of concrete YYYY-MM-DD values included in that period
// options.refresh: boolean – force OpenAI to rerun and overwrite cache
export async function getBillingAiInsights(
  mode,
  period,
  dates,
  options = {}
) {
  const params = new URLSearchParams();

  if (mode) params.set("mode", mode);
  if (period) params.set("period", period);

  if (Array.isArray(dates) && dates.length) {
    params.set("dates", dates.join(",")); // "2025-09-15,2025-09-30"
  }

  if (options.refresh) {
    params.set("refresh", "1");
  }

  const resp = await fetch(`/api/autoBillingInsights?${params.toString()}`);

  if (!resp.ok) {
    throw new Error(`autoBillingInsights HTTP ${resp.status}`);
  }

  return resp.text();
}

