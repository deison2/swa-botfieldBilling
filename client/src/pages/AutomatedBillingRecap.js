import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import GeneralDataTable from "../components/DataTable";
import "./AutomatedBillingRecap.css";
import AutomatedBillingRecapComparison from "./AutomatedBillingRecapComparison";
import AutomatedBillingRecapMetrics from "./AutomatedBillingRecapMetrics";


// DEV: local sample data (billed / not billed)
import sampleRecapBilled from "../devSampleData/sampleRecapBilled.json";
import { listBilledPeriods, getBilledData } from "../services/AutomatedBillingBilledService";

import sampleRecapNotBilled from "../devSampleData/sampleRecapNotBilled.json";
import { listExcludedPeriods, getExcludedData } from "../services/AutomatedBillingExcludedService";


// NEW: drafts service + fallback sample (same as ExistingDrafts page)
import { GetDrafts } from "../services/ExistingDraftsService";
import sampleDrafts from "../devSampleData/sampleExistingDrafts.json";

/** ---------- helpers ---------- */

// Currency with cents (tables)
const fmtCurrency = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Currency no cents (KPI tiles only)
const fmtCurrency0 = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

// Percent with 1 decimal (e.g., 85.7%)
const fmtPct = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

// Format "YYYY-MM-DD" -> "M/D/YYYY" without timezone conversion
const formatYmd = (ymd) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return String(ymd || "");
  const [y, m, d] = String(ymd).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};

// Build exclusion reasons string from boolean flags
const buildExclusionReasons = (r) => {
  const reasons = [];
  if (r?.ED_CLIENT) reasons.push("Client excluded because existing draft already exists");
  if (r?.ETF_GCC_JOB) reasons.push("Client has ETF or GovCon services and was therefore excluded");
  if (r?.EXCLUDED_CLIENT) reasons.push("Client has been granted exclusion from automated billing");
  if (r?.RB_CLIENT) reasons.push("Client excluded because a bill has been sent in the last 30 days");
  return reasons.join("; ");
};

// safe picker for multiple possible fields
const pick = (row, keys, fallback = "Unassigned") => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
};

function ExclusionBarChart({ totals }) {
  // totals is an array of { key, label, value }
  const max = Math.max(1, ...totals.map((t) => t.value || 0));
  return (
    <div className="nb-viz-card" aria-label="WIP from Exclusions by Type">
      <div className="nb-viz-bars">
        {totals.map(({ key, label, value }) => {
          const pct = Math.max(0, Math.min(100, (value / max) * 100));
          return (
            <div key={key} className="nb-viz-row">
              <div className="nb-viz-label">{label}</div>
              <div className="nb-viz-bar">
                <div className="nb-viz-fill" style={{ width: `${pct}%` }} />
                <div className="nb-viz-value">{fmtCurrency(value)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Return an accessor for the current "Aggregate By" pick
const getGroupAccessor = (key) => {
  switch (key) {
    case "Office":
      return (r) => pick(r, ["CLIENTOFFICE", "BILLINGCLIENTOFFICE"]);
    case "Originator":
      return (r) => pick(r, ["CLIENTORIGINATORNAME", "ORIGINATORNAME", "JOBPARTNERNAME"]);
    case "Partner":
      return (r) => pick(r, ["CLIENTPARTNERNAME"]);
    case "Manager":
      return (r) => pick(r, ["CLIENTMANAGERNAME"]);
    default:
      return null;
  }
};


export default function AutomatedBillingRecap() {
  const [activeTab, setActiveTab] = useState("billed"); // 'billed' | 'notbilled'
  const [billedPeriods, setBilledPeriods] = useState([]); // [{ymd,label}, ...]
  const [excludedPeriods, setExcludedPeriods] = useState([]); // [{ymd,label}, ...]


  // selections (shared)
  const [billingPeriod, setBillingPeriod] = useState("");
  const [rows, setRows] = useState([]); // raw granular (current tab)
  const [loading, setLoading] = useState(false);

  // Billed-only
  const [groupKey, setGroupKey] = useState(""); // Office | Originator | Partner | Manager
  const [nameFilter, setNameFilter] = useState(""); // appears after both picks

  // Not Billed filters
  const [nbPartner, setNbPartner] = useState("");
  const [nbManager, setNbManager] = useState("");

  // NEW: exclude clients with existing drafts
  const [excludeDrafts, setExcludeDrafts] = useState(false);
  const [draftClientCodes, setDraftClientCodes] = useState(new Set());
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  /** ---------- load data (DEV uses local json) ---------- */
  useEffect(() => {
    let cancelled = false;
    if (activeTab !== "billed") return;
    (async () => {
      setLoading(true);
      try {
        const list = await listBilledPeriods();
        if (!cancelled) setBilledPeriods(Array.isArray(list) ? list : []);
      } catch (e) {
        console.warn("listBilledPeriods failed, leaving selector empty", e);
        if (!cancelled) setBilledPeriods([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab]);
  
  // Load billed data for the selected period (with fallback)
  useEffect(() => {
    let cancelled = false;
    if (activeTab !== "billed") return;
    if (!billingPeriod) { setRows([]); return; }
    (async () => {
      setLoading(true);
      try {
        const data = await getBilledData(billingPeriod);
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn("getBilledData failed, using sampleRecapBilled fallback", e);
        if (!cancelled) setRows(Array.isArray(sampleRecapBilled) ? sampleRecapBilled : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, billingPeriod]);
  
  // NOT BILLED: load available periods from blob names
  useEffect(() => {
    let cancelled = false;
    if (activeTab !== "notbilled") return;

    (async () => {
      setLoading(true);
      try {
        console.log("[UI] listExcludedPeriods: start");
        const list = await listExcludedPeriods();
        console.log("[UI] listExcludedPeriods: result", list);

        if (!cancelled) setExcludedPeriods(Array.isArray(list) ? list : []);

        // auto-pick newest if none chosen
        if (!cancelled && !billingPeriod && Array.isArray(list) && list.length) {
          console.log("[UI] auto-pick billingPeriod", list[0].ymd);
          setBillingPeriod(list[0].ymd);
        }
      } catch (e) {
        console.warn("[UI] listExcludedPeriods failed", e);
        if (!cancelled) setExcludedPeriods([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeTab]);


  // NOT BILLED: load rows for selected period
  useEffect(() => {
    let cancelled = false;
    if (activeTab !== "notbilled") return;
    if (!billingPeriod) { setRows([]); return; }

    console.log("[UI] getExcludedData start", { billingPeriod });
    (async () => {
      setLoading(true);
      try {
        const data = await getExcludedData(billingPeriod);
        console.log("[UI] getExcludedData ok", { rows: Array.isArray(data) ? data.length : -1 });
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn("[UI] getExcludedData failed; using local sampleRecapNotBilled fallback", e);
        if (!cancelled) setRows(Array.isArray(sampleRecapNotBilled) ? sampleRecapNotBilled : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeTab, billingPeriod]);

  // Reset dependent filters when upstream changes
  useEffect(() => {
    setNameFilter("");
    setNbPartner("");
    setNbManager("");
  }, [billingPeriod, groupKey, activeTab]);

  /** ---------- choices for Billing Period (from BEFOREDATE) ---------- */
  const periodOptions = useMemo(() => {
    if (activeTab === "billed") {
      return billedPeriods.map(p => p.ymd); // already sorted by API
    }
    if (activeTab === "notbilled") {
      return excludedPeriods.map(p => p.ymd); // already sorted by API
    }
    // draftchanges tab fallback (unchanged)
    const set = new Set((rows || []).map(r => r.BEFOREDATE ? String(r.BEFOREDATE).slice(0,10) : ""));
    const arr = [...set].filter(Boolean).sort((a,b)=> (a<b?1:a>b?-1:0));
    return arr;
  }, [activeTab, billedPeriods, excludedPeriods, rows]);


  /** ---------- filtered by selected billing period ---------- */
  const periodFiltered = useMemo(() => {
    if (activeTab === "billed") return rows || [];       // <- don't re-filter billed data
    if (!billingPeriod) return [];
    return (rows || []).filter(
      (r) => String(r.BEFOREDATE).slice(0, 10) === billingPeriod
    );
  }, [rows, billingPeriod, activeTab]);


  /** ---------- rows in-scope for KPIs on Billed tab ---------- */
    const billedKpiRows = useMemo(() => {
    // always start with the period filter
    let data = periodFiltered;

    // if a Name is chosen, narrow to that group value
    if (activeTab === "billed" && billingPeriod && groupKey && nameFilter) {
        const accessor = getGroupAccessor(groupKey);
        if (accessor) data = data.filter((r) => accessor(r) === nameFilter);
    }

    return data;
    }, [periodFiltered, activeTab, billingPeriod, groupKey, nameFilter]);

  /** ---------- Billed: KPIs (now responsive to filters) ---------- */
    const kpis = useMemo(() => {
    if (activeTab !== "billed")
        return { totalBilled: 0, totalWip: 0, uniqueClients: 0, realization: 0 };

    const data = billedKpiRows;

    // E: Total Billed
    const totalBilled = data.reduce((s, r) => s + Number(r?.BILLAMOUNT ?? 0), 0);

    // F: Total WIP (use WIPOUTSTANDING)
    const totalWip = data.reduce((s, r) => s + Number(r?.WIPOUTSTANDING ?? 0), 0);

    // unique clients
    const uniqueClients = new Set(
        data.map((r) => r.BILLINGCLIENT ?? r.CLIENTCODE ?? r.CONTINDEX)
    ).size;

    // G: Realization % = E / F
    const realization = totalWip > 0 ? totalBilled / totalWip : 0;

    return { totalBilled, totalWip, uniqueClients, realization };
    }, [billedKpiRows, activeTab]);


  /** ---------- Billed: Aggregation ---------- */
  const aggregated = useMemo(() => {
    if (activeTab !== "billed" || !billingPeriod || !groupKey) return [];

    const keyAccessors = {
      Office: (r) => pick(r, ["CLIENTOFFICE", "BILLINGCLIENTOFFICE"]),
      Originator: (r) => pick(r, ["CLIENTORIGINATORNAME", "ORIGINATORNAME", "JOBPARTNERNAME"]),
      Partner: (r) => pick(r, ["CLIENTPARTNERNAME"]),
      Manager: (r) => pick(r, ["CLIENTMANAGERNAME"]),
    };

    const accessor = keyAccessors[groupKey] || (() => "Unassigned");

    const map = new Map();
    for (const r of periodFiltered) {
      const name = accessor(r);
      const cur = map.get(name) || {
        Name: name,
        WIP: 0, // A
        Bill: 0, // B
      };

      // A: WIP from WIPOUTSTANDING
      cur.WIP += Number(r?.WIPOUTSTANDING ?? 0);

      // B: Bill
      cur.Bill += Number(r?.BILLAMOUNT ?? 0);

      map.set(name, cur);
    }

    // finalize C and D based on A and B
    const out = [...map.values()].map((x) => {
      const A = x.WIP;
      const B = x.Bill;
      const C = A - B; // C = A - B
      const D = A > 0 ? B / A : 0; // D = B / A
      return { ...x, WOff: C, Realization: D };
    });

    // sort by Bill desc
    out.sort((a, b) => b.Bill - a.Bill);
    return out;
  }, [periodFiltered, groupKey, billingPeriod, activeTab]);

  // Distinct Names for billed Name filter
  const nameOptions = useMemo(() => {
    if (activeTab !== "billed") return [];
    const set = new Set((aggregated || []).map((r) => r.Name).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [aggregated, activeTab]);

  const aggregatedFiltered = useMemo(() => {
    if (activeTab !== "billed") return [];
    if (!nameFilter) return aggregated;
    return (aggregated || []).filter((r) => r.Name === nameFilter);
  }, [aggregated, nameFilter, activeTab]);

  /** ---------- Not Billed: per-period rows, filters, KPIs, columns ---------- */
  const nbRows = useMemo(() => {
    if (activeTab !== "notbilled") return [];
    return rows || [];  // no BEFOREDATE re-filter
  }, [rows, activeTab]);


  // Fetch draft client codes when excludeDrafts is on (and when Bill Through changes)
  useEffect(() => {
    let cancelled = false;

    async function loadDraftClientCodes() {
      if (!excludeDrafts || !billingPeriod) {
        if (!cancelled) setDraftClientCodes(new Set());
        return;
      }
      setLoadingDrafts(true);
      try {
        let draftRows = [];
        try {
          draftRows = await GetDrafts(billingPeriod);
          if (!Array.isArray(draftRows)) draftRows = [];
        } catch (err) {
          console.warn("GetDrafts failed; using sampleExistingDrafts.json", err);
          draftRows = Array.isArray(sampleDrafts) ? sampleDrafts : [];
        }

        const codes = new Set();
        for (const r of draftRows) {
          const code =
            r?.CLIENTCODE ??
            r?.ClientCode ??
            r?.clientCode ??
            r?.code ??
            null;
          if (code) codes.add(String(code));
        }
        if (!cancelled) setDraftClientCodes(codes);
      } finally {
        if (!cancelled) setLoadingDrafts(false);
      }
    }

    loadDraftClientCodes();
    return () => {
      cancelled = true;
    };
  }, [excludeDrafts, billingPeriod]);

  const nbPartnerOptions = useMemo(() => {
    const set = new Set(nbRows.map((r) => r.CLIENTPARTNERNAME).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [nbRows]);

  const nbManagerOptions = useMemo(() => {
    const set = new Set(nbRows.map((r) => r.CLIENTMANAGERNAME).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [nbRows]);

  const nbFiltered = useMemo(() => {
    const draftSet = draftClientCodes;
    return nbRows.filter((r) => {
      const pOk = nbPartner ? r.CLIENTPARTNERNAME === nbPartner : true;
      const mOk = nbManager ? r.CLIENTMANAGERNAME === nbManager : true;
      const dOk = !excludeDrafts || !draftSet.has(String(r.CLIENTCODE));
      return pOk && mOk && dOk;
    });
  }, [nbRows, nbPartner, nbManager, excludeDrafts, draftClientCodes]);

  const nbKpis = useMemo(() => {
    const totalWip = nbFiltered.reduce((s, r) => s + Number(r?.WIPOUTSTANDING ?? 0), 0);
    const distinctClients = new Set(nbFiltered.map((r) => r.CLIENTCODE ?? r.CONTINDEX)).size;
    return { totalWip, distinctClients };
  }, [nbFiltered]);

  // Totals by exclusion type (priority: EXCLUDED_CLIENT > ETF_GCC_JOB > RB_CLIENT > ED_CLIENT)
  const nbExclusionTotals = useMemo(() => {
    const buckets = {
      excluded: { key: "excluded", label: "Excluded from Automation", value: 0 },
      etf: { key: "etf", label: "ETF or GovCon", value: 0 },
      recent: { key: "recent", label: "Recent Bill", value: 0 },
      draft: { key: "draft", label: "Draft Exists", value: 0 },
    };

    for (const r of nbFiltered) {
      const wip = Number(r?.WIPOUTSTANDING ?? 0);
      if (!wip) continue;

      // priority hierarchy (top → bottom)
      if (r?.EXCLUDED_CLIENT) buckets.excluded.value += wip;
      else if (r?.ETF_GCC_JOB) buckets.etf.value += wip;
      else if (r?.RB_CLIENT) buckets.recent.value += wip;
      else if (r?.ED_CLIENT) buckets.draft.value += wip;
    }

    return [buckets.excluded, buckets.etf, buckets.recent, buckets.draft];
  }, [nbFiltered]);

  // Public PE logo (your blob)
  const PE_LOGO_SRC =
    "https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/images/PElogo.svg";

  // Table columns for Not Billed (pills + widths)
  const nbColumns = useMemo(
    () => [
      {
        name: "Client Code",
        selector: (r) => r.CLIENTCODE,
        sortable: true,
        width: "130px",
        cell: (r) => <span className="pill code-pill">{r.CLIENTCODE}</span>,
      },
      {
        name: "Client Name",
        selector: (r) => r.CLIENTNAME,
        sortable: true,
        grow: 2,
        cell: (r) => (
          <span className="pill name-pill" title={r.CLIENTNAME}>
            <span className="pill-text">{r.CLIENTNAME}</span>
          </span>
        ),
      },
      {
        name: "Partner",
        selector: (r) => r.CLIENTPARTNERNAME || "Unassigned",
        sortable: true,
        width: "170px",
        wrap: false,
      },
      {
        name: "Manager",
        selector: (r) => r.CLIENTMANAGERNAME || "Unassigned",
        sortable: true,
        width: "170px",
        wrap: false,
      },
      {
        name: "WIP Outstanding",
        selector: (r) => Number(r?.WIPOUTSTANDING ?? 0),
        sortable: true,
        right: true,
        width: "140px",
        cell: (r) => (
          <span className="num">{fmtCurrency(Number(r?.WIPOUTSTANDING ?? 0))}</span>
        ),
      },
      {
        name: "Exclusion Reason(s)",
        selector: (r) => buildExclusionReasons(r),
        sortable: false,
        grow: 2, // slightly narrower
        wrap: true,
        cell: (r) => (
          <span className="reason-text">{buildExclusionReasons(r) || "—"}</span>
        ),
      },
      {
        name: "PE Link",
        selector: (r) => r.CLIENTCODE,
        sortable: false,
        width: "90px",
        right: true,
        ignoreRowClick: true,
        button: true,
        cell: (r) => {
          const code = r?.CLIENTCODE ?? "";
          const href = `https://bmss.pehosted.com/PE/Client/NewBill/${encodeURIComponent(
            code
          )}`;
          return (
            <a
              className="pe-link-btn"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${code} in Practice Engine`}
              aria-label={`Open ${code} in Practice Engine`}
            >
              <img className="pe-logo" src={PE_LOGO_SRC} alt="PE" />
            </a>
          );
        },
      },
    ],
    []
  );

  /** ---------- table columns (Billed) ---------- */
  const columns = useMemo(
    () => [
      { name: "Name", selector: (r) => r.Name, sortable: true, wrap: true },
      {
        name: "WIP",
        selector: (r) => r.WIP,
        sortable: true,
        right: true,
        cell: (r) => <span className="num">{fmtCurrency(r.WIP)}</span>,
      },
      {
        name: "Bill",
        selector: (r) => r.Bill,
        sortable: true,
        right: true,
        cell: (r) => <span className="num">{fmtCurrency(r.Bill)}</span>,
      },
      {
        name: "W/Off",
        selector: (r) => r.WOff,
        sortable: true,
        right: true,
        cell: (r) => <span className="num">{fmtCurrency(r.WOff)}</span>,
      },
      {
        name: "Real.%",
        selector: (r) => r.Realization,
        sortable: true,
        right: true,
        cell: (r) => <span className="num">{fmtPct(r.Realization)}</span>,
      },
    ],
    []
  );

  /** ---------- labels ---------- */
  const periodLabel = useMemo(() => {
    return billingPeriod ? formatYmd(billingPeriod) : "";
  }, [billingPeriod]);

  return (
    <div className="app-container">
      {loading && <div className="loader-overlay" aria-live="polite" />}

      <Sidebar />
      <TopBar />

      <main className="main-content recap">
        {/* ---- Tabs ---- */}
        <div className="tab-switch">
          <button
            type="button"
            className={`tab-btn ${activeTab === "billed" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("billed");
            }}
          >
            Billed
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === "notbilled" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("notbilled");
              // reset upstream selections
              setBillingPeriod("");
              setGroupKey("");
              setNameFilter("");
              setNbPartner("");
              setNbManager("");
            }}
          >
            Not Billed
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "draftchanges" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("draftchanges");
              // this tab is self-contained; no resets needed here
            }}
          >
            Draft Changes
          </button>
          <button
            className={`tab-btn ${activeTab === "Metrics" ? "active" : ""}`}
            onClick={() => setActiveTab("Metrics")}
          >
            Metrics
          </button>
        </div>

        {/* ====================== BILLED ====================== */}
        {activeTab === "billed" && (
          <>
            {/* Controls (Billed): Bill Through + Aggregate By + Name filter */}
            <div className="select-bar recap-controls">
              <select
                className="pill-select recap-period"
                value={billingPeriod}
                onChange={(e) => setBillingPeriod(e.target.value)}
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
                onChange={(e) => setGroupKey(e.target.value)}
                title="Aggregate By"
                disabled={!billingPeriod}
              >
                <option value="">Aggregate By…</option>
                <option value="Office">Office</option>
                <option value="Originator">Originator</option>
                <option value="Partner">Partner</option>
                <option value="Manager">Manager</option>
              </select>

              {billingPeriod && groupKey && (
                <>
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
                        : groupKey === "Originator"
                        ? "Originators"
                        : groupKey === "Partner"
                        ? "Partners"
                        : groupKey === "Manager"
                        ? "Managers"
                        : "Names"}
                    </option>
                    {nameOptions.map((nm) => (
                      <option key={nm} value={nm}>
                        {nm}
                      </option>
                    ))}
                  </select>

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
                </>
              )}
            </div>

            {/* KPIs (Billed) */}
            {billingPeriod && (
              <section className="kpi-row" aria-label="Key Performance Indicators">
                <div className="kpi-card">
                  <div className="kpi-title">Total Billed</div>
                  <div className="kpi-value">{fmtCurrency0(kpis.totalBilled)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-title">Total WIP</div>
                  <div className="kpi-value">{fmtCurrency0(kpis.totalWip)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-title">Unique Clients</div>
                  <div className="kpi-value">{kpis.uniqueClients.toLocaleString()}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-title">Realization %</div>
                  <div className="kpi-value">{fmtPct(kpis.realization)}</div>
                </div>
              </section>
            )}

            {/* Content (Billed) */}
            {!billingPeriod || !groupKey ? (
              <div className="instructions-card">
                <h2>Pick a billing period, then choose how to aggregate</h2>
                <p>
                  Use the <strong>Bill Through</strong> dropdown to select a period, then pick{" "}
                  <strong>Aggregate By</strong> (Office, Originator, Partner, or Manager). KPI
                  cards will populate and the table will summarize your billed data.
                </p>
              </div>
            ) : (
              <>
                <div className="context-bar">
                  <div className="chip">
                    <span className="chip-label">Bill Through:</span> {periodLabel}
                  </div>
                  <div className="chip">
                    <span className="chip-label">Aggregate By:</span> {groupKey}
                  </div>
                  {nameFilter && (
                    <div className="chip">
                      <span className="chip-label">Name:</span> {nameFilter}
                    </div>
                  )}
                </div>

                <div className="table-section">
                  <GeneralDataTable
                    columns={columns}
                    data={aggregatedFiltered}
                    progressPending={loading}
                    noDataComponent={<span className="no-rows">No rows to show!</span>}
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* ==================== NOT BILLED ==================== */}
        {activeTab === "notbilled" && (
          <>
            {/* ALWAYS SHOW CONTROLS ON TOP */}
            <div className="select-bar recap-controls">
              <select
                className="pill-select recap-period"
                value={billingPeriod}
                onChange={(e) => setBillingPeriod(e.target.value)}
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
                className="pill-select recap-namefilter"
                value={nbPartner}
                onChange={(e) => setNbPartner(e.target.value)}
                title="Filter by Partner"
                disabled={!billingPeriod || !nbPartnerOptions.length}
              >
                <option value="">All Partners</option>
                {nbPartnerOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <select
                className="pill-select recap-namefilter"
                value={nbManager}
                onChange={(e) => setNbManager(e.target.value)}
                title="Filter by Manager"
                disabled={!billingPeriod || !nbManagerOptions.length}
              >
                <option value="">All Managers</option>
                {nbManagerOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            {/* BELOW THE CONTROLS: INSTRUCTIONS or TWO-COLUMN LAYOUT */}
            {!billingPeriod ? (
              <div className="instructions-card">
                <h2>Pick a billing period to view clients with unbilled WIP</h2>
                <p>
                  Select a <strong>Bill Through</strong> date above. Optional filters for
                  <strong> Partner</strong> and <strong> Manager</strong> will appear once a
                  period is chosen.
                </p>
              </div>
            ) : (
              <>
                {/* fixed two-column: left stack | right viz */}
                <div className="nb-row">
                  {/* LEFT HALF: KPIs + chips (no controls here now) */}
                  <div className="nb-left">
                    <section className="kpi-row kpi-row--compact" aria-label="Key Performance Indicators">
                      <div className="kpi-card">
                        <div className="kpi-title">WIP</div>
                        <div className="kpi-value">{fmtCurrency0(nbKpis.totalWip)}</div>
                      </div>
                      <div className="kpi-card">
                        <div className="kpi-title">Distinct Clients</div>
                        <div className="kpi-value">
                          {nbKpis.distinctClients.toLocaleString()}
                        </div>
                      </div>
                    </section>
                    <div className="nb-inline-option">
                        <label className="checkbox-pill">
                            <input
                            type="checkbox"
                            checked={excludeDrafts}
                            onChange={(e) => setExcludeDrafts(e.target.checked)}
                            />
                            <span>Check here to exclude clients with existing drafts</span>
                        </label>
                        </div>

                    {/* chips row with single Clear Filters on the right */}
                    <div className="context-bar">
                      <div className="chip">
                        <span className="chip-label">Bill Through:</span>{" "}
                        {formatYmd(billingPeriod)}
                      </div>
                      {nbPartner && (
                        <div className="chip">
                          <span className="chip-label">Partner:</span> {nbPartner}
                        </div>
                      )}
                      {nbManager && (
                        <div className="chip">
                          <span className="chip-label">Manager:</span> {nbManager}
                        </div>
                      )}
                      <div className="spacer" />
                      {(nbPartner || nbManager) && (
                        <button
                          type="button"
                          className="pill-btn clear-filter-btn"
                          onClick={() => {
                            setNbPartner("");
                            setNbManager("");
                          }}
                          title="Clear Partner/Manager filters"
                          aria-label="Clear filters"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </div>

                  {/* RIGHT HALF: big viz */}
                  <ExclusionBarChart totals={nbExclusionTotals} />
                </div>

                {/* table */}
                <div className="table-section">
                  <GeneralDataTable
                    columns={nbColumns}
                    data={nbFiltered}
                    progressPending={loading}
                    noDataComponent={<span className="no-rows">No rows to show!</span>}
                  />
                </div>
              </>
            )}
          </>
        )}
      {/* ==================== DRAFT CHANGES (Comparison) ==================== */}
      {activeTab === "draftchanges" && (
        <AutomatedBillingRecapComparison />
      )}  
      {activeTab === "Metrics" && <AutomatedBillingRecapMetrics />}
      </main>
    </div>
  );
}