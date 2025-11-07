import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import Loader from "../components/Loader";
import {
  listBilledPeriods,
  getBillingAiInsights,
} from "../services/AutomatedBillingBilledService";

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

  // fallback – unknown format, ignore later
  return "";
};

// Small helpers reused from other tabs
const formatYmd = (ymd) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return String(ymd || "");
  const [y, m, d] = String(ymd).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};

export default function AutomatedBillingRecapInsights() {
  const [periods, setPeriods] = useState([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  const [selectedDate, setSelectedDate] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [error, setError] = useState("");

  
    // inside AutomatedBillingRecapInsights()
    const handlePrint = () => {
    if (!selectedDate) return;

    const prettyDate = formatYmd(selectedDate);
    const originalTitle = document.title;

    // Suggest PDF filename like "Billing Period 9/15/2025 - AI Insights.pdf"
    document.title = `Billing Period ${prettyDate} - AI Insights`;

    window.print();

    // Restore original page title after print dialog closes
    setTimeout(() => {
        document.title = originalTitle;
    }, 1000);
    };

  // load list of bill-through dates (same as Draft Changes / Date)
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

  // Canonical bill-through dates, excluding the most recent file
    const canonicalDates = useMemo(() => {
    if (!periods?.length) return [];

    const ymds = periods
        .map((p) => toCanonicalYmd(p.ymd ?? p.YMD ?? p.date))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

    if (!ymds.length) return [];

    // newest date = max lexicographically
    const maxYmd = ymds.reduce(
        (max, cur) => (max && max > cur ? max : cur),
        ""
    );

    // drop the latest date (e.g. 2025-10-31)
    const unique = Array.from(new Set(ymds.filter((d) => d !== maxYmd)));

    // sort newest first
    unique.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

    return unique;
    }, [periods]);

    // options for the <select>
    const dateOptions = useMemo(
    () =>
        canonicalDates.map((d) => ({
        value: d,
        label: formatYmd(d),
        })),
    [canonicalDates]
    );



  // fetch AI insight markdown whenever selectedDate changes
  useEffect(() => {
    let cancelled = false;

    if (!selectedDate) {
      setMarkdown("");
      setError("");
      return;
    }

    (async () => {
      setLoadingInsight(true);
      setError("");
      try {
        const md = await getBillingAiInsights(selectedDate);
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
  }, [selectedDate]);

  const hasInsight = !!markdown && !loadingInsight && !error;

  return (
    <div className="aiinsights-root">
      {(loadingPeriods || loadingInsight) && <Loader />}

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

      <div
        className="select-bar recap-controls aiinsights-controls"
        style={{ gap: "8px", alignItems: "center" }}
      >
        <select
          className="pill-select recap-period"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          disabled={loadingPeriods || !dateOptions.length}
          title="Billing period (Bill Through date)"
        >
          <option value="">Select Bill Through date…</option>
          {dateOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {selectedDate && (
        <>
        <button
            type="button"
            className="pill-btn aiinsights-refresh-btn"
            onClick={() => {
            // append &refresh=1 to force backend to recalc
            setLoadingInsight(true);
            setError("");
            fetch(
                `/api/autoBillingInsights?date=${encodeURIComponent(
                selectedDate
                )}&refresh=1`
            )
                .then((r) => {
                if (!r.ok) {
                    throw new Error(`refresh failed: ${r.status}`);
                }
                return r.text();
                })
                .then((md) => {
                setMarkdown(md || "");
                })
                .catch((e) => {
                console.error("[AI Insights] refresh failed", e);
                setError(
                    "Unable to refresh insights right now. Using last cached result."
                );
                })
                .finally(() => setLoadingInsight(false));
            }}
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

      {!selectedDate && (
        <div className="instructions-card aiinsights-empty">
          <h3>Select a billing period to generate AI insights</h3>
          <p>
            Pick a <strong>Bill Through</strong> date to see a narrative report
            of where automation is performing well and where additional
            standardization or coaching could move you closer to the{" "}
            <strong>80/20</strong> goal.
          </p>
          <ul>
            <li>
              The analysis compares <em>draft</em> vs. <em>final</em> invoices.
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

      {selectedDate && (
        <section className="aiinsights-card">
          <header className="aiinsights-card-header">
            <div className="aiinsights-chip">
              <span className="chip-label">Bill Through</span>
              <span className="chip-value">{formatYmd(selectedDate)}</span>
            </div>
            <div className="aiinsights-chip goal">
              <span className="chip-label">Automation goal</span>
              <span className="chip-value">80% auto-accepted / 20% exceptions</span>
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
