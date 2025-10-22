import { useEffect, useMemo, useState } from "react";
import GeneralDataTable from "../components/DataTable";

// data
import draftRowsAll from "../devSampleData/sampleRecapBilled.json";     // automation proposal (job-grain; has BEFOREDATE)
import actualInvoicesAll from "../devSampleData/sampleActualBilled.json"; // actual invoices (client-grain; JOB_SUMMARY[] & NARRATIVE_SUMMARY[])

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

/* ---------- main ---------- */
export default function AutomatedBillingRecapComparison() {
  const [period, setPeriod] = useState("");
  const [groupKey, setGroupKey] = useState("Partner");
  const [nameFilter, setNameFilter] = useState("");
  const [toast, setToast] = useState(""); // tiny “Copied!” message

  /* periods from the draft file (same as your billed tab) */
  const periodOptions = useMemo(() => {
    const set = new Set(
      (draftRowsAll || []).map((r) =>
        r.BEFOREDATE ? String(r.BEFOREDATE).slice(0, 10) : ""
      )
    );
    const arr = [...set].filter(Boolean);
    arr.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    return arr;
  }, []);

  /* period-filtered drafts (the baseline for the view) */
  const draftRows = useMemo(() => {
    if (!period) return [];
    return (draftRowsAll || []).filter(
      (r) => String(r.BEFOREDATE).slice(0, 10) === period
    );
  }, [period]);

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

  /* A handy Set of client keys present in the drafts (so “actuals matched” mirrors our join) */
  const draftClientKeySet = useMemo(() => new Set(draftsByClient.keys()), [draftsByClient]);

  /* 2) Aggregate ACTUALS per client (sum JOB_SUMMARY WIP/BILL; concat narrative text).
        Restricted to clients present in drafts for this period. */
  const actualsByClient = useMemo(() => {
    const map = new Map();
    for (const inv of actualInvoicesAll || []) {
      const clientId = inv?.BILLINGCLIENT ?? inv?.CONTINDEX ?? "";
      if (clientId === "" || clientId === null || clientId === undefined) continue;
      const key = String(clientId).trim().toLowerCase();

      if (!draftClientKeySet.has(key)) continue;

      const cur =
        map.get(key) || {
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
  }, [draftClientKeySet]);

  /* 3) Build per-client comparison rows (before grouping) */
  const comparedClients = useMemo(() => {
    const out = [];
    for (const [key, d] of draftsByClient.entries()) {
      const a = actualsByClient.get(key);

      const DraftBill = d.DraftBill;
      const DraftWip = d.DraftWip;
      const DraftReal = d.DraftReal;

      const ActualBill = a?.ActualBill ?? 0;
      const ActualWip = a?.ActualWip ?? 0;
      const ActualReal = a?.ActualReal ?? 0;

      const DeltaBill = ActualBill - DraftBill;
      const DeltaReal = ActualReal - DraftReal;

      // keep your existing change signal as-is
        const NarrativeChanges =
        d.DraftNarr && (a?.ActualNarr ?? "") && d.DraftNarr !== a.ActualNarr ? 1 : 0;

        // NEW: client-level unchanged flag via line-item (narrative) totals
        const UnchangedDrafts = mapsEqualNum(d.DraftLineTotals, a?.ActualLineTotals) ? 1 : 0;

      out.push({
        ClientId: key,
        ClientCode: d.ClientCode,
        ClientName: d.ClientName,
        Office: d.Office,
        Partner: d.Partner,
        Manager: d.Manager,
        Service: d.Service,

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
      });
    }
    return out;
  }, [draftsByClient, actualsByClient]);

  /* 4) Grouped table data using ratio-of-sums (matches Billed tab) */
  const accessor = useMemo(() => groupAccessorOf(groupKey), [groupKey]);

  const grouped = useMemo(() => {
    const map = new Map();

    for (const r of comparedClients) {
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
  }, [comparedClients, accessor]);

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

  for (const r of comparedClients) {
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
    // what the rotating widgets read:
    draftBill,
    actualBill,
    deltaBill: actualBill - draftBill,

    draftReal,
    actualReal,
    deltaReal: actualReal - draftReal,

    // other tiles:
    narrCount,
    impacted,
    unchangedDrafts,
  };
}, [comparedClients]);


  /* -------- copy payloads (FILTERED by current group+name) -------- */
  // Build a Set of client keys that belong to the current selection (e.g., current Partner).
  const currentClientKeySet = useMemo(() => {
    if (!period || !nameFilter) return new Set(); // require a specific name
    const set = new Set();
    for (const r of comparedClients) {
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
  }, [period, nameFilter, groupKey, comparedClients]);

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
    const joined = comparedClients.filter((r) => currentClientKeySet.has(r.ClientId));

    return { draftsRaw, actualsMatched, comparedClients: joined };
  }, [period, nameFilter, groupKey, draftRows, actualsByClient, currentClientKeySet, comparedClients]);

  /* columns */
  const columns = useMemo(
    () => [
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
    ],
    []
  );

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
        </select>

        {period && (
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
            noDataComponent={<span className="no-rows">No rows to show!</span>}
          />
        </div>
      )}
    </>
  );
}