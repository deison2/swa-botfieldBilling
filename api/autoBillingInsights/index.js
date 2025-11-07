// api/autoBillingInsights/index.js
// Azure Function: GET /api/autoBillingInsights
// New contract (front-end):
//   GET /api/autoBillingInsights?mode=Date|Month|Year&period=...&dates=YYYY-MM-DD,YYYY-MM-DD&refresh=1
// Backwards compatible:
//   GET /api/autoBillingInsights?date=YYYY-MM-DD
//
// - If a cached markdown insight exists in Blob Storage (based on mode+period), return it.
// - Otherwise, compute a summary payload for that period (one or more billing dates),
//   call OpenAI with the standard prompt, cache the markdown, and return it.

const { BlobServiceClient } = require("@azure/storage-blob");
const OpenAI = require("openai");

const CONTAINER = "container-bmssprod001";
const DRAFT_PREFIX = "htmlData/automatedBilling/drafts/billed/"; // same pattern as autoBillingBilled
const INSIGHTS_PREFIX = "htmlData/automatedBilling/insights/"; // base folder for cached AI results

// IMPORTANT: set these in your Function App configuration
const STORAGE_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ACTUAL_INVOICES_URL =
  process.env.ACTUAL_INVOICES_URL ||
  "https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/actualInvoices?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug";

const blobServiceClient = BlobServiceClient.fromConnectionString(STORAGE_CONN);

const openaiClient = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ----- helpers -----------------------------------------------------------

function toCanonicalYmd(raw) {
  if (!raw) return "";
  const s = String(raw).slice(0, 10).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

function formatLabelFromYmd(ymd) {
  const [y, m, d] = String(ymd || "").split("-");
  if (!y || !m || !d) return String(ymd || "");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Human-friendly label for the period shown in the markdown + used in print
function labelForPeriod(mode, periodKey) {
  const m = (mode || "Date").toLowerCase();
  const key = String(periodKey || "");

  if (m === "date") {
    return formatLabelFromYmd(key);
  }

  if (m === "month") {
    const [y, mm] = key.split("-");
    if (!y || !mm) return key;
    const dt = new Date(Number(y), Number(mm) - 1, 1);
    return dt.toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  }

  if (m === "year") {
    return key;
  }

  return key;
}

function mapsEqualNum(m1, m2) {
  if (!m1 || !m2) return false;
  if (m1.size !== m2.size) return false;
  for (const [k, v1] of m1.entries()) {
    const v2 = m2.get(k);
    if (v2 === undefined) return false;
    if (Number(v1) !== Number(v2)) return false;
  }
  return true;
}

function norm(t) {
  return String(t || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripHtml(t) {
  return String(t || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clientKeyOf(id) {
  return String(id ?? "").trim().toLowerCase();
}

function serviceKeyOf(svc) {
  return String(svc ?? "").trim().toUpperCase();
}

function pick(row, keys, fallback = "Unassigned") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
}

async function streamToBuffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (d) => chunks.push(d));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

function blobNameForDraft(ymd) {
  const [Y, M, D] = String(ymd).split("-");
  const yy = String(Number(Y) % 100).padStart(2, "0");
  const mm = String(Number(M)).padStart(2, "0");
  const dd = String(Number(D)).padStart(2, "0");
  return `${DRAFT_PREFIX}draftsBilled_${mm}.${dd}.${yy}.json`;
}

function blobNameForInsight(ymd) {
  const [Y, M, D] = String(ymd).split("-");
  const yy = String(Number(Y) % 100).padStart(2, "0");
  const mm = String(Number(M)).padStart(2, "0");
  const dd = String(Number(D)).padStart(2, "0");
  return `${INSIGHTS_PREFIX}insights_${mm}.${dd}.${yy}.md`;
}

// DEBUG: JSON payload blob (what we send to OpenAI), keyed same way as markdown
function blobNameForInsightPayloadKey(mode, periodKey) {
  const m = (mode || "Date").toLowerCase();

  if (m === "date") {
    // For single-date mode keep the mm.dd.yy pattern
    const ymd = toCanonicalYmd(periodKey);
    const [Y, M, D] = String(ymd).split("-");
    const yy = String(Number(Y) % 100).padStart(2, "0");
    const mm = String(Number(M)).padStart(2, "0");
    const dd = String(Number(D)).padStart(2, "0");
    return `${INSIGHTS_PREFIX}insightsPayload_${mm}.${dd}.${yy}.json`;
  }

  // For Month/Year, mirror the folder/key pattern used by blobNameForInsightKey
  const safeMode = m === "month" || m === "year" ? m : "other";
  const safePeriod = String(periodKey || "").replace(/[^0-9A-Za-z_-]/g, "");

  // e.g. htmlData/automatedBilling/insights/month/insightsPayload_2025-09.json
  //      htmlData/automatedBilling/insights/year/insightsPayload_2025.json
  return `${INSIGHTS_PREFIX}${safeMode}/insightsPayload_${safePeriod}.json`;
}


// NEW: blob name for (mode, periodKey)
// Date mode keeps the old single-day convention;
// Month/Year get their own subfolders and simple keys.
function blobNameForInsightKey(mode, periodKey) {
  const m = (mode || "Date").toLowerCase();

  if (m === "date") {
    // Backwards-compatible: same pattern as existing single-date insights
    return blobNameForInsight(periodKey);
  }

  const safeMode = m === "month" || m === "year" ? m : "other";
  const safePeriod = String(periodKey || "").replace(/[^0-9A-Za-z_-]/g, "");

  // e.g. htmlData/automatedBilling/insights/month/insights_2025-09.md
  //      htmlData/automatedBilling/insights/year/insights_2025.md
  return `${INSIGHTS_PREFIX}${safeMode}/insights_${safePeriod}.md`;
}

// ----- load data for one or more bill-through dates ---------------------

async function loadDraftRows(container, ymd, log) {
  const blobName = blobNameForDraft(ymd);
  const blob = container.getBlockBlobClient(blobName);
  const exists = await blob.exists();
  log("draft exists?", { blobName, exists });
  if (!exists) return [];

  const dl = await blob.download();
  const buf = await streamToBuffer(dl.readableStreamBody);
  const text = buf.toString("utf8") || "[]";
  try {
    const json = JSON.parse(text);
    return Array.isArray(json) ? json : [];
  } catch (e) {
    log("draft JSON parse error", { blobName, error: e.message || e });
    return [];
  }
}

// NEW: load drafts for multiple YYYY-MM-DD dates and flatten
async function loadDraftRowsForDates(container, ymdList, log) {
  const all = [];
  for (const ymd of ymdList || []) {
    const rows = await loadDraftRows(container, ymd, log);
    if (Array.isArray(rows) && rows.length) {
      all.push(...rows);
    }
  }
  return all;
}

// NEW: actual invoices for one or more dates, same pattern as Comparison tab
// ymdInput can be a single "YYYY-MM-DD" or an array of them
async function loadActualInvoices(ymdInput, log) {
  if (!ACTUAL_INVOICES_URL) {
    log("ACTUAL_INVOICES_URL not set – returning empty actuals");
    return [];
  }

  const list = Array.isArray(ymdInput) ? ymdInput : [ymdInput];

  const dates = list
    .map((d) => toCanonicalYmd(d))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (!dates.length) {
    log("loadActualInvoices: no valid dates", { ymdInput });
    return [];
  }

  // "'2025-09-15','2025-09-30'"
  const billThrough = dates.map((d) => `'${d}'`).join(", ");

  const resp = await fetch(ACTUAL_INVOICES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ billThrough }),
  });

  if (!resp.ok) {
    log("actual invoices HTTP error", { status: resp.status });
    return [];
  }

  const raw = await resp.json();
  const normalized = (Array.isArray(raw) ? raw : []).map((r) => {
    let jobs = [];
    if (Array.isArray(r.JOB_SUMMARY)) {
      jobs = r.JOB_SUMMARY;
    } else if (typeof r.job_summary === "string" && r.job_summary.trim()) {
      try {
        jobs = JSON.parse(r.job_summary);
      } catch {
        /* ignore */
      }
    }

    let narrs = [];
    if (Array.isArray(r.NARRATIVE_SUMMARY)) {
      narrs = r.NARRATIVE_SUMMARY;
    } else if (
      typeof r.narrative_summary === "string" &&
      r.narrative_summary.trim()
    ) {
      try {
        narrs = JSON.parse(r.narrative_summary);
      } catch {
        /* ignore */
      }
    }

    const svcSet = new Set(
      (jobs || [])
        .map((j) => j.SERVICE ?? j.Service ?? j.service)
        .filter(Boolean)
        .map(String)
    );
    let derivedService = "Unassigned";
    if (svcSet.size === 1) derivedService = [...svcSet][0];
    else if (svcSet.size > 1) derivedService = "Multiple";

    return {
      ...r,
      BILLINGCLIENT:
        r.BILLINGCLIENT ?? r.billingclient ?? r.CONTINDEX ?? r.contindex ?? null,
      CLIENTOFFICE:
        r.CLIENTOFFICE ??
        r.clientoffice ??
        r.BILLINGCLIENTOFFICE ??
        r.billingclientoffice ??
        null,
      CLIENTPARTNERNAME:
        r.CLIENTPARTNERNAME ?? r.CLIENTPARTNER ?? r.clientpartner ?? null,
      CLIENTMANAGERNAME:
        r.CLIENTMANAGERNAME ?? r.CLIENTMANAGER ?? r.clientmanager ?? null,
      SERVINDEX: r.SERVINDEX ?? r.SERVICE ?? r.service ?? derivedService,
      JOB_SUMMARY: jobs,
      NARRATIVE_SUMMARY: narrs,
    };
  });

  return normalized;
}

// ----- analytics: build compact payload ------------------------------
//
// This is a smaller, Node-friendly translation of your Draft Changes logic.
// UPDATED: accepts a periodMeta object instead of just ymd.

function buildAnalyticsPayload(periodMeta, draftRows, actualInvoices) {
  const { mode, label, key, dates } = periodMeta;

  // 1) Aggregate drafts by client
  const draftsByClient = new Map();
  for (const d of draftRows || []) {
    const clientId =
      d.BILLINGCLIENT ??
      d.CONTINDEX ??
      d.CLIENTCODE ??
      d.BILLINGCLIENTCODE ??
      "";
    if (!clientId) continue;
    const keyC = clientKeyOf(clientId);

    const cur =
      draftsByClient.get(keyC) || {
        ClientId: keyC,
        ClientCode: pick(d, [
          "CLIENTCODE",
          "BILLINGCLIENTCODE",
          "BILLINGCLIENT",
          "CONTINDEX",
        ]),
        ClientName: pick(d, ["CLIENTNAME", "BILLINGCLIENTNAME"]),
        Office: pick(d, ["CLIENTOFFICE", "BILLINGCLIENTOFFICE"]),
        Partner: pick(d, ["CLIENTPARTNERNAME"]),
        Manager: pick(d, ["CLIENTMANAGERNAME"]),
        Service: pick(d, ["SERVINDEX"]),
        DraftBill: 0,
        DraftWip: 0,
        DraftNarrSet: new Set(),
        DraftLineTotals: new Map(),
      };

    cur.DraftBill += Number(d.BILLAMOUNT ?? 0);
    cur.DraftWip += Number(d.WIPOUTSTANDING ?? 0);

    const rawNarr = d.NARRATIVE ?? d.NARRATIVE_TEXT ?? "";
    const narrKey = norm(rawNarr);
    if (narrKey) {
      cur.DraftNarrSet.add(narrKey);
      const amt = Number(d.BILLAMOUNT ?? 0);
      if (!cur.DraftLineTotals.has(narrKey))
        cur.DraftLineTotals.set(narrKey, 0);
      cur.DraftLineTotals.set(
        narrKey,
        cur.DraftLineTotals.get(narrKey) + amt
      );
    }

    draftsByClient.set(keyC, cur);
  }

  for (const v of draftsByClient.values()) {
    v.DraftReal = v.DraftWip > 0 ? v.DraftBill / v.DraftWip : 0;
    v.DraftNarr = [...v.DraftNarrSet].join(" || ");
    delete v.DraftNarrSet;
  }

  // 2) Aggregate actuals by client
  const actualsByClient = new Map();
  for (const inv of actualInvoices || []) {
    const clientId =
      inv.BILLINGCLIENT ?? inv.CONTINDEX ?? inv.billingclient ?? "";
    if (!clientId) continue;
    const keyC = clientKeyOf(clientId);

    const cur =
      actualsByClient.get(keyC) || {
        ClientId: keyC,
        ClientCode: pick(inv, [
          "CLIENTCODE",
          "BILLINGCLIENT",
          "billingclient",
          "CONTINDEX",
          "contindex",
        ]),
        ClientName: pick(inv, [
          "CLIENTNAME",
          "BILLINGCLIENTNAME",
          "clientname",
          "billingclientname",
        ]),
        Office: pick(inv, [
          "CLIENTOFFICE",
          "BILLINGCLIENTOFFICE",
          "clientoffice",
          "billingclientoffice",
        ]),
        Partner: pick(inv, [
          "CLIENTPARTNERNAME",
          "CLIENTPARTNER",
          "clientpartner",
        ]),
        Manager: pick(inv, [
          "CLIENTMANAGERNAME",
          "CLIENTMANAGER",
          "clientmanager",
        ]),
        Service: pick(inv, ["SERVINDEX", "SERVICE", "service"]),
        ActualBill: 0,
        ActualWip: 0,
        ActualNarrSet: new Set(),
        ActualLineTotals: new Map(),
        _rawBucket: [],
      };

    const jobs = Array.isArray(inv.JOB_SUMMARY) ? inv.JOB_SUMMARY : [];
    for (const j of jobs) {
      cur.ActualBill += Number(j.BILLAMOUNT ?? 0);
      cur.ActualWip += Number(j.WIPOUTSTANDING ?? 0);
    }

    const narrs = Array.isArray(inv.NARRATIVE_SUMMARY)
      ? inv.NARRATIVE_SUMMARY
      : [];
    for (const n of narrs) {
      const raw = n.NARRATIVE ?? "";
      const keyN = norm(raw);
      const amt = Number(n.BILLAMOUNT ?? 0);
      if (keyN) {
        cur.ActualNarrSet.add(keyN);
        if (!cur.ActualLineTotals.has(keyN))
          cur.ActualLineTotals.set(keyN, 0);
        cur.ActualLineTotals.set(
          keyN,
          cur.ActualLineTotals.get(keyN) + amt
        );
      }
    }

    cur._rawBucket.push(inv);
    actualsByClient.set(keyC, cur);
  }

  for (const v of actualsByClient.values()) {
    v.ActualReal = v.ActualWip > 0 ? v.ActualBill / v.ActualWip : 0;
    v.ActualNarr = [...v.ActualNarrSet].join(" || ");
    delete v.ActualNarrSet;
  }

  // 3) Build line-level indices for classification & narrative stats
  const draftIndex = new Map();
  const actualIndex = new Map();

  for (const d of draftRows || []) {
    const clientId =
      d.BILLINGCLIENT ??
      d.CONTINDEX ??
      d.CLIENTCODE ??
      d.BILLINGCLIENTCODE ??
      "";
    if (!clientId) continue;
    const clientKey = clientKeyOf(clientId);
    const serviceKey = serviceKeyOf(d.SERVINDEX ?? "Unassigned");
    const rawNarr = d.NARRATIVE ?? d.NARRATIVE_TEXT ?? "";
    const narrKey = norm(rawNarr);
    if (!narrKey) continue;
    const label = stripHtml(rawNarr) || "(blank)";

    let cBucket = draftIndex.get(clientKey);
    if (!cBucket) {
      cBucket = { services: new Map() };
      draftIndex.set(clientKey, cBucket);
    }
    let svcMap = cBucket.services.get(serviceKey);
    if (!svcMap) {
      svcMap = new Map();
      cBucket.services.set(serviceKey, svcMap);
    }
    let nBucket = svcMap.get(narrKey);
    if (!nBucket) {
      nBucket = { label, amount: 0, rows: [] };
      svcMap.set(narrKey, nBucket);
    }
    nBucket.amount += Number(d.BILLAMOUNT ?? 0);
    nBucket.rows.push(d);
  }

  for (const inv of actualInvoices || []) {
    const clientId =
      inv.BILLINGCLIENT ?? inv.CONTINDEX ?? inv.billingclient ?? "";
    if (!clientId) continue;
    const clientKey = clientKeyOf(clientId);

    const narrs = Array.isArray(inv.NARRATIVE_SUMMARY)
      ? inv.NARRATIVE_SUMMARY
      : [];
    const jobs = Array.isArray(inv.JOB_SUMMARY) ? inv.JOB_SUMMARY : [];

    const svcSet = new Set(
      jobs
        .map((j) => j.SERVICE ?? j.Service ?? j.service)
        .filter(Boolean)
        .map(String)
    );
    const jobSvcFallback =
      svcSet.size === 1
        ? [...svcSet][0]
        : svcSet.size > 1
        ? "Multiple"
        : "Unassigned";

    let cBucket = actualIndex.get(clientKey);
    if (!cBucket) {
      cBucket = { services: new Map() };
      actualIndex.set(clientKey, cBucket);
    }

    for (const n of narrs) {
      const raw = n.NARRATIVE ?? "";
      const narrKey = norm(raw);
      if (!narrKey) continue;
      const label = stripHtml(raw) || "(blank)";
      const svc =
        n.SERVICE ?? n.service ?? n.Service ?? jobSvcFallback ?? "Unassigned";
      const serviceKey = serviceKeyOf(svc);

      let svcMap = cBucket.services.get(serviceKey);
      if (!svcMap) {
        svcMap = new Map();
        cBucket.services.set(serviceKey, svcMap);
      }
      let nBucket = svcMap.get(narrKey);
      if (!nBucket) {
        nBucket = { label, amount: 0, invoices: [] };
        svcMap.set(narrKey, nBucket);
      }
      nBucket.amount += Number(n.BILLAMOUNT ?? 0);
      nBucket.invoices.push(inv);
    }
  }

  function classifyDraftLine(clientKey, serviceKey, narrKey) {
    const dClient = draftIndex.get(clientKey);
    const aClient = actualIndex.get(clientKey);
    if (!dClient || !aClient) return null;

    const dSvc = dClient.services.get(serviceKey);
    if (!dSvc) return null;
    const dEntry = dSvc.get(narrKey);
    if (!dEntry) return null;

    const aSvc = aClient.services.get(serviceKey);
    if (!aSvc) {
      return { kind: "verbiage", draftTotal: dEntry.amount, actualTotal: 0 };
    }
    const aEntry = aSvc.get(narrKey);
    if (aEntry) {
      if (Number(aEntry.amount) === Number(dEntry.amount)) {
        return {
          kind: "unchanged",
          draftTotal: dEntry.amount,
          actualTotal: aEntry.amount,
        };
      }
      return {
        kind: "amount",
        draftTotal: dEntry.amount,
        actualTotal: aEntry.amount,
      };
    }

    // narrative never used at all for this client+service
    const actualSvcTotal = [...aSvc.values()].reduce(
      (sum, rec) => sum + Number(rec.amount || 0),
      0
    );
    return {
      kind: "verbiage",
      draftTotal: dEntry.amount,
      actualTotal: actualSvcTotal,
    };
  }

    // 4) Per-client comparison (similar to comparedClients in UI)
  const comparedClients = [];
  const allClientKeys = new Set([
    ...draftsByClient.keys(),
    ...actualsByClient.keys(),
  ]);

  for (const key of allClientKeys) {
    const d = draftsByClient.get(key);
    const a = actualsByClient.get(key);

    const DraftBill = d?.DraftBill ?? 0;
    const DraftWip = d?.DraftWip ?? 0;
    const DraftReal =
      d?.DraftReal ?? (DraftWip > 0 ? DraftBill / DraftWip : 0);

    const ActualBill = a?.ActualBill ?? 0;
    const ActualWip = a?.ActualWip ?? 0;
    const ActualReal =
      a?.ActualReal ?? (ActualWip > 0 ? ActualBill / ActualWip : 0);

    const DeltaBill = ActualBill - DraftBill;
    const DeltaReal = ActualReal - DraftReal;

    const NarrativeChanges =
      d && a && d.DraftNarr && a.ActualNarr && d.DraftNarr !== a.ActualNarr
        ? 1
        : 0;

    const UnchangedDrafts =
      d && a
        ? mapsEqualNum(d.DraftLineTotals, a.ActualLineTotals)
          ? 1
          : 0
        : 0;

    // NEW: simple client-level amount change flag
    const AmountChanges =
      d && a && Number(DraftBill) !== Number(ActualBill) ? 1 : 0;

    comparedClients.push({
      ClientId: key,
      ClientCode: d?.ClientCode ?? a?.ClientCode ?? key,
      ClientName: d?.ClientName ?? a?.ClientName ?? "",
      Office: d?.Office ?? a?.Office ?? "Unassigned",
      Partner: d?.Partner ?? a?.Partner ?? "Unassigned",
      Manager: d?.Manager ?? a?.Manager ?? "Unassigned",
      Service: d?.Service ?? a?.Service ?? "Unassigned",
      DraftBill,
      DraftWip,
      DraftReal,
      ActualBill,
      ActualWip,
      ActualReal,
      DeltaBill,
      DeltaReal,
      NarrativeChanges,
      UnchangedDrafts,
      AmountChanges,        // <--- NEW
      HasDraft: !!d,
      HasActual: !!a,
    });
  }

  // 5) Firm-level KPIs & auto-accept metrics
  let draftBill = 0,
    draftWip = 0,
    actualBill = 0,
    actualWip = 0;
  let draftsUnchanged = 0;
  let totalDrafts = 0;
  let amountChangeDrafts = 0;   // NEW

  for (const c of comparedClients) {
    draftBill += c.DraftBill;
    draftWip += c.DraftWip;
    actualBill += c.ActualBill;
    actualWip += c.ActualWip;
    if (c.HasDraft && c.HasActual) {
      totalDrafts += 1;
      draftsUnchanged += c.UnchangedDrafts;
      amountChangeDrafts += c.AmountChanges || 0;   // NEW
    }
  }

  const draftReal = draftWip > 0 ? draftBill / draftWip : 0;
  const actualReal = actualWip > 0 ? actualBill / actualWip : 0;

  // line-level counts & narrative stats
  let totalLineDrafts = 0;
  let lineNarrChanges = 0;
  let lineAmountChanges = amountChangeDrafts;   // NEW

  const topNarrMap = new Map(); // narrKey -> { text, ... , replacementFreq: Map }

  for (const d of draftRows || []) {
    const clientId =
      d.BILLINGCLIENT ??
      d.CONTINDEX ??
      d.CLIENTCODE ??
      d.BILLINGCLIENTCODE ??
      "";
    if (!clientId) continue;
    const clientKey = clientKeyOf(clientId);
    const serviceKey = serviceKeyOf(d.SERVINDEX ?? "Unassigned");
    const rawNarr = d.NARRATIVE ?? d.NARRATIVE_TEXT ?? "";
    const narrKey = norm(rawNarr);
    if (!narrKey) continue;
    const label = stripHtml(rawNarr) || "(blank)";

    const cls = classifyDraftLine(clientKey, serviceKey, narrKey);
    if (!cls) continue;

    totalLineDrafts += 1;
    if (cls.kind === "verbiage") lineNarrChanges += 1;

    let narrRec = topNarrMap.get(narrKey);
    if (!narrRec) {
      narrRec = {
        text: label,
        totalLineItems: 0,
        unchangedLines: 0,
        amountChanges: 0,
        verbiageChanges: 0,
        // key = `${serviceKey}||${label}` → {
        //   serviceKey, label, count, partners:Set, managers:Set
        // }
        replacementFreq: new Map(),
      };
      topNarrMap.set(narrKey, narrRec);
    }

    narrRec.totalLineItems += 1;
    if (cls.kind === "unchanged") narrRec.unchangedLines += 1;
    if (cls.kind === "amount") narrRec.amountChanges += 1;
    if (cls.kind === "verbiage") narrRec.verbiageChanges += 1;

    // replacement analysis for verbiage changes
    if (cls.kind === "verbiage") {
      const aClient = actualIndex.get(clientKey);
      const aSvc = aClient?.services.get(serviceKey);
      if (aSvc) {
        for (const [otherKey, bucket] of aSvc.entries()) {
          if (otherKey === narrKey) continue; // skip original text

          const repLabel = bucket.label || "(blank)";
          const freqKey = `${serviceKey}||${repLabel}`;

          const existing =
            narrRec.replacementFreq.get(freqKey) || {
              serviceKey,
              label: repLabel,
              count: 0,
              partners: new Set(),
              managers: new Set(),
            };

          const invoices = Array.isArray(bucket.invoices)
            ? bucket.invoices
            : [];

          existing.count += invoices.length || 1;

          for (const inv of invoices) {
            const partner =
              inv.CLIENTPARTNERNAME ??
              inv.CLIENTPARTNER ??
              inv.clientpartner ??
              null;
            const manager =
              inv.CLIENTMANAGERNAME ??
              inv.CLIENTMANAGER ??
              inv.clientmanager ??
              null;

            if (partner) existing.partners.add(String(partner));
            if (manager) existing.managers.add(String(manager));
          }

          narrRec.replacementFreq.set(freqKey, existing);
        }
      }
    }
  }

  const autoAcceptanceRate =
    totalDrafts > 0 ? draftsUnchanged / totalDrafts : 0;
  const targetAutoAcceptanceRate = 0.8;

  const firmSummary = {
    draftBill,
    actualBill,
    deltaBill: actualBill - draftBill,
    draftRealization: draftReal,
    actualRealization: actualReal,
    deltaRealization: actualReal - draftReal,
    totalLineDrafts,
    lineNarrativeChanges: lineNarrChanges,
    lineAmountChanges,           // now populated from amountChangeDrafts
    draftsUnchanged,
    totalDrafts,
    autoAcceptanceRate,
    targetAutoAcceptanceRate,
  };

  // 6) Groupings: byOffice, byService, byPartner, byManager
    function buildGrouping(keyName) {
    const map = new Map();
    for (const r of comparedClients) {
        const name =
        keyName === "Office"
            ? r.Office || "Unassigned"
            : keyName === "Service"
            ? r.Service || "Unassigned"
            : keyName === "Partner"
            ? r.Partner || "Unassigned"
            : r.Manager || "Unassigned";

        const g =
        map.get(name) || {
            name,
            draftBill: 0,
            actualBill: 0,
            draftWip: 0,
            actualWip: 0,
            narrativeChanges: 0,
            amountChanges: 0, // NEW: will hold count of clients with amount changes
            draftsUnchanged: 0,
            totalDrafts: 0,
            clients: 0,
        };

        g.draftBill += r.DraftBill;
        g.actualBill += r.ActualBill;
        g.draftWip += r.DraftWip;
        g.actualWip += r.ActualWip;
        g.narrativeChanges += r.NarrativeChanges;

        // NEW: aggregate draft-level amount change count for this slice
        g.amountChanges += r.AmountChanges || 0;

        g.draftsUnchanged += r.UnchangedDrafts;
        if (r.HasDraft && r.HasActual) g.totalDrafts += 1;
        g.clients += 1;

        map.set(name, g);
    }

    const arr = [...map.values()].map((g) => {
        const draftReal = g.draftWip > 0 ? g.draftBill / g.draftWip : 0;
        const actualReal = g.actualWip > 0 ? g.actualBill / g.actualWip : 0;
        const autoRate =
        g.totalDrafts > 0 ? g.draftsUnchanged / g.totalDrafts : 0;
        return {
        [keyName.toLowerCase()]: g.name,
        draftBill: g.draftBill,
        actualBill: g.actualBill,
        deltaBill: g.actualBill - g.draftBill,
        draftRealization: draftReal,
        actualRealization: actualReal,
        deltaRealization: actualReal - draftReal,
        narrativeChanges: g.narrativeChanges,
        amountChanges: g.amountChanges, // now a real, non-zero metric
        clients: g.clients,
        draftsUnchanged: g.draftsUnchanged,
        autoAcceptanceRate: autoRate,
        };
    });

    // sort by magnitude of deltaBill
    arr.sort((a, b) => Math.abs(b.deltaBill) - Math.abs(a.deltaBill));
    return arr;
    }


  const byOffice = buildGrouping("Office").slice(0, 10);
  const byService = buildGrouping("Service").slice(0, 10);
  const byPartner = buildGrouping("Partner").slice(0, 20);
  const byManager = buildGrouping("Manager").slice(0, 20);

  // 7) Top narratives array (with partner/manager arrays on replacements)
  const topNarratives = [...topNarrMap.values()]
    .map((n) => {
      const percentUnchanged =
        n.totalLineItems > 0 ? n.unchangedLines / n.totalLineItems : 0;

      const replacements = [...n.replacementFreq.values()]
        .map((entry) => ({
          serviceKey: entry.serviceKey,
          label: entry.label,
          count: entry.count,
          partners: [...entry.partners].sort((a, b) =>
            a.localeCompare(b)
          ),
          managers: [...entry.managers].sort((a, b) =>
            a.localeCompare(b)
          ),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        text: n.text,
        totalLineItems: n.totalLineItems,
        unchangedLines: n.unchangedLines,
        amountChanges: n.amountChanges,
        verbiageChanges: n.verbiageChanges,
        percentUnchanged,
        topReplacementNarratives: replacements,
      };
    })
    .sort((a, b) => b.totalLineItems - a.totalLineItems)
    .slice(0, 30);

  return {
    period: {
      mode: mode || "Date",
      label, // e.g. "Sep 2025" / "9/15/2025" / "2025"
      key, // raw period key, e.g. "2025-09", "2025-09-30", "2025"
      dates, // concrete YYYY-MM-DD values used in analysis
    },
    firmSummary,
    byOffice,
    byService,
    byPartner,
    byManager,
    topNarratives,
    config: {
      maxOffices: 10,
      maxServices: 10,
      maxPartners: 20,
      maxManagers: 20,
      maxNarratives: 30,
      maxReplacementsPerNarrative: 10,
    },
  };
}

// ----- OpenAI system prompt ---------------------------------------------

const SYSTEM_PROMPT = `
You are an expert billing and process-improvement consultant for a mid-sized public accounting firm that is rolling out automated invoice drafting.

The firm's strategic vision for billing is:
- Simplify through standardization.
- Reduce human intervention required to get invoices drafted and delivered.
- Make bill amounts and narrative verbiage easy to calculate and explain.
- Achieve an 80% auto-acceptance rate: at least 80% of draft invoices should go out exactly as drafted by automation, with no changes, and only about 20% should require human review or touchpoints for truly exceptional situations.

You will receive JSON data describing one billing cycle with this structure:
- "period": identifies the billing cycle.
- "firmSummary": overall drafted vs actual bill, realization, counts of narrative and amount changes, and statistics about how many drafts went out unchanged vs edited.
- "byOffice": one record per office with drafted bill, actual bill, realization, change counts, and auto-acceptance rate.
- "byService": one record per service line (e.g., ACCTG, BUSTAX) with the same metrics.
- "byPartner": one record per partner with the same metrics.
- "byManager": one record per manager with the same metrics. **Managers are the first reviewers of automated drafts and often change narratives before partners ever see them.**
- "topNarratives": standardized draft narrative texts, how often they were used, how often they changed, and the most common replacement narratives by service.

Field meanings:
- draftBill / actualBill: amounts in US dollars.
- draftRealization / actualRealization: decimal percentages (0.90 = 90%).
- deltaBill / deltaRealization: actual minus draft (negative means the final invoices are lower or less realized than the automated draft).
- narrativeChanges: number of line items where the narrative text was changed between draft and final invoice.
- amountChanges: number of line items where the billed amount changed.
- draftsUnchanged: count of drafts that went out exactly as the automation produced them.
- autoAcceptanceRate: draftsUnchanged / totalDrafts for that slice of data.
- targetAutoAcceptanceRate: the firm's goal (currently 0.8 = 80%).
- In "topNarratives", topReplacementNarratives shows, for each standard narrative:
  - which replacement narratives were actually used,
  - which service they were used in (serviceKey),
  - how often they were used (count),
  - which partners used them (partners array),
  - and which managers used them (managers array).

Important context about workflow:
- Managers typically receive the automated drafts first and make narrative and amount changes based on what they know specific partners want.
- Partners often see the draft only after a manager has already edited it.
- Coaching therefore needs to be directed at **both** partners and managers, and in some cases primarily at managers who are driving the edits on behalf of partners.

Your job is to:
1. Identify patterns in where the automation is working well vs where humans are still doing a lot of editing.
2. Connect those patterns to the firm's goals of standardization, less human intervention, and 80% auto-acceptance.
3. Recommend concrete actions to:
   - update or create standardized narratives,
   - reduce unnecessary edits,
   - and focus coaching/communication on outliers (partners, managers, offices, or services that behave very differently from the majority).

Focus especially on:
1. Standard narratives and text behavior
   - Which standardized narratives are changed most often (low percent unchanged, high verbiageChanges or amountChanges)?
   - For those, what are the common replacement themes (e.g., adding timing details, listing specific services, clarifying scope, adjusting tone)?
   - Use the partners and managers arrays on each replacement to identify **who** is driving those changes.
   - Decide whether the firm should:
     - update the standard narrative to better match how people actually describe the work,
     - introduce one or two standardized variants for common scenarios,
     - or keep the standard narrative and instead encourage more adoption.

2. Partner, manager, office, and service outliers
   - Identify partners, **managers**, offices, and services with very low auto-acceptance rates or very high change rates, especially when others are largely accepting the standard drafts.
   - Distinguish:
     - healthy, risk-aware adjustments (e.g., justified write-downs, complex situations), versus
     - habits or preferences that simply fight standardization with no clear client benefit.
   - Explicitly point out patterns where:
     - managers are heavily editing drafts on behalf of certain partners, or
     - partners in one office rely on a small group of managers who consistently change narratives a certain way.
   - Suggest where targeted coaching or communication could move them closer to the norm, and whether that coaching should focus on managers, partners, or both.

3. Automation success stories
   - Highlight partners, managers, offices, or services where:
     - auto-acceptance rates are high,
     - realization holds up,
     - and narrative changes are low.
   - Treat these as internal “best practices” and suggest how they could be shared or scaled.

4. Progress vs the 80% target
   - Compare the current firm-level auto-acceptance rate to the targetAutoAcceptanceRate.
   - Comment on whether the firm is trending in the right direction, significantly below target, or close to target.
   - Propose a practical path to improve toward 80% (for example: focus first on the 3 services with the highest volumes and biggest gaps).

Produce a concise, business-oriented report in markdown with these sections:

1. **Executive Summary**
   - 3–6 clear bullet points explaining the most important findings and how they relate to the 80% auto-acceptance goal.

2. **Where Automation Is Working Well**
   - Call out offices, services, partners, and managers that have high auto-acceptance and stable realization.
   - Explain what seems to make these areas successful.

3. **Where Humans Are Still Doing Too Much Work**
   - Identify the biggest pockets of manual editing (low auto-acceptance, high narrative/amount changes, or sharp drops in realization).
   - Describe what kind of edits are happening: mostly narrative tweaks, mostly amount changes, or both.
   - When you discuss problem areas, be explicit about whether the editing is driven mainly by managers, partners, or both.

4. **Narrative Standardization Opportunities**
   - For the top standardized narratives with high change rates, summarize:
     - what people are changing them to (at a theme level),
     - which partners and managers are driving those changes,
     - and whether you recommend updating the standard text, creating variants, or encouraging partners/managers to accept the standard.
   - Explicitly mention narratives where updating the standard could significantly reduce edits.

5. **Partner & Manager Coaching Suggestions**
   - List specific partners **and managers** that are outliers compared to their peers, with brief notes.
   - Where possible, connect partner outliers to the specific managers who are doing the editing for them.
   - Keep the tone constructive and focused on process improvement.

6. **Recommended Next Actions to Move Toward 80% Auto-Acceptance**
   - Provide a prioritized list (1–10) of concrete steps the firm should take before the next billing cycle.
   - Tie each recommendation back to the 80/20 target and the idea of simplifying through standardization.

Constraints:
- Do not invent numbers or people that are not present in the data; base your statements only on trends that can reasonably be inferred from the JSON.
- Avoid quoting very long narratives verbatim; summarize their themes instead.
- Keep the total answer under about 1,500 words and favor clear bullets over long paragraphs.
`.trim();

// ----- main Azure Function handler --------------------------------------

module.exports = async function (context, req) {
  const log = (...args) => context.log("autoBillingInsights:", ...args);

  if (!STORAGE_CONN) {
    context.res = {
      status: 500,
      body: "AZURE_STORAGE_CONNECTION_STRING not configured",
    };
    return;
  }
  if (!OPENAI_API_KEY) {
    context.res = {
      status: 500,
      body: "OPENAI_API_KEY not configured",
    };
    return;
  }

  // NEW: mode + period + optional dates list
  // Backwards-compatible: if only ?date= is supplied, treat as Date mode + period=date.
  const modeRaw = (req.query.mode || "Date").trim();
  const mode = ["Date", "Month", "Year"].includes(modeRaw) ? modeRaw : "Date";

  const periodRaw = req.query.period || req.query.date || "";
  const datesParam = req.query.dates || ""; // optional: "YYYY-MM-DD,YYYY-MM-DD"

  if (!periodRaw) {
    context.res = {
      status: 400,
      body:
        "Missing query parameter: use mode=Date|Month|Year and period=... (or legacy date=YYYY-MM-DD).",
    };
    return;
  }

  // Build selectedDates from dates=... or from the period itself (Date mode)
  let selectedDates = [];

  if (datesParam) {
    selectedDates = String(datesParam)
      .split(",")
      .map((s) => toCanonicalYmd(s.trim()))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  } else if (mode === "Date") {
    const ymd = toCanonicalYmd(periodRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      context.res = {
        status: 400,
        body: `Invalid date format: ${periodRaw}. Expected YYYY-MM-DD or MM/DD/YYYY.`,
      };
      return;
    }
    selectedDates = [ymd];
  }

  if (!selectedDates.length) {
    context.res = {
      status: 400,
      body:
        "No valid billing dates found for this request. Pass dates=YYYY-MM-DD,… or a valid date/period.",
    };
    return;
  }

  const periodKey = String(periodRaw);
  const periodLabel = labelForPeriod(mode, periodKey);

  const container = blobServiceClient.getContainerClient(CONTAINER);
  const insightBlobName = blobNameForInsightKey(mode, periodKey);
  const insightBlob = container.getBlockBlobClient(insightBlobName);

  const forceRefresh = req.query.refresh === "1";

  try {
    // 1) Try cached markdown for this (mode, period)
    if (!forceRefresh) {
      const exists = await insightBlob.exists();
      if (exists) {
        const dl = await insightBlob.download();
        const buf = await streamToBuffer(dl.readableStreamBody);
        const text = buf.toString("utf8");
        context.res = {
          status: 200,
          headers: { "Content-Type": "text/markdown; charset=utf-8" },
          body: text,
        };
        return;
      }
    }

    // 2) Load draft + actuals for the selected date list
    log("loading data for dates", selectedDates);
    const [draftRows, actualInvoices] = await Promise.all([
      loadDraftRowsForDates(container, selectedDates, log),
      loadActualInvoices(selectedDates, log),
    ]);

    log("rows counts", {
      draftRows: draftRows.length,
      actualInvoices: actualInvoices.length,
    });

    // 3) Build compact analytics payload
    const periodMeta = {
    mode,
    key: periodKey,
    label: periodLabel,
    dates: selectedDates,
    };

    const payload = buildAnalyticsPayload(periodMeta, draftRows, actualInvoices);

    // Optional: quick sanity logs
    log("firmSummary for AI payload", payload.firmSummary);
    log("sample byOffice row 0", payload.byOffice?.[0]);


    // NEW: Persist the exact JSON payload being sent to OpenAI
try {
  const insightJsonBlobName = blobNameForInsightPayloadKey(mode, periodKey);
  const insightJsonBlob = container.getBlockBlobClient(insightJsonBlobName);
  const jsonText = JSON.stringify(payload, null, 2);

  await insightJsonBlob.upload(jsonText, Buffer.byteLength(jsonText), {
    blobHTTPHeaders: {
      blobContentType: "application/json; charset=utf-8",
    },
  });

  log("Saved insight payload JSON", { blobName: insightJsonBlobName });
} catch (e) {
  log(
    "WARNING: failed to save insight payload JSON",
    e?.message || e
  );
}


    // 4) Call OpenAI
    const userContent =
    "Here is the data for this billing period in JSON format. Use it to produce the analysis described in your instructions.\n\n```json\n" +
    JSON.stringify(payload, null, 2) +
    "\n```";


    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
    });

    const markdown =
      completion.choices?.[0]?.message?.content ||
      "# AI Insights\n\nNo response was generated.";

    // 5) Cache markdown blob for this (mode, period)
    await insightBlob.upload(markdown, Buffer.byteLength(markdown), {
      blobHTTPHeaders: { blobContentType: "text/markdown; charset=utf-8" },
    });

    context.res = {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
      body: markdown,
    };
  } catch (err) {
    log("ERROR", err?.message || err);
    context.res = {
      status: 500,
      body: `autoBillingInsights failed: ${err.message || String(err)}`,
    };
  }
};