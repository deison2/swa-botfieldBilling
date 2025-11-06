// api/autoBillingInsights/index.js
// Azure Function: GET /api/autoBillingInsights?date=YYYY-MM-DD
// - If a cached markdown insight exists in Blob Storage, return it.
// - Otherwise, compute a summary payload for that billing date,
//   call OpenAI with the standard prompt, cache the markdown, and return it.

const { BlobServiceClient } = require("@azure/storage-blob");
const OpenAI = require("openai");

const CONTAINER = "container-bmssprod001";
const DRAFT_PREFIX = "htmlData/automatedBilling/drafts/billed/";   // same pattern as autoBillingBilled
const INSIGHTS_PREFIX = "htmlData/automatedBilling/insights/";     // new folder for cached AI results

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
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

// ----- load data for one bill-through date ------------------------------

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

async function loadActualInvoices(ymd, log) {
  if (!ACTUAL_INVOICES_URL) {
    log("ACTUAL_INVOICES_URL not set – returning empty actuals");
    return [];
  }

  // The Logic App endpoint expects billThrough as a quoted string,
  // e.g. "'2025-10-15'". For Insights we only support single dates.
  const billThrough = `'${ymd}'`;

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

// This is a smaller, Node-friendly translation of your Draft Changes logic.

function buildAnalyticsPayload(ymd, draftRows, actualInvoices) {
  const label = formatLabelFromYmd(ymd);

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
    const key = clientKeyOf(clientId);

    const cur =
      draftsByClient.get(key) || {
        ClientId: key,
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

    draftsByClient.set(key, cur);
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
    const key = clientKeyOf(clientId);

    const cur =
      actualsByClient.get(key) || {
        ClientId: key,
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
    actualsByClient.set(key, cur);
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

  for (const c of comparedClients) {
    draftBill += c.DraftBill;
    draftWip += c.DraftWip;
    actualBill += c.ActualBill;
    actualWip += c.ActualWip;
    if (c.HasDraft && c.HasActual) {
      totalDrafts += 1;
      draftsUnchanged += c.UnchangedDrafts;
    }
  }

  const draftReal = draftWip > 0 ? draftBill / draftWip : 0;
  const actualReal = actualWip > 0 ? actualBill / actualWip : 0;

  // line-level counts & narrative stats
  let totalLineDrafts = 0;
  let lineNarrChanges = 0;
  let lineAmountChanges = 0;

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
    if (cls.kind === "amount") lineAmountChanges += 1;
    else if (cls.kind === "verbiage") lineNarrChanges += 1;

    let narrRec = topNarrMap.get(narrKey);
    if (!narrRec) {
      narrRec = {
        text: label,
        totalLineItems: 0,
        unchangedLines: 0,
        amountChanges: 0,
        verbiageChanges: 0,
        replacementFreq: new Map(), // key = serviceKey||label
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
          if (otherKey === narrKey) continue;
          const repLabel = bucket.label || "(blank)";
          const uses = Array.isArray(bucket.invoices)
            ? bucket.invoices.length
            : 1;
          const freqKey = `${serviceKey}||${repLabel}`;
          const existing =
            narrRec.replacementFreq.get(freqKey) || {
              service: serviceKey,
              replacementText: repLabel,
              uses: 0,
            };
          existing.uses += uses;
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
    lineAmountChanges,
    draftsUnchanged,
    totalDrafts,
    autoAcceptanceRate,
    targetAutoAcceptanceRate,
  };

  // 6) Groupings: byOffice, byService, byPartner
  function buildGrouping(keyName) {
    const map = new Map();
    for (const r of comparedClients) {
      const name =
        keyName === "Office"
          ? r.Office || "Unassigned"
          : keyName === "Service"
          ? r.Service || "Unassigned"
          : r.Partner || "Unassigned";

      const g =
        map.get(name) || {
          name,
          draftBill: 0,
          actualBill: 0,
          draftWip: 0,
          actualWip: 0,
          narrativeChanges: 0,
          amountChanges: 0, // we don't track per client, so leave 0 for now
          draftsUnchanged: 0,
          totalDrafts: 0,
          clients: 0,
        };

      g.draftBill += r.DraftBill;
      g.actualBill += r.ActualBill;
      g.draftWip += r.DraftWip;
      g.actualWip += r.ActualWip;
      g.narrativeChanges += r.NarrativeChanges;
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
        amountChanges: g.amountChanges,
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

  // 7) Top narratives array
  const topNarratives = [...topNarrMap.values()]
    .map((n) => {
      const percentUnchanged =
        n.totalLineItems > 0 ? n.unchangedLines / n.totalLineItems : 0;
      const replacements = [...n.replacementFreq.values()]
        .sort((a, b) => b.uses - a.uses)
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
      mode: "Date",
      label,
      ymd,
    },
    firmSummary,
    byOffice,
    byService,
    byPartner,
    topNarratives,
    config: {
      maxOffices: 10,
      maxServices: 10,
      maxPartners: 20,
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
- In "topNarratives", topReplacementNarratives shows the most common texts that partners actually used instead of the standard narrative, broken down by service, plus how many times each replacement appeared.

Your job is to:
1. Identify patterns in where the automation is working well vs where humans are still doing a lot of editing.
2. Connect those patterns to the firm's goals of standardization, less human intervention, and 80% auto-acceptance.
3. Recommend concrete actions to:
   - update or create standardized narratives,
   - reduce unnecessary edits,
   - and focus coaching/communication on outliers (partners, offices, or services that behave very differently from the majority).

Focus especially on:
1. Standard narratives and text behavior
   - Which standardized narratives are changed most often (low percent unchanged, high verbiageChanges or amountChanges)?
   - For those, what are the common replacement themes (e.g., adding timing details, listing specific services, clarifying scope, adjusting tone)?
   - Decide whether the firm should:
     - update the standard narrative to better match how people actually describe the work,
     - introduce one or two standardized variants for common scenarios,
     - or keep the standard narrative and instead encourage more adoption.
2. Partner, office, and service outliers
   - Identify partners/offices/services with very low auto-acceptance rates or very high change rates, especially when others are largely accepting the standard drafts.
   - Distinguish:
     - healthy, risk-aware adjustments (e.g., justified write-downs, complex situations), versus
     - habits or preferences that simply fight standardization with no clear client benefit.
   - Suggest where targeted coaching or communication could move them closer to the norm.
3. Automation success stories
   - Highlight partners, offices, or services where:
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
   - Call out offices, services, and partners that have high auto-acceptance and stable realization.
   - Explain what seems to make these areas successful.

3. **Where Humans Are Still Doing Too Much Work**
   - Identify the biggest pockets of manual editing (low auto-acceptance, high narrative/amount changes, or sharp drops in realization).
   - Describe what kind of edits are happening: mostly narrative tweaks, mostly amount changes, or both.

4. **Narrative Standardization Opportunities**
   - For the top standardized narratives with high change rates, summarize:
     - what people are changing them to (at a theme level), and
     - whether you recommend updating the standard text, creating variants, or encouraging partners to accept the standard.
   - Explicitly mention narratives where updating the standard could significantly reduce edits.

5. **Partner & Office Coaching Suggestions**
   - List specific partners or offices that are outliers compared to their peers, with brief notes.
   - Keep the tone constructive and focused on process improvement.

6. **Recommended Next Actions to Move Toward 80% Auto-Acceptance**
   - Provide a prioritized list (1–10) of concrete steps the firm should take before the next billing cycle.
   - Tie each recommendation back to the 80/20 target and the idea of simplifying through standardization.

Constraints:
- Do not invent numbers or partners that are not present in the data; base your statements only on trends that can reasonably be inferred from the JSON.
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

  const ymdRaw = req.query.date;
  if (!ymdRaw) {
    context.res = {
      status: 400,
      body: "Missing query parameter: date=YYYY-MM-DD",
    };
    return;
  }

  const ymd = toCanonicalYmd(ymdRaw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    context.res = {
      status: 400,
      body: `Invalid date format: ${ymdRaw}. Expected YYYY-MM-DD or MM/DD/YYYY.`,
    };
    return;
  }

  const container = blobServiceClient.getContainerClient(CONTAINER);
  const insightBlobName = blobNameForInsight(ymd);
  const insightBlob = container.getBlockBlobClient(insightBlobName);

  const forceRefresh = req.query.refresh === "1";

  try {
    // 1) Try cached markdown
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

    // 2) Load draft + actuals for that date
    log("loading data for", ymd);
    const [draftRows, actualInvoices] = await Promise.all([
      loadDraftRows(container, ymd, log),
      loadActualInvoices(ymd, log),
    ]);

    log("rows counts", {
      draftRows: draftRows.length,
      actualInvoices: actualInvoices.length,
    });

    // 3) Build compact analytics payload
    const payload = buildAnalyticsPayload(ymd, draftRows, actualInvoices);

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

    // 5) Cache to blob
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