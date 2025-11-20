import React, { useState, useEffect, useMemo } from "react";
import { PopoverPortal } from "./ExistingDrafts";
import "./ExistingDrafts.css";

const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n ?? 0);

// Strip HTML to plain text for editing
const stripHtml = (html) => {
  if (!html) return "";
  return String(html)
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
};

// Escape when wrapping back into HTML
const escapeHtml = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Wrap plain text into standard PE narrative HTML
const wrapNarrativeHtml = (text) => {
  const t = (text || "").trim();
  if (!t) return "";
  return `<p><font style="font-family: Arial, Helvetica, sans-serif; font-size: 10pt;">${escapeHtml(
    t
  )}</font></p>`;
};

// Helpers for money parsing / formatting
const parseMoneyInput = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const formatMoneyInput = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const num =
    typeof value === "number" ? value : parseMoneyInput(String(value));
  return currency(num);
};

export default function ExistingDraftsEditTray({
  open,
  onClose,
  draftIdx,
  clientName,
  clientCode,
  analysisItems,
  narrativeItems,
  currentUser,
  billThroughDate,
  onSave,
}) {
  // ---------- local editable state ----------
  const [analysisRows, setAnalysisRows] = useState([]);
  const [narrRows, setNarrRows] = useState([]);

  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [billingNotes, setBillingNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ---------- sync props -> local state whenever we get fresh data ----------
  useEffect(() => {
    if (!open) return;
    const rows = (analysisItems ?? []).map((r) => {
      const base =
        r.BillInClientCur ?? r.BillAmount ?? r.BalInClientCur ?? 0;
      return {
        ...r,
        BillInClientCur: Number(base) || 0,
        _draftAmtDisplay: formatMoneyInput(base),
      };
    });
    setAnalysisRows(rows);
  }, [analysisItems, open]);

  useEffect(() => {
    if (!open) return;
    const rows = (narrativeItems ?? []).map((r) => {
      const amt = r.Amount ?? 0;
      return {
        ...r,
        // edit narrative as plain text
        FeeNarrative: stripHtml(r.FeeNarrative || ""),
        Amount: Number(amt) || 0,
        _amountDisplay: formatMoneyInput(amt),
        _deleted: false,
        _isNew: false,
      };
    });
    setNarrRows(rows);
  }, [narrativeItems, open]);

  // ---------- service options from analysis table ----------
  const serviceOptions = useMemo(
    () => {
      const set = new Set();

      (analysisRows || []).forEach((r) => {
        if (r.WipService) {
          set.add(r.WipService);
        }
      });

      (narrRows || []).forEach((r) => {
        if (r.ServIndex && !set.has(r.ServIndex)) {
          set.add(r.ServIndex);
        }
      });

      return Array.from(set).sort();
    },
    [analysisRows, narrRows]
  );

  // ---------- derived totals ----------
  const analysisTotal = useMemo(
    () =>
      analysisRows.reduce(
        (sum, r) =>
          sum +
          Number(
            r.BillInClientCur ?? r.BalInClientCur ?? r.BillAmount ?? 0
          ),
        0
      ),
    [analysisRows]
  );

  const narrativeTotal = useMemo(
    () =>
      narrRows.reduce(
        (sum, r) => (r._deleted ? sum : sum + Number(r.Amount ?? 0)),
        0
      ),
    [narrRows]
  );

  // ---------- early return AFTER all hooks ----------
  if (!open) return null;

  const totalsMatch =
    Math.round(analysisTotal) === Math.round(narrativeTotal);

  // --- generic handlers for non-money fields ------------------------------------------------
  const updateAnalysis = (idx, field, value) => {
    setAnalysisRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  };

  const updateNarr = (idx, field, value) => {
    setNarrRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  };

    const addNarrRow = () => {
    const lineOrder =
      narrRows.reduce(
        (max, r) => Math.max(max, Number(r.LineOrder ?? 0)),
        0
      ) + 1;

    const defaultService = serviceOptions[0] || "";

    setNarrRows((rows) => [
      ...rows,
      {
        DebtNarrIndex: 0,
        DraftFeeIdx: draftIdx,
        LineOrder: lineOrder,
        WIPType: "TIME",
        ServIndex: defaultService,            // <-- prefill service
        Units: 0,
        Amount: 0,
        VATRate: "0",
        VATPercent: 0,
        VATAmount: 0,
        FeeNarrative: "",
        _amountDisplay: "",
        _isNew: true,
        _deleted: false,
      },
    ]);
  };


  const deleteNarrRow = (idx) => {
    setNarrRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, _deleted: true } : r))
    );
  };

  const handleSave = async () => {
    setError("");
    if (!reason) {
      setError("Please choose a reason for the change.");
      return;
    }
    if (reason === "Other" && !otherReason.trim()) {
      setError("Please describe the reason when selecting Other.");
      return;
    }

    const reasonText =
      reason === "Other" ? `Other – ${otherReason.trim()}` : reason;

    const nowIso = new Date().toISOString();

    // Wrap narratives back into standard HTML before sending up
    const narrativeRowsForSave = narrRows.map((r) => ({
      ...r,
      FeeNarrative: wrapNarrativeHtml(r.FeeNarrative),
    }));

    const payload = {
        draftIdx,
        clientCode,                 // <-- NEW
        clientName,                 // <-- NEW
        billThroughDate,            // <-- NEW
        user: currentUser,
        when: nowIso,
        reason: reasonText,
        billingNotes: billingNotes.trim() || null,
        analysisRows,
        narrativeRows: narrativeRowsForSave,
        _original: {
            analysisItems,
            narrativeItems,
        },
        };


    try {
      setSaving(true);
      await onSave(payload);
      onClose(true); // true = saved
    } catch (err) {
      console.error(err);
      setError("Sorry, something went wrong saving your changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PopoverPortal open={open}>
      <div
        className="edtray-backdrop"
        onClick={() => !saving && onClose(false)}
      >
        <section
          className="edtray"
          onClick={(e) => e.stopPropagation()}
          aria-label="Edit Draft"
        >
          <header className="edtray__head">
            <div>
              <div className="edtray__title">Edit Draft</div>
              <div className="edtray__meta">
                {clientCode} &mdash; {clientName} &middot; Draft #{draftIdx}
              </div>
            </div>
            <div className="edtray__totals">
              <div className="edtray__total-row">
                <span>Draft Amt (Jobs)</span>
                <strong>{currency(analysisTotal)}</strong>
              </div>
              <div className="edtray__total-row">
                <span>Narrative Total</span>
                <strong>{currency(narrativeTotal)}</strong>
              </div>
              <div
                className={`edtray__total-pill ${
                  totalsMatch ? "ok" : "warn"
                }`}
              >
                {totalsMatch
                  ? "Totals match invoice"
                  : "Totals do not match"}
              </div>
            </div>
          </header>

          <div className="edtray__body">
            {/* -------- left: analysis table -------- */}
            <div className="edtray__col edtray__col--analysis">
              <div className="edtray__subhead">Draft WIP Analysis</div>
              <div className="edtray__table-wrap">
                <table className="mini-table mini-table--tight">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Job</th>
                      <th>Type</th>
                      <th className="num">Draft Amt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisRows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.WipService}</td>
                        <td>{r.JobTitle}</td>
                        <td>{r.WipType}</td>
                        <td className="num">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="ed-input ed-input--num"
                            value={r._draftAmtDisplay ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAnalysisRows((rows) =>
                                rows.map((row, idx) =>
                                  idx === i
                                    ? {
                                        ...row,
                                        _draftAmtDisplay: val,
                                        BillInClientCur:
                                          parseMoneyInput(val),
                                      }
                                    : row
                                )
                              );
                            }}
                            onBlur={() => {
                              setAnalysisRows((rows) =>
                                rows.map((row, idx) => {
                                  if (idx !== i) return row;
                                  const num = parseMoneyInput(
                                    row._draftAmtDisplay
                                  );
                                  return {
                                    ...row,
                                    BillInClientCur: num,
                                    _draftAmtDisplay: formatMoneyInput(
                                      num
                                    ),
                                  };
                                })
                              );
                            }}
                            onFocus={(e) => e.target.select()}
                          />
                        </td>
                      </tr>
                    ))}
                    {analysisRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          No analysis rows returned from Practice Engine.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* -------- right: narrative table -------- */}
            <div className="edtray__col edtray__col--narr">
              <div className="edtray__subhead-row">
                <div className="edtray__subhead">Narrative Lines</div>
                <button
                  type="button"
                  className="edtray__add-btn"
                  onClick={addNarrRow}
                >
                  + Add Line
                </button>
              </div>

              <div className="edtray__table-wrap">
                <table className="mini-table mini-table--tight">
                  <thead>
                    <tr>
                      <th>Narrative Text</th>
                      <th>Service</th>
                      <th className="num">Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {narrRows.map((r, i) =>
                      r._deleted ? null : (
                        <tr key={i}>
                          <td>
                            <textarea
                              className="ed-input ed-input--textarea"
                              value={r.FeeNarrative || ""}
                              onChange={(e) =>
                                updateNarr(
                                  i,
                                  "FeeNarrative",
                                  e.target.value
                                )
                              }
                              rows={2}
                            />
                          </td>
                          <td>
                            {r._isNew ? (
                                // NEW rows: editable picklist
                                <select
                                className="ed-input ed-input--svc"
                                value={r.ServIndex || ""}
                                onChange={(e) =>
                                    updateNarr(i, "ServIndex", e.target.value)
                                }
                                >
                                <option value="">Select service...</option>
                                {serviceOptions.map((svc) => (
                                    <option key={svc} value={svc}>
                                    {svc}
                                    </option>
                                ))}
                                </select>
                            ) : (
                                // EXISTING rows: read-only, same as before
                                <input
                                type="text"
                                className="ed-input ed-input--svc"
                                value={r.ServIndex || ""}
                                readOnly
                                disabled
                                />
                            )}
                            </td>
                          <td className="num">
                            <input
                              type="text"
                              inputMode="decimal"
                              className="ed-input ed-input--num"
                              value={r._amountDisplay ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setNarrRows((rows) =>
                                  rows.map((row, idx) =>
                                    idx === i
                                      ? {
                                          ...row,
                                          _amountDisplay: val,
                                          Amount: parseMoneyInput(val),
                                        }
                                      : row
                                  )
                                );
                              }}
                              onBlur={() => {
                                setNarrRows((rows) =>
                                  rows.map((row, idx) => {
                                    if (idx !== i) return row;
                                    const num = parseMoneyInput(
                                      row._amountDisplay
                                    );
                                    return {
                                      ...row,
                                      Amount: num,
                                      _amountDisplay: formatMoneyInput(
                                        num
                                      ),
                                    };
                                  })
                                );
                              }}
                              onFocus={(e) => e.target.select()}
                            />
                          </td>
                          <td className="num">
                            <button
                              type="button"
                              className="edtray__delete-btn"
                              onClick={() => deleteNarrRow(i)}
                              title="Delete line"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                    {narrRows.filter((r) => !r._deleted).length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          No narrative lines. Use “Add Line” to start a
                          new invoice body.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <footer className="edtray__foot">
            <div className="edtray__reason-block">
              <label className="ed-label">
                Reason for change<span className="req">*</span>
              </label>
              <select
                className="ed-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Select reason…</option>
                <option value="Client preferences">
                  Client preferences
                </option>
                <option value="Incorrect Calculation">
                  Incorrect Calculation
                </option>
                <option value="Partner/Manager Preference">
                  Partner/Manager Preference
                </option>
                <option value="Other">Other</option>
              </select>

              {reason === "Other" && (
                <input
                  type="text"
                  className="ed-input ed-input--other"
                  placeholder="Describe the reason…"
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                />
              )}
            </div>

            <div className="edtray__notes-block">
              <label className="ed-label">
                Billing Notes (optional)
              </label>
              <textarea
                className="ed-input ed-input--textarea"
                rows={2}
                placeholder="Context for partner / reviewer…"
                value={billingNotes}
                onChange={(e) => setBillingNotes(e.target.value)}
              />
            </div>

            <div className="edtray__actions">
              {error && (
                <div className="edtray__error" role="alert">
                  {error}
                </div>
              )}
              <button
                type="button"
                className="ed-btn ed-btn--ghost"
                disabled={saving}
                onClick={() => onClose(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ed-btn ed-btn--primary"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? "Saving…" : "Save & Close"}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </PopoverPortal>
  );
}