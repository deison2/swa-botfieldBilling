import { useMemo } from "react";

// dev sample data
import billingHours from "../devSampleData/billingHours.json";
import billData from "../devSampleData/billData.json";

/* ---------- helpers ---------- */

const fmtCurrency0 = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const fmtCurrency2 = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtPct = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(undefined, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toNumOrNull = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim().toUpperCase() === "NULL") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function monthName(m) {
  // m is 1–12
  return new Date(2000, m - 1, 1).toLocaleString(undefined, {
    month: "long",
  });
}

function parsePeriodKey(key) {
  // "2025-09" -> { year: 2025, month: 9 }
  const [y, m] = String(key).split("-");
  return { year: Number(y), month: Number(m) };
}

/**
 * Summarize one period (year+month) from the dev sample data.
 * Returns null if there is no data for that period at all.
 */
function summarizePeriod(year, month) {
  // ---- Time spent on billing (billingHours.json) --------------------------
  const hoursRows = (billingHours || []).filter(
    (r) => Number(r.year ?? r.Year) === year && Number(r.month ?? r.Month) === month
  );

  const prodRows = hoursRows.filter((r) => Number(r.isProduction) === 1);
  const adminRows = hoursRows.filter((r) => Number(r.isProduction) === 0);

  const prodHours = prodRows.reduce((sum, r) => sum + toNum(r.hours), 0);
  const adminHours = adminRows.reduce((sum, r) => sum + toNum(r.hours), 0);
  const totalHours = prodHours + adminHours;

  const prodPeopleCount = new Set(prodRows.map((r) => r.staffindex)).size;
  const avgProdHoursPerPerson =
    prodPeopleCount > 0 ? prodHours / prodPeopleCount : 0;

  // ---- Billing output (billData.json) -------------------------------------
  const billRows = (billData || []).filter(
    (r) => Number(r.Year ?? r.year) === year && Number(r.Month ?? r.month) === month
  );

  const totalBilled = billRows.reduce(
    (sum, r) => sum + toNum(r.BILLED ?? r.Billed),
    0
  );

  const totalBillHrs = billRows.reduce(
    (sum, r) => sum + toNum(r["BILL-HRS"] ?? r.BILL_HRS),
    0
  );

  // REAL can be "NULL" – only average rows that actually have a numeric value
  let realSum = 0;
  let realCount = 0;
  for (const r of billRows) {
    const rv = toNumOrNull(r.REAL);
    if (rv !== null) {
      realSum += rv;
      realCount += 1;
    }
  }
  const avgReal = realCount > 0 ? realSum / realCount : 0;

  const effectiveRate = totalBillHrs > 0 ? totalBilled / totalBillHrs : 0;

  if (!hoursRows.length && !billRows.length) {
    return null;
  }

  return {
    year,
    month,
    label: `${monthName(month)} ${year}`,

    // time-side
    prodHours,
    adminHours,
    totalHours,
    prodPeopleCount,
    avgProdHoursPerPerson,

    // billing-side
    totalBilled,
    totalBillHrs,
    avgReal,
    effectiveRate,
  };
}

/* simple KPI card */
function KpiCard({ title, current, prior, delta, format = (x) => x }) {
  const hasPrior = prior !== null && prior !== undefined;
  const hasDelta = delta !== null && delta !== undefined;
  const deltaPos = Number(delta) >= 0;

  return (
    <div className="kpi-card metrics-kpi">
      <div className="kpi-title">{title}</div>
      <div className="metrics-kpi-main">{format(current)}</div>

      {hasPrior && (
        <div className="metrics-kpi-sub">
          <span className="metrics-kpi-label">Last year:</span>{" "}
          <span>{format(prior)}</span>
        </div>
      )}

      {hasDelta && (
        <div
          className={
            "metrics-kpi-delta " + (deltaPos ? "delta-pos" : "delta-neg")
          }
        >
          {deltaPos ? "▲" : "▼"} {format(Math.abs(delta))}
        </div>
      )}
    </div>
  );
}

/* comparison row for “Effort vs Output” section */
function MetricComparisonRow({ label, prev, curr, format = (x) => x }) {
  const prevNum = Number(prev) || 0;
  const currNum = Number(curr) || 0;
  const delta = currNum - prevNum;
  const pct = prevNum ? delta / prevNum : 0;

  const isPos = delta >= 0;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";

  return (
    <div className="metrics-compare-row">
      <div className="metrics-compare-label">{label}</div>

      <div className="metrics-compare-values">
        <div className="metrics-compare-col">
          <div className="metrics-compare-col-label">Last year</div>
          <div className="metrics-compare-col-value">
            {format(prevNum)}
          </div>
        </div>
        <div className="metrics-compare-col">
          <div className="metrics-compare-col-label">This year</div>
          <div className="metrics-compare-col-value">
            {format(currNum)}
          </div>
        </div>
        <div className="metrics-compare-delta">
          <span
            className={
              "metrics-compare-delta-main " +
              (isPos ? "delta-pos" : delta < 0 ? "delta-neg" : "")
            }
          >
            {delta === 0 ? (
              "No change"
            ) : (
              <>
                {isPos ? "▲" : "▼"} {sign}
                {format(Math.abs(delta))}
              </>
            )}
          </span>
          {prevNum !== 0 && (
            <span className="metrics-compare-delta-pct">
              ({(pct * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- main ---------- */

export default function AutomatedBillingRecapMetrics() {
  // which two months to compare from billingHours.json
  const { currentKey, priorKey } = useMemo(() => {
    const set = new Set();

    (billingHours || []).forEach((r) => {
      const y = Number(r.year ?? r.Year);
      const m = Number(r.month ?? r.Month);
      if (y && m) set.add(`${y}-${String(m).padStart(2, "0")}`);
    });

    // ascending (oldest first)
    const keys = [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const currentKey = keys[keys.length - 1] || null;

    // prefer same month previous year; fall back to prev key
    let priorKey = null;
    if (currentKey && keys.length > 1) {
      const { year: cy, month: cm } = parsePeriodKey(currentKey);
      const exactPrev = `${cy - 1}-${String(cm).padStart(2, "0")}`;
      priorKey = keys.includes(exactPrev)
        ? exactPrev
        : keys[keys.length - 2];
    }

    return { currentKey, priorKey };
  }, []);

  const currentSummary = useMemo(() => {
    if (!currentKey) return null;
    const { year, month } = parsePeriodKey(currentKey);
    return summarizePeriod(year, month);
  }, [currentKey]);

  const priorSummary = useMemo(() => {
    if (!priorKey) return null;
    const { year, month } = parsePeriodKey(priorKey);
    return summarizePeriod(year, month);
  }, [priorKey]);

  if (!currentSummary) {
    return (
      <div className="instructions-card">
        <h2>Metrics</h2>
        <p>
          No metrics sample data found yet. Once{" "}
          <code>billingHours.json</code> and <code>billData.json</code> include
          at least one month, this tab will light up.
        </p>
      </div>
    );
  }

  const labelCurrent = currentSummary.label;
  const labelPrior = priorSummary?.label || "Last year";

  const deltas =
    priorSummary && currentSummary
      ? {
          avgProdHoursPerPerson:
            currentSummary.avgProdHoursPerPerson -
            priorSummary.avgProdHoursPerPerson,
          totalBilled: currentSummary.totalBilled - priorSummary.totalBilled,
          avgReal: currentSummary.avgReal - priorSummary.avgReal,
          effectiveRate:
            currentSummary.effectiveRate - priorSummary.effectiveRate,
        }
      : {};

  return (
    <div className="metrics-root">
      <header className="metrics-header">
        <h2>Automated Billing Metrics</h2>
        {priorSummary && (
          <p>
            Comparing <strong>{labelCurrent}</strong> to{" "}
            <strong>{labelPrior}</strong> to show the impact of automated
            billing on{" "}
            <strong>billing effort vs. billed revenue and realization.</strong>
          </p>
        )}
      </header>

      {/* KPI row */}
      {priorSummary && (
        <section
          className="kpi-row metrics-kpi-row"
          aria-label="Key Performance Indicators"
        >
          {/* 1. Average billing time per production staff */}
          <KpiCard
            title="Avg billing hours per production staff"
            current={currentSummary.avgProdHoursPerPerson}
            prior={priorSummary.avgProdHoursPerPerson}
            delta={deltas.avgProdHoursPerPerson}
            format={(x) => `${(isFinite(x) ? x : 0).toFixed(2)} hrs`}
          />

          {/* 2. Total billed */}
          <KpiCard
            title="Total billed"
            current={currentSummary.totalBilled}
            prior={priorSummary.totalBilled}
            delta={deltas.totalBilled}
            format={fmtCurrency0}
          />

          {/* 3. Realization */}
          <KpiCard
            title="Average realization"
            current={currentSummary.avgReal}
            prior={priorSummary.avgReal}
            delta={deltas.avgReal}
            format={fmtPct}
          />

          {/* 4. Effective rate */}
          <KpiCard
            title="Effective rate (per billed hr)"
            current={currentSummary.effectiveRate}
            prior={priorSummary.effectiveRate}
            delta={deltas.effectiveRate}
            format={fmtCurrency2}
          />
        </section>
      )}

      {/* Effort vs Output – comparison rows */}
      {priorSummary && (
        <section className="metrics-compare-section" aria-label="Effort vs Output">
          <h3>Effort vs. Output</h3>
          <p>
            Automated billing should <strong>reduce billing time per person</strong> while{" "}
            <strong>increasing billed revenue and effective rate.</strong>
          </p>

          <MetricComparisonRow
            label="Production billing hours per staff"
            prev={priorSummary.avgProdHoursPerPerson}
            curr={currentSummary.avgProdHoursPerPerson}
            format={(n) => `${(isFinite(n) ? n : 0).toFixed(2)} hrs`}
          />

          <MetricComparisonRow
            label="Total production billing hours"
            prev={priorSummary.prodHours}
            curr={currentSummary.prodHours}
            format={(n) => `${(isFinite(n) ? n : 0).toFixed(2)} hrs`}
          />

          <MetricComparisonRow
            label="Total billed"
            prev={priorSummary.totalBilled}
            curr={currentSummary.totalBilled}
            format={fmtCurrency0}
          />

          <MetricComparisonRow
            label="Effective rate ($ / billed hr)"
            prev={priorSummary.effectiveRate}
            curr={currentSummary.effectiveRate}
            format={fmtCurrency2}
          />
        </section>
      )}

      {/* If there's no prior period, just show the current snapshot */}
      {!priorSummary && (
        <section className="metrics-single">
          <h3>{labelCurrent}</h3>
          <ul>
            <li>
              Production billing hours:{" "}
              <strong>{currentSummary.prodHours.toFixed(2)}</strong>
            </li>
            <li>
              Production staff billing:{" "}
              <strong>{currentSummary.prodPeopleCount}</strong> people
            </li>
            <li>
              Avg billing hours per production staff:{" "}
              <strong>
                {currentSummary.avgProdHoursPerPerson.toFixed(2)} hrs
              </strong>
            </li>
            <li>
              Total billed:{" "}
              <strong>{fmtCurrency0(currentSummary.totalBilled)}</strong>
            </li>
            <li>
              Average realization:{" "}
              <strong>{fmtPct(currentSummary.avgReal)}</strong>
            </li>
            <li>
              Effective rate:{" "}
              <strong>{fmtCurrency2(currentSummary.effectiveRate)}</strong>
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}