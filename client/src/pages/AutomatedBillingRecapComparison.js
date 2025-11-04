import { useEffect, useMemo, useState } from "react";
import GeneralDataTable from "../components/DataTable";
import Loader from "../components/Loader"; // <-- add this line


// data (fallbacks only)
import sampleRecapBilled from "../devSampleData/sampleRecapBilled.json";     // fallback: automation proposal (job-grain; has BEFOREDATE)
import sampleActualInvoicesAll from "../devSampleData/sampleActualBilled.json"; // fallback only

// NEW: periods + billed data from same service as main Recap
import { listBilledPeriods, getBilledData } from "../services/AutomatedBillingBilledService";


/* ---------- helpers ---------- */
 function mapsEqualNum(m1, m2) {
   if (!m1 || !m2) return false;
   if (m1.size !== m2.size) return false;
   for (const [k, v1] of m1.entries()) {
     const v2 = m2.get(k);
     if (v2 === undefined) return false;
     if (Number(v1) !== Number(v2)) return false; // exact match; add tolerance if desired
   }
   return true;
 }

 // tighter table look (works with react-data-table-component)
const tableStyles = {
  table: { style: { tableLayout: "fixed" } }, // more predictable widths
  headCells: {
    style: {
      paddingTop: "6px",
      paddingBottom: "6px",
      paddingLeft: "10px",
      paddingRight: "10px",
      fontSize: "12px",
      lineHeight: 1.1,
      whiteSpace: "nowrap",
    },
  },
  cells: {
    style: {
      paddingTop: "6px",
      paddingBottom: "6px",
      paddingLeft: "10px",
      paddingRight: "10px",
    },
  },
  rows: {
    style: {
      minHeight: "34px",
    },
  },
};


const fmtCurrency = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtCurrency0 = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const fmtPct = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

const formatYmd = (ymd) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return String(ymd || "");
  const [y, m, d] = String(ymd).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};

const norm = (t) =>
  String(t || "")
    .replace(/<[^>]+>/g, " ") // strip html
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const pick = (row, keys, fallback = "Unassigned") => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
};

const groupAccessorOf = (key) => {
  switch (key) {
    case "Office":
      return (r) => r.Office || "Unassigned";
    case "Partner":
      return (r) => r.Partner || "Unassigned";
    case "Manager":
      return (r) => r.Manager || "Unassigned";
    case "Service":
      return (r) => r.Service || "Unassigned";
    default:
      return (r) => "Unassigned";
  }
};

/* simple clipboard helper with fallback + tiny toast text */
async function copyJson(obj, onDone) {
  const text = JSON.stringify(obj, null, 2);
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    onDone?.(true);
  } catch {
    onDone?.(false);
  }
}

function RotatingKpi({
  title,
  items,            // [{label:'Draft', value:number}, {label:'Actual', value:number}, {label:'Δ', value:number}]
  format = (x) => x,
  intervalMs = 3000,
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!items?.length) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(t);
  }, [items?.length, intervalMs]);

  const current = items?.[idx] ?? { label: "", value: 0 };

  return (
    <div className="kpi-card rotkpi" aria-live="polite">
      {/* header row: title left, rotating sublabel right */}
      <div className="kpi-title-row">
        <div className="kpi-title">{title}</div>
        <div
          key={current.label}     /* key triggers a soft fade on change */
          className={`kpi-sub ${current.label === "Δ" ? (current.value >= 0 ? "pos" : "neg") : ""}`}
          aria-hidden="false"
        >
          {current.label}
        </div>
      </div>

      {/* rotating value */}
      <div className="rotkpi-stagewrap">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={`rotkpi-stage ${i === idx ? "is-active" : ""}`}
            aria-hidden={i === idx ? "false" : "true"}
          >
            <div className={`rotkpi-value ${it.label === "Δ" ? (it.value >= 0 ? "pos" : "neg") : ""}`}>
              {format(it.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ACTUAL_INVOICES_URL =
  "https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/actualInvoices?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug";


/* ---------- main ---------- */
export default function AutomatedBillingRecapComparison() {
  const [period, setPeriod] = useState("");
  const [groupKey, setGroupKey] = useState("Partner");
  const [nameFilter, setNameFilter] = useState("");
  const [toast, setToast] = useState(""); // tiny “Copied!” message

    // NEW: periods (from listBilledPeriods) + dynamic actual invoices
  const [periods, setPeriods] = useState([]); // [{ ymd, label? }, ...]
  const [actualInvoicesAll, setActualInvoicesAll] = useState([]);
  const [loadingActuals, setLoadingActuals] = useState(false);
  const [loadingPeriods, setLoadingPeriods] = useState(false);   // NEW

    // NEW: live draft rows (billed automation) for the selected period
  const [draftRows, setDraftRows] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
    // Show only clients that have both Draft + Actual
  const [onlyApiDrafts, setOnlyApiDrafts] = useState(false);



    /* periods from backend (same logic as main Recap: listBilledPeriods) */
    useEffect(() => {
      let cancelled = false;

      (async () => {
        setLoadingPeriods(true);  // NEW: start periods loading
        try {
          const list = await listBilledPeriods();
          if (!cancelled && Array.isArray(list) && list.length) {
            // list is expected to be like [{ ymd: "2025-09-30", label: "09/30/2025" }, ...]
            setPeriods(list);
            return; // success path, skip fallback
          }
        } catch (e) {
          console.warn(
            "[Comparison] listBilledPeriods failed, falling back to local draftRowsAll",
            e
          );
        }

        // Fallback: derive periods from the local sampleRecapBilled file
        if (!cancelled) {
          const setY = new Set(
            (sampleRecapBilled || []).map((r) =>
              r.BEFOREDATE ? String(r.BEFOREDATE).slice(0, 10) : ""
            )
          );
          const arr = [...setY].filter(Boolean);
          arr.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // desc
          setPeriods(arr.map((ymd) => ({ ymd }))); // minimal shape
        }

      })()
        .finally(() => {
          if (!cancelled) setLoadingPeriods(false);   // NEW: stop periods loading
        });

      return () => {
        cancelled = true;
      };
    }, []);



    // Actual list of "YYYY-MM-DD" strings for the dropdown
    // but EXCLUDE the max (most recent) date
    const periodOptions = useMemo(() => {
      if (!periods || !periods.length) return [];

      // Collect all ymd strings (ignore any missing)
      const ymds = periods
        .map((p) => p.ymd)
        .filter(Boolean);

      if (!ymds.length) return [];

      // ISO "YYYY-MM-DD" compares correctly as strings
      const maxYmd = ymds.reduce(
        (max, cur) => (max && max > cur ? max : cur),
        ""
      );

      // Return all dates except the max
      return ymds.filter((ymd) => ymd !== maxYmd);
    }, [periods]);


      /* live draft rows for the selected period (baseline for the view) */
      useEffect(() => {
        let cancelled = false;

        if (!period) {
          setDraftRows([]);
          return;
        }

        (async () => {
          setLoadingDrafts(true);
          try {
            // same endpoint as the Billed tab
            const data = await getBilledData(period);
            if (!cancelled) {
              if (Array.isArray(data)) {
                setDraftRows(data);
              } else {
                setDraftRows([]);
              }
            }
          } catch (e) {
            console.warn(
              "[Comparison] getBilledData failed; falling back to sampleRecapBilled.json",
              e
            );
            if (!cancelled) {
              const fallback = (sampleRecapBilled || []).filter(
                (r) => String(r.BEFOREDATE).slice(0, 10) === period
              );
              setDraftRows(fallback);
            }
          } finally {
            if (!cancelled) setLoadingDrafts(false);
          }
        })();

        return () => {
          cancelled = true;
        };
      }, [period]);

  

    // Fetch actual invoices for the selected period, normalize stringified arrays
    useEffect(() => {
      let cancelled = false;

      // No period selected -> clear actuals
      if (!period) {
        setActualInvoicesAll([]);
        return;
      }

      async function loadActualInvoices() {
        setLoadingActuals(true);
        try {
          // POST with JSON body: { "billThrough": "YYYY-MM-DD" }
          // (spelling matches what you specified)
          const resp = await fetch(ACTUAL_INVOICES_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              billThrough: period,
            }),
          });

          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }

          const raw = await resp.json();

          const normalized = (Array.isArray(raw) ? raw : []).map((r) => {
            // Parse job_summary (stringified JSON: "[{...}, {...}]")
            let jobs = [];
            if (Array.isArray(r.JOB_SUMMARY)) {
              jobs = r.JOB_SUMMARY;
            } else if (typeof r.job_summary === "string" && r.job_summary.trim()) {
              try {
                jobs = JSON.parse(r.job_summary);
              } catch (err) {
                console.warn(
                  "[Comparison] Failed to parse job_summary JSON",
                  err,
                  r.job_summary
                );
              }
            }

            // Parse narrative_summary (stringified JSON)
            let narrs = [];
            if (Array.isArray(r.NARRATIVE_SUMMARY)) {
              narrs = r.NARRATIVE_SUMMARY;
            } else if (
              typeof r.narrative_summary === "string" &&
              r.narrative_summary.trim()
            ) {
              try {
                narrs = JSON.parse(r.narrative_summary);
              } catch (err) {
                console.warn(
                  "[Comparison] Failed to parse narrative_summary JSON",
                  err,
                  r.narrative_summary
                );
              }
            }

            // helper to derive a service label from jobs if we need it
            const svcSet = new Set(
              (jobs || [])
                .map((j) => j.SERVICE ?? j.Service ?? j.service)
                .filter(Boolean)
                .map(String)
            );
            let derivedService = "Unassigned";
            if (svcSet.size === 1) {
              derivedService = [...svcSet][0];
            } else if (svcSet.size > 1) {
              derivedService = "Multiple";
            }

            return {
              ...r,

              // Normalize client field so existing logic keeps working:
              BILLINGCLIENT:
                r.BILLINGCLIENT ??
                r.billingclient ??
                r.CONTINDEX ??
                r.contindex ??
                null,

              // Normalize office / partner / manager so they match draft-side names
              CLIENTOFFICE:
                r.CLIENTOFFICE ??
                r.clientoffice ??
                r.BILLINGCLIENTOFFICE ??
                r.billingclientoffice ??
                null,

              CLIENTPARTNERNAME:
                r.CLIENTPARTNERNAME ??
                r.CLIENTPARTNER ??
                r.clientpartner ??
                null,

              CLIENTMANAGERNAME:
                r.CLIENTMANAGERNAME ??
                r.CLIENTMANAGER ??
                r.clientmanager ??
                null,

              // Give ourselves a SERVINDEX-ish value for grouping by Service
              SERVINDEX: r.SERVINDEX ?? r.SERVICE ?? r.service ?? derivedService,

              // Normalize to the structure your comparison code already expects:
              JOB_SUMMARY: jobs,
              NARRATIVE_SUMMARY: narrs,
            };
          });

          if (!cancelled) {
            setActualInvoicesAll(normalized);
          }
        } catch (err) {
          console.warn(
            "[Comparison] actualInvoices fetch failed; using sampleActualBilled fallback",
            err
          );
          if (!cancelled) {
            setActualInvoicesAll(
              Array.isArray(sampleActualInvoicesAll)
                ? sampleActualInvoicesAll
                : []
            );
          }
        } finally {
          if (!cancelled) setLoadingActuals(false);
        }
      }

      loadActualInvoices();

      return () => {
        cancelled = true;
      };
    }, [period]);

    const loadingCombined = loadingPeriods || loadingActuals || loadingDrafts;

  /* 1) Aggregate DRAFTS per client (sum Bill, sum WIP, concat unique narratives) */
  const draftsByClient = useMemo(() => {
    const map = new Map();
    for (const d of draftRows) {
      const clientId =
        d?.BILLINGCLIENT ?? d?.CONTINDEX ?? d?.CLIENTCODE ?? d?.BILLINGCLIENTCODE ?? "";
      if (clientId === "" || clientId === null || clientId === undefined) continue;
      const key = String(clientId).trim().toLowerCase();

      const cur =
        map.get(key) || {
          ClientId: key,
          ClientCode: pick(d, ["CLIENTCODE", "BILLINGCLIENTCODE", "BILLINGCLIENT", "CONTINDEX"]),
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

      cur.DraftBill += Number(d?.BILLAMOUNT ?? 0);
      cur.DraftWip += Number(d?.WIPOUTSTANDING ?? 0);

      const dn = d?.NARRATIVE ?? d?.NARRATIVE_TEXT ?? "";
      const dnNorm = norm(dn);
      if (dn) cur.DraftNarrSet.add(dnNorm);
    
      // sum draft amounts by normalized narrative text
      const amt = Number(d?.BILLAMOUNT ?? 0);
      if (!cur.DraftLineTotals.has(dnNorm)) cur.DraftLineTotals.set(dnNorm, 0);
      cur.DraftLineTotals.set(dnNorm, cur.DraftLineTotals.get(dnNorm) + amt);

      map.set(key, cur);
    }

    for (const v of map.values()) {
      v.DraftReal = v.DraftWip > 0 ? v.DraftBill / v.DraftWip : 0;
      v.DraftNarr = [...v.DraftNarrSet].filter(Boolean).join(" || ");
      delete v.DraftNarrSet;
    }
    return map;
  }, [draftRows]);

  

  /* 2) Aggregate ACTUALS per client (sum JOB_SUMMARY WIP/BILL; concat narrative text).
        Restricted to clients present in drafts for this period. */
    const actualsByClient = useMemo(() => {
      const map = new Map();

      for (const inv of actualInvoicesAll || []) {
        const clientId =
          inv?.BILLINGCLIENT ?? inv?.CONTINDEX ?? inv?.billingclient ?? "";
        if (clientId === "" || clientId === null || clientId === undefined)
          continue;
        const key = String(clientId).trim().toLowerCase();

        const cur =
          map.get(key) || {
            ClientId: key,
            ClientCode: pick(
              inv,
              ["CLIENTCODE", "BILLINGCLIENT", "billingclient", "CONTINDEX", "contindex"],
              String(clientId)
            ),
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
            _rawBucket: [], // keep raw invoices included -> for copy
          };

      const jobs = Array.isArray(inv?.JOB_SUMMARY) ? inv.JOB_SUMMARY : [];
      for (const j of jobs) {
        cur.ActualBill += Number(j?.BILLAMOUNT ?? 0);
        cur.ActualWip += Number(j?.WIPOUTSTANDING ?? 0);
      }

      const narrs = Array.isArray(inv?.NARRATIVE_SUMMARY) ? inv.NARRATIVE_SUMMARY : [];
      for (const n of narrs) {
        const t = n?.NARRATIVE ?? "";
        const tNorm = norm(t);
        const amt = Number(n?.BILLAMOUNT ?? 0);
        if (t) cur.ActualNarrSet.add(tNorm);
        if (!cur.ActualLineTotals.has(tNorm)) cur.ActualLineTotals.set(tNorm, 0);
        cur.ActualLineTotals.set(tNorm, cur.ActualLineTotals.get(tNorm) + amt);
      }

      cur._rawBucket.push(inv);
      map.set(key, cur);
    }

    for (const v of map.values()) {
      v.ActualReal = v.ActualWip > 0 ? v.ActualBill / v.ActualWip : 0;
      v.ActualNarr = [...v.ActualNarrSet].filter(Boolean).join(" || ");
      delete v.ActualNarrSet;
    }

    return map;
  }, [actualInvoicesAll]);


  /* 3) Build per-client comparison rows (before grouping) */
    const comparedClients = useMemo(() => {
    const out = [];

    // union of all client keys in drafts and actuals
    const allKeys = new Set([
      ...draftsByClient.keys(),
      ...actualsByClient.keys(),
    ]);

    for (const key of allKeys) {
      const d = draftsByClient.get(key);
      const a = actualsByClient.get(key);

      const DraftBill = d?.DraftBill ?? 0;
      const DraftWip = d?.DraftWip ?? 0;
      const DraftReal = d?.DraftReal ?? (DraftWip > 0 ? DraftBill / DraftWip : 0);

      const ActualBill = a?.ActualBill ?? 0;
      const ActualWip = a?.ActualWip ?? 0;
      const ActualReal = a?.ActualReal ?? (ActualWip > 0 ? ActualBill / ActualWip : 0);

      const DeltaBill = ActualBill - DraftBill;
      const DeltaReal = ActualReal - DraftReal;

      const NarrativeChanges =
        d && a && d.DraftNarr && a.ActualNarr && d.DraftNarr !== a.ActualNarr ? 1 : 0;

      const UnchangedDrafts =
        d && a ? mapsEqualNum(d.DraftLineTotals, a.ActualLineTotals) ? 1 : 0 : 0;

      out.push({
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

    return out;
  }, [draftsByClient, actualsByClient]);

    // Optionally restrict to clients that have BOTH draft + actual
    const filteredClients = useMemo(() => {
      if (!onlyApiDrafts) return comparedClients;
      return comparedClients.filter((r) => r.HasDraft && r.HasActual);
    }, [comparedClients, onlyApiDrafts]);


  /* 4) Grouped table data using ratio-of-sums (matches Billed tab) */
  const accessor = useMemo(() => groupAccessorOf(groupKey), [groupKey]);

    const grouped = useMemo(() => {
    // ---- Narrative mode ----------------------------------------------------
    if (groupKey === "Narrative") {
      const byNarr = new Map(); // key = normalized narrative

      // Only consider clients in the current filtered set
      const allowedKeys = new Set(filteredClients.map((c) => c.ClientId));

      for (const d of draftRows) {
        const clientId =
          d?.BILLINGCLIENT ?? d?.CONTINDEX ?? d?.CLIENTCODE ?? d?.BILLINGCLIENTCODE ?? "";
        if (clientId === "" || clientId === null || clientId === undefined) continue;
        const clientKey = String(clientId).trim().toLowerCase();

        if (!allowedKeys.has(clientKey)) continue;

        const raw = d?.NARRATIVE ?? d?.NARRATIVE_TEXT ?? "";
        const narrKey = norm(raw);
        if (!narrKey) continue;

        // human-ish label (strip tags, keep case)
        const label =
          String(raw || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "(blank)";

        const rec =
          byNarr.get(narrKey) ||
          {
            Name: label,
            TotalDrafts: 0,
            UnchangedDrafts: 0,
            AmountChanges: 0,
            VerbiageChanges: 0,
          };

        rec.TotalDrafts += 1;

        // For this client + narrative, compare the *totals* draft vs actual.
        const dAgg = draftsByClient.get(clientKey);
        const aAgg = actualsByClient.get(clientKey);
        const dTot = dAgg?.DraftLineTotals?.get(narrKey);
        const aTot = aAgg?.ActualLineTotals?.get(narrKey);

        if (dTot !== undefined && aTot !== undefined) {
          if (Number(dTot) === Number(aTot)) {
            rec.UnchangedDrafts += 1;         // same wording, same total
          } else {
            rec.AmountChanges += 1;           // same wording, different total
          }
        } else if (dTot !== undefined && aTot === undefined) {
          rec.VerbiageChanges += 1;           // wording changed / line missing
        }

        byNarr.set(narrKey, rec);
      }

      const arr = [...byNarr.values()].map((r) => ({
        ...r,
        PctUnchanged: r.TotalDrafts ? r.UnchangedDrafts / r.TotalDrafts : 0,
      }));

      // default sort: most common narratives first
      arr.sort((a, b) => b.TotalDrafts - a.TotalDrafts);
      return arr;
    }

    // ---- Existing client-based grouping -----------------------------------
    const map = new Map();
    for (const r of filteredClients) {
      const name = accessor(r);
      const g =
        map.get(name) || {
          Name: name,
          Rows: 0,
          DraftBill: 0,
          DraftWip: 0,
          ActualBill: 0,
          ActualWip: 0,
          NarrativeChanges: 0,
          UnchangedDrafts: 0,
        };
      g.Rows += 1;
      g.DraftBill += r.DraftBill;
      g.DraftWip += r.DraftWip;
      g.ActualBill += r.ActualBill;
      g.ActualWip += r.ActualWip;
      g.NarrativeChanges += r.NarrativeChanges;
      g.UnchangedDrafts += r.UnchangedDrafts;
      map.set(name, g);
    }
    const arr = [...map.values()].map((g) => {
      const draftReal = g.DraftWip > 0 ? g.DraftBill / g.DraftWip : 0;
      const actualReal = g.ActualWip > 0 ? g.ActualBill / g.ActualWip : 0;
      return {
        ...g,
        DraftReal: draftReal,
        ActualReal: actualReal,
        DeltaBill: g.ActualBill - g.DraftBill,
        DeltaReal: actualReal - draftReal,
      };
    });
    arr.sort((a, b) => Math.abs(b.DeltaBill) - Math.abs(a.DeltaBill));
    return arr;
  }, [groupKey, draftRows, draftsByClient, actualsByClient, filteredClients, accessor]);

  const nameOptions = useMemo(() => {
    const set = new Set(grouped.map((g) => g.Name).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [grouped]);

  const groupedFiltered = useMemo(() => {
    if (!nameFilter) return grouped;
    return grouped.filter((g) => g.Name === nameFilter);
  }, [grouped, nameFilter]);

  /* KPIs for the period (ratio-of-sums, like Billed tab) */
const kpis = useMemo(() => {
  let draftBill = 0,
    draftWip = 0,
    actualBill = 0,
    actualWip = 0,
    narrCount = 0,
    impacted = 0, 
    unchangedDrafts = 0;

  for (const r of filteredClients) {
    draftBill += r.DraftBill;
    draftWip += r.DraftWip;
    actualBill += r.ActualBill;
    actualWip += r.ActualWip;
    unchangedDrafts += (r.UnchangedDrafts || 0);

    if (r.NarrativeChanges) narrCount += 1;
    if (r.DeltaBill !== 0 || r.NarrativeChanges > 0) impacted += 1;
  }

  const draftReal = draftWip > 0 ? draftBill / draftWip : 0;
  const actualReal = actualWip > 0 ? actualBill / actualWip : 0;

  return {
    draftBill,
    actualBill,
    deltaBill: actualBill - draftBill,
    draftReal,
    actualReal,
    deltaReal: actualReal - draftReal,
    narrCount,
    impacted,
    unchangedDrafts,
  };
}, [filteredClients]);


  /* -------- copy payloads (FILTERED by current group+name) -------- */
  // Build a Set of client keys that belong to the current selection (e.g., current Partner).
    const currentClientKeySet = useMemo(() => {
    if (!period || !nameFilter) return new Set(); // require a specific name
    const set = new Set();
    for (const r of filteredClients) {
      const name =
        groupKey === "Office"
          ? r.Office || "Unassigned"
          : groupKey === "Manager"
          ? r.Manager || "Unassigned"
          : groupKey === "Service"
          ? r.Service || "Unassigned"
          : r.Partner || "Unassigned";

      if (name === nameFilter) set.add(r.ClientId);
    }
    return set;
  }, [period, nameFilter, groupKey, filteredClients]);


  const copyFilteredPayloads = useMemo(() => {
    if (!period || !nameFilter) {
      return { draftsRaw: [], actualsMatched: [], comparedClients: [] };
    }

    // Draft array objects (period-filtered) whose client is in the selected group
    const draftsRaw = draftRows.filter((r) => {
      const clientId =
        r?.BILLINGCLIENT ?? r?.CONTINDEX ?? r?.CLIENTCODE ?? r?.BILLINGCLIENTCODE ?? "";
      const key = String(clientId).trim().toLowerCase();
      if (!currentClientKeySet.has(key)) return false;

      // Double-check group membership using row attributes (robustness)
      const name =
        groupKey === "Office"
          ? pick(r, ["CLIENTOFFICE", "BILLINGCLIENTOFFICE"])
          : groupKey === "Manager"
          ? pick(r, ["CLIENTMANAGERNAME"])
          : groupKey === "Service"
          ? pick(r, ["SERVINDEX"])
          : pick(r, ["CLIENTPARTNERNAME"]);
      return (name || "Unassigned") === nameFilter;
    });

    // Actual invoice objects for those same clients
    const actualsMatched = [];
    for (const key of currentClientKeySet) {
      const a = actualsByClient.get(key);
      if (a && Array.isArray(a._rawBucket)) actualsMatched.push(...a._rawBucket);
    }

    // Joined client rows for those clients (before grouping)
    const joined = filteredClients.filter((r) => currentClientKeySet.has(r.ClientId));

    return { draftsRaw, actualsMatched, comparedClients: joined };
    }, [period, nameFilter, groupKey, draftRows, actualsByClient, currentClientKeySet, filteredClients]);

  /* columns */
  const columns = useMemo(() => {
    if (groupKey === "Narrative") {
      return [
        {
          name: "Narrative",
          selector: (r) => r.Name,
          sortable: true,
          wrap: true,
          grow: 4,                // <<— let this column take most of the row width
          minWidth: "400px",
          style: {
            whiteSpace: "normal", // <<— allow true wrapping
            lineHeight: 1.25,
          },
        },
        {
          name: "Total Drafts",
          selector: (r) => r.TotalDrafts,
          sortable: true,
          right: true,
          grow: 0,
          width: "120px",         // <<— fixed/narrow
        },
        {
          name: "Unchanged Drafts",
          selector: (r) => r.UnchangedDrafts,
          sortable: true,
          right: true,
          grow: 0,
          width: "150px",
        },
        {
          name: "Amount Changes",
          selector: (r) => r.AmountChanges,
          sortable: true,
          right: true,
          grow: 0,
          width: "150px",
        },
        {
          name: "Verbiage Changes",
          selector: (r) => r.VerbiageChanges,
          sortable: true,
          right: true,
          grow: 0,
          width: "150px",
        },
        {
          name: "% Unchanged",
          selector: (r) => r.PctUnchanged,
          sortable: true,
          right: true,
          grow: 0,
          width: "130px",
          cell: (r) => <span className="num">{fmtPct(r.PctUnchanged)}</span>,
        },
      ];
    }
    return [
      { name: "Name", selector: (r) => r.Name, sortable: true, wrap: true },
      {
        name: "Draft Bill",
        selector: (r) => r.DraftBill,
        sortable: true,
        right: true,
        cell: (r) => <span className="num">{fmtCurrency(r.DraftBill)}</span>,
      },
      {
        name: "Actual Bill",
        selector: (r) => r.ActualBill,
        sortable: true,
        right: true,
        cell: (r) => <span className="num">{fmtCurrency(r.ActualBill)}</span>,
      },
      {
        name: "Δ Bill",
        selector: (r) => r.DeltaBill,
        sortable: true,
        right: true,
        cell: (r) => <span className="num">{fmtCurrency(r.DeltaBill)}</span>,
      },
      {
        name: "Draft Real%",
        selector: (r) => r.DraftReal,
        sortable: true,
        right: true,
        cell: (r) => <span className="num">{fmtPct(r.DraftReal)}</span>,
      },
      {
        name: "Actual Real%",
        selector: (r) => r.ActualReal,
        sortable: true,
        right: true,
        cell: (r) => <span className="num">{fmtPct(r.ActualReal)}</span>,
      },
      {
        name: "Δ Real%",
        selector: (r) => r.DeltaReal,
        sortable: true,
        right: true,
        cell: (r) => <span className="num">{fmtPct(r.DeltaReal)}</span>,
      },
      {
        name: "Narr Changes",
        selector: (r) => r.NarrativeChanges,
        sortable: true,
        right: true,
      },
      {
        name: "Clients",
        selector: (r) => r.Rows,
        sortable: true,
        right: true,
      },
      {
        name: "Unchanged Drafts",
        selector: (r) => r.UnchangedDrafts,
        sortable: true,
        right: true,
        },
    ];
  }, [groupKey]);

  const showEmpty = !period;

  /* ------ Copy buttons handlers (require a selected Name) ------ */
  const doCopy = async (what) => {
    if (!nameFilter) {
      setToast("Pick a name to copy data");
      window.setTimeout(() => setToast(""), 1400);
      return;
    }

    let payload;
    if (what === "drafts") payload = copyFilteredPayloads.draftsRaw;
    else if (what === "actuals") payload = copyFilteredPayloads.actualsMatched;
    else if (what === "joined") payload = copyFilteredPayloads.comparedClients;
    else payload = {};

    await copyJson(payload, (ok) => {
      setToast(ok ? "Copied!" : "Copy failed");
      window.setTimeout(() => setToast(""), 1200);
    });
  };

    return (
      <>
        {loadingCombined && <Loader />}

        {/* controls */}
        <div className="select-bar recap-controls" style={{ gap: "8px", alignItems: "center" }}>
        <select
          className="pill-select recap-period"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            setNameFilter("");
          }}
          title="Billing period (Bill Through)"
        >
          <option value="">Bill Through…</option>
          {periodOptions.map((p) => (
            <option key={p} value={p}>
              {formatYmd(p)}
            </option>
          ))}
        </select>

        <select
          className="pill-select recap-groupby"
          value={groupKey}
          onChange={(e) => {
            setGroupKey(e.target.value);
            setNameFilter("");
          }}
          title="Group By"
          disabled={!period}
        >
          <option value="Partner">Partner</option>
          <option value="Office">Office</option>
          <option value="Manager">Manager</option>
          <option value="Service">Service</option>
          <option value="Narrative">Narrative</option>
        </select>

        {/* Hide the name filter when in Narrative mode */}
        {period && groupKey !== "Narrative" && (
        <select
            className="pill-select recap-namefilter"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            title="Filter by Name"
            disabled={!nameOptions.length}
        >
            <option value="">
            All{" "}
            {groupKey === "Office"
                ? "Offices"
                : groupKey === "Manager"
                ? "Managers"
                : groupKey === "Service"
                ? "Services"
                : "Partners"}
            </option>
            {nameOptions.map((nm) => (
            <option key={nm} value={nm}>
                {nm}
            </option>
            ))}
        </select>
        )}


        {nameFilter && (
          <button
            type="button"
            className="pill-btn clear-filter-btn"
            onClick={() => setNameFilter("")}
            title="Clear Name filter"
            aria-label="Clear Name filter"
          >
            Clear Filter
          </button>
        )}
      </div>

      {/* KPIs */}
      {period && (
        <section className="kpi-row" aria-label="Key Performance Indicators">
            {/* BILL: Draft -> Actual -> Δ */}
            <RotatingKpi
            title="Bill"
            items={[
                { label: "Draft",  value: kpis.draftBill },
                { label: "Actual", value: kpis.actualBill },
                { label: "Δ",      value: kpis.deltaBill },
            ]}
            format={fmtCurrency0}
            intervalMs={4000}
            />

            {/* REALIZATION %: Draft -> Actual -> Δ */}
            <RotatingKpi
            title="Realization %"
            items={[
                { label: "Draft",  value: kpis.draftReal },
                { label: "Actual", value: kpis.actualReal },
                { label: "Δ",      value: kpis.deltaReal },
            ]}
            format={fmtPct}
            intervalMs={4000}
            />

            {/* unchanged tiles */}
            <div className="kpi-card">
            <div className="kpi-title">Narrative Changes</div>
            <div className="kpi-value">{kpis.narrCount.toLocaleString()}</div>
            </div>
            <div className="kpi-card">
                <div className="kpi-title">Drafts Unchanged</div>
                <div className="kpi-value">{(kpis.unchangedDrafts || 0).toLocaleString()}</div>
            </div>
        </section>
        )}

        {period && (
        <div className="nb-inline-option" style={{ marginTop: "8px" }}>
          <label className="checkbox-pill">
            <input
              type="checkbox"
              checked={onlyApiDrafts}
              onChange={(e) => setOnlyApiDrafts(e.target.checked)}
            />
            <span>Check to see only invoices originally drafted by the API</span>
          </label>
        </div>
      )}


      {/* table or empty */}
      {!period ? (
        <div className="instructions-card">
          <h2>Select a billing period to compare automation vs. actuals</h2>
          <p>
            This view summarizes <strong>Δ Bill</strong>, <strong>Δ Realization%</strong>, and{" "}
            <strong>Narrative Changes</strong> by Partner/Office/Manager/Service. Use the copy
            buttons after picking a Name to copy just the raw rows for that selection.
          </p>
        </div>
      ) : (
        <div className="table-section">
          <GeneralDataTable
            columns={columns}
            data={groupedFiltered}
            customStyles={tableStyles}   // <<— add this
            dense                        // <<— optional: tighter row height
            noDataComponent={<span className="no-rows">No rows to show!</span>}
          />
        </div>
      )}
    </>
  );
}