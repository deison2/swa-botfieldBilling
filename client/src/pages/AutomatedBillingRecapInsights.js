// src/pages/AutomatedBillingRecapInsights.js
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import Loader from "../components/Loader";
import {
  listBilledPeriods,
  getBillingAiInsights,
} from "../services/AutomatedBillingBilledService";

// --- helpers -----------------------------------------------------------

// Normalize whatever the backend gives us into strict "YYYY-MM-DD"
const toCanonicalYmd = (raw) => {
  if (!raw) return "";
  const s = String(raw).slice(0, 10).trim();

  // already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // handle MM/DD/YYYY or M/D/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
};

// 2025-09-15 -> 9/15/2025
const formatYmd = (ymd) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return String(ymd || "");
  const [y, m, d] = String(ymd).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const monthLabelFromKey = (key) => {
  // key = "YYYY-MM"
  const [y, m] = String(key).split("-");
  if (!y || !m) return key;
  const idx = Number(m) - 1;
  const monthName = MONTH_NAMES[idx] ?? key;
  return `${monthName} ${y}`;
};

// Nicely formatted label for the print filename / chip
const labelForPeriod = (mode, period) => {
  if (!period) return "";
  if (mode === "Date") return formatYmd(period);
  if (mode === "Month") return monthLabelFromKey(period);
  if (mode === "Year") return String(period);
  return String(period);
};

// ----------------------------------------------------------------------

export default function AutomatedBillingRecapInsights() {
  // Date / Month / Year, same as Comparison tab
  const [periodMode, setPeriodMode] = useState("Date"); // "Date" | "Month" | "Year"
  const [period, setPeriod] = useState(""); // "YYYY-MM-DD" | "YYYY-MM" | "YYYY"

  const [periods, setPeriods] = useState([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  const [markdown, setMarkdown] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [error, setError] = useState("");

  // load list of bill-through dates (same source as other tabs)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingPeriods(true);
      try {
        const list = await listBilledPeriods();
        if (!cancelled && Array.isArray(list)) {
          setPeriods(list);
        }
      } catch (e) {
        console.warn("[AI Insights] listBilledPeriods failed", e);
        if (!cancelled) {
          setPeriods([]);
          setError("Unable to load billing periods.");
        }
      } finally {
        if (!cancelled) setLoadingPeriods(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Canonical list of bill-through dates (YYYY-MM-DD), excluding the most recent
  const canonicalDates = useMemo(() => {
    if (!periods || !periods.length) return [];

    const ymds = periods
      .map((p) =>
        toCanonicalYmd(
          p.ymd ??
            p.YMD ??
            p.date ??
            p.BEFOREDATE ??
            p.beforeDate ??
            p.BillThrough
        )
      )
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

    if (!ymds.length) return [];

    const unique = Array.from(new Set(ymds));
    unique.sort((a, b) => b.localeCompare(a)); // newest first

    // drop the most recent date – same behavior as Comparison tab
    return unique.slice(1);
  }, [periods]);

  // --- Mode-specific dropdown options ---------------------------------

  // Date mode: one option per bill-through date
  const dateOptions = useMemo(
    () =>
      canonicalDates.map((ymd) => ({
        value: ymd,
        label: formatYmd(ymd),
      })),
    [canonicalDates]
  );

  // Month mode: unique YYYY-MM
  const monthOptions = useMemo(() => {
    const monthSet = new Set();
    for (const ymd of canonicalDates) {
      const [y, m] = ymd.split("-");
      if (!y || !m) continue;
      monthSet.add(`${y}-${m}`);
    }
    return Array.from(monthSet)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => ({
        value: key,
        label: monthLabelFromKey(key),
      }));
  }, [canonicalDates]);

  // Year mode: unique YYYY
  const yearOptions = useMemo(() => {
    const yearSet = new Set();
    for (const ymd of canonicalDates) {
      const y = ymd.slice(0, 4);
      if (y) yearSet.add(y);
    }
    return Array.from(yearSet)
      .sort((a, b) => b.localeCompare(a))
      .map((y) => ({ value: y, label: y }));
  }, [canonicalDates]);

  // Concrete dates for the current selection (same pattern as Comparison tab)
  const selectedDates = useMemo(() => {
    if (!period) return [];

    if (periodMode === "Date") {
      return [period]; // single YYYY-MM-DD
    }

    if (periodMode === "Month") {
      // period = "YYYY-MM"
      return canonicalDates.filter((ymd) => ymd.slice(0, 7) === period);
    }

    if (periodMode === "Year") {
      return canonicalDates.filter((ymd) => ymd.slice(0, 4) === period);
    }

    return [];
  }, [period, periodMode, canonicalDates]);

  const periodLabel = useMemo(
    () => labelForPeriod(periodMode, period),
    [periodMode, period]
  );

  const periodChipLabel =
    periodMode === "Date" ? "Bill Through" : "Billing period";

  // --- Fetch AI insight markdown whenever selection changes ------------

  useEffect(() => {
    let cancelled = false;

    if (!selectedDates.length) {
      setMarkdown("");
      setError("");
      return;
    }

    (async () => {
      setLoadingInsight(true);
      setError("");
      try {
        const md = await getBillingAiInsights(
          periodMode,
          period,
          selectedDates
        );
        if (!cancelled) {
          setMarkdown(md || "");
        }
      } catch (e) {
        console.error("[AI Insights] getBillingAiInsights failed", e);
        if (!cancelled) {
          setMarkdown("");
          setError(
            "Unable to generate AI insights for this billing period. Please try again or contact the admin."
          );
        }
      } finally {
        if (!cancelled) setLoadingInsight(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [periodMode, period, selectedDates]);

  const hasInsight = !!markdown && !loadingInsight && !error;

  // --- Actions ---------------------------------------------------------

  const handleRegenerate = async () => {
    if (!period || !selectedDates.length) return;
    setLoadingInsight(true);
    setError("");
    try {
      const md = await getBillingAiInsights(
        periodMode,
        period,
        selectedDates,
        { refresh: true }
      );
      setMarkdown(md || "");
    } catch (e) {
      console.error("[AI Insights] refresh failed", e);
      setError(
        "Unable to refresh insights right now. Using last cached result if available."
      );
    } finally {
      setLoadingInsight(false);
    }
  };

  const handlePrint = () => {
    if (!period || !selectedDates.length || !hasInsight) return;

    const pretty = periodLabel || "Selected Period";
    const originalTitle = document.title;

    // This drives the suggested PDF filename in the browser dialog
    document.title = `Billing Period ${pretty} - AI Insights`;

    window.print();

    // Restore original page title after print dialog closes
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const loadingCombined = loadingPeriods || loadingInsight;

  // --------------------------------------------------------------------

  return (
    <div className="aiinsights-root">
      {loadingCombined && <Loader />}

      <header className="aiinsights-header">
        <h2>AI Insights</h2>
        <p>
          This view uses{" "}
          <strong>OpenAI analysis of your draft vs. actual invoices</strong> to
          highlight where automation is working well, where humans are still
          doing too much work, and which narrative standards should be refined.
          The firm&apos;s goal is to reach{" "}
          <strong>80% invoices going out as drafted</strong> and only{" "}
          <strong>20% requiring human touchpoints.</strong>
        </p>
      </header>

      {/* Controls: mode + period + actions */}
      <div
        className="select-bar recap-controls aiinsights-controls"
        style={{ gap: "8px", alignItems: "center" }}
      >
        {/* Date / Month / Year toggle – same look as Comparison tab */}
        <div className="btn-group recap-period-mode">
          {["Date", "Month", "Year"].map((mode) => (
            <button
              key={mode}
              type="button"
              className={`pill-btn ${
                periodMode === mode ? "is-active" : ""
              }`}
              onClick={() => {
                setPeriodMode(mode);
                setPeriod("");
                setMarkdown("");
                setError("");
              }}
              title={`View by ${mode.toLowerCase()}`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Mode-aware period dropdown */}
        <select
          className="pill-select recap-period"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            setMarkdown("");
            setError("");
          }}
          disabled={loadingPeriods || !canonicalDates.length}
          title={
            periodMode === "Date"
              ? "Billing period (Bill Through date)"
              : periodMode === "Month"
              ? "Billing period (Month)"
              : "Billing period (Year)"
          }
        >
          <option value="">
            {periodMode === "Date"
              ? "Bill Through…"
              : periodMode === "Month"
              ? "Select month…"
              : "Select year…"}
          </option>

          {(periodMode === "Date"
            ? dateOptions
            : periodMode === "Month"
            ? monthOptions
            : yearOptions
          ).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {period && (
          <>
            <button
              type="button"
              className="pill-btn aiinsights-refresh-btn"
              onClick={handleRegenerate}
            >
              Regenerate insights
            </button>

            {hasInsight && (
              <button
                type="button"
                className="pill-btn aiinsights-print-btn"
                title="Print this summary to PDF"
                onClick={handlePrint}
              >
                Print summary (PDF)
              </button>
            )}
          </>
        )}
      </div>

      {!period && (
        <div className="instructions-card aiinsights-empty">
          <h3>Select a billing period to generate AI insights</h3>
          <p>
            Choose a{" "}
            <strong>
              Bill Through date, month, or year depending on the view
            </strong>{" "}
            to see a narrative report of where automation is performing well and
            where additional standardization or coaching could move you closer
            to the <strong>80/20</strong> goal.
          </p>
          <ul>
            <li>
              The analysis compares <em>draft</em> vs. <em>final</em> invoices
              for the selected period.
            </li>
            <li>
              It calls out partners, offices, and services that are editing most
              heavily.
            </li>
            <li>
              It recommends specific updates to standard narratives and process.
            </li>
          </ul>
        </div>
      )}

      {period && (
        <section className="aiinsights-card">
          <header className="aiinsights-card-header">
            <div className="aiinsights-chip">
              <span className="chip-label">{periodChipLabel}</span>
              <span className="chip-value">
                {periodLabel || "(no label)"}
              </span>
            </div>
            <div className="aiinsights-chip goal">
              <span className="chip-label">Automation goal</span>
              <span className="chip-value">
                80% auto-accepted / 20% exceptions
              </span>
            </div>
          </header>

          {error && (
            <div className="aiinsights-error">
              <p>{error}</p>
            </div>
          )}

          {!error && !hasInsight && !loadingInsight && (
            <div className="aiinsights-placeholder">
              <p>
                Generating insights for this period may take a moment the first
                time. Once generated, the summary is cached for future viewing.
              </p>
            </div>
          )}

          {hasInsight && (
            <article className="aiinsights-body prose">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </article>
          )}
        </section>
      )}
    </div>
  );
}