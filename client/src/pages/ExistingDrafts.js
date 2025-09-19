/*************************************************************************
 * ExistingDrafts.js  – 2025-07-25
 *************************************************************************/

import React, { useState, useMemo, useRef, useEffect } from 'react';

import Sidebar          from '../components/Sidebar';
import TopBar           from '../components/TopBar';
import GeneralDataTable from '../components/DataTable';

import sampleInvoiceLineItems from '../devSampleData/sampleInvoiceLineItems.json';
import sampleDrafts     from '../devSampleData/sampleExistingDrafts.json';
import { GetGranularWIPData } from '../services/ExistingDraftsService';

import { useAuth }      from '../auth/AuthContext';
import './ExistingDrafts.css';
//import { getJobDetails } from '../services/PE - Get Job Details'; // Used for PE API config testing purposes
import {
  CreateBulkPrintList,
  DownloadBulkList,
  GetDrafts,
  GetGranularJobData,
  GetBillThroughBlob,
  SetBillThroughBlob,
  GetInvoiceLineItems,
  CreateInvoiceBulkPrintList
} from '../services/ExistingDraftsService';

import Loader           from '../components/Loader';
import { createPortal } from "react-dom";

export function PopoverPortal({ open, children }) {
  if (!open) return null;
  return createPortal(children, document.body);
}

const norm = v => String(v ?? '').toLowerCase();
const stripHtml = v => String(v ?? '').replace(/<[^>]*>/g, ' ');

/* ─── helpers ─────────────────────────────────────────────────────── */
const currency = n =>
  new Intl.NumberFormat('en-US', { style : 'currency', currency : 'USD' })
    .format(n ?? 0);

/* ─── bill-through helpers (UI only) ─────────────────────────────── */
const fmtMMDDYYYY = (d) => {
  const dt = d instanceof Date ? d : parseYmdLocal(d);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

/* ─── bill-through date helpers ───────────────────────────── */
const toIsoYmd = (d) => {
  const dt = d instanceof Date ? d : parseYmdLocal(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const endOfPrevMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 0);

/* ─── date-only helpers (avoid UTC shift) ───────────────────── */
const parseYmdLocal = (ymd) => {
  if (ymd instanceof Date) return ymd;
  const [y, m, d] = String(ymd).split('-').map(n => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1); // local midnight, no timezone jump
};

export const IconSearchOutline = ({ size=18, stroke=1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
       xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth={stroke}
       strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="6" fill="currentColor" opacity="0.12" />
    <circle cx="11" cy="11" r="6" fill="none" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
);

function InlineSpinner({ size = 22 }) {
  return (
    <span
      className="kb-inline-spinner"
      style={{ width: size, height: size }}
      aria-label="Loading"
      role="status"
    />
  );
}

function DatePicker({ label, date, setDate, onCloseNext }) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(() =>
    new Date(date.getFullYear(), date.getMonth(), 1)
  );

  const title = month.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const grid = React.useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) {
      const dnum = prevDays - (firstDow - 1 - i);
      cells.push({ date: new Date(y, m - 1, dnum), muted: true });
    }
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(y, m, d), muted: false });
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date;
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), muted: true });
    }
    return cells;
  }, [month]);

  return (
    <div className="bt-inline">
      <span className="bt-label">{label}</span>
      <button
        type="button"
        className="bt-display"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {fmtMMDDYYYY(date)}
        <svg className="bt-cal" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="8" y1="2.5" x2="8" y2="5.5" stroke="currentColor" strokeWidth="1.5" />
          <line x1="16" y1="2.5" x2="16" y2="5.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div className="bt-popover" role="dialog">
          <div className="bt-head">
            <button type="button" className="bt-nav" onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
            <div className="bt-title">{title}</div>
            <button type="button" className="bt-nav" onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="bt-grid">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="bt-dow">{d}</div>)}
            {grid.map((cell, i) => (
              <button
                key={i}
                type="button"
                className={`bt-day ${cell.muted ? 'muted' : ''}`}
                onClick={() => {
                  setDate(cell.date);
                  setOpen(false);
                  onCloseNext?.(); // e.g., open the END picker right after picking START
                }}
              >
                {cell.date.getDate()}
              </button>
            ))}
          </div>
          <div className="bt-footer">
            <button type="button" className="bt-link" onClick={() => setMonth(new Date())}>Jump to Today</button>
            <button type="button" className="bt-link" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function JobDetailsPanel({ details, pinRequest, setGlobalLoading }) {
  // ===== Helpers =====
  const getJobKey = (d = {}) =>
    d.jobId || d.jobID || d.job?.Id || d.job?.JobId || d.job?.JobID || d.jobCode || d.job?.JobCode ||
    `${d.clientCode ?? ""}|${d.jobTitle ?? ""}`; // fallback if no stable id

  // ===== Pinned stack + per-panel tabs =====
  const [pinned, setPinned] = React.useState([]);     // [{ key, details }]
  const [tabByKey, setTabByKey] = React.useState({}); // { [key]: 'progress'|'totals'|'review' }

  const isPinned = (key) => pinned.some(p => p.key === key);
  const addPin    = (d) => setPinned(prev => isPinned(getJobKey(d)) ? prev : [...prev, { key: getJobKey(d), details: d }]);
  const removePin = (key) => setPinned(prev => prev.filter(p => p.key !== key));
  const setTabFor = (key, next) => setTabByKey(prev => ({ ...prev, [key]: next }));

  // Persist across Panel remounts:
  const invoiceTotalsCacheRef = React.useRef(new Map()); // key: client|start|end -> [{ narrative, total }]
  const invoiceDateRangeByClientRef = React.useRef(new Map()); // client -> { startDate: Date, endDate: Date }

  // ===== Hover lock + grace for the ephemeral panel =====
  const [isHovering, setIsHovering] = React.useState(false);
  const [inGrace, setInGrace] = React.useState(false);
  const graceTimer = React.useRef(null);
  const GRACE_MS = 220;

  // keep the last hovered details so we can render while hovering/grace
  const lastHoverRef = React.useRef(details || null);
  if (details) lastHoverRef.current = details;

  React.useEffect(() => {
    if (pinRequest) {
      addPin(pinRequest);          // stick it
    }
  }, [pinRequest]);                 // runs only when a new request arrives


  React.useEffect(() => {
    clearTimeout(graceTimer.current);
    if (details) {
      setInGrace(false);
    } else {
      setInGrace(true);
      graceTimer.current = setTimeout(() => setInGrace(false), GRACE_MS);
    }
    return () => clearTimeout(graceTimer.current);
  }, [details]);

  // While hovering OR in grace, keep showing the last hovered job
  const hoverSource = details || ((isHovering || inGrace) ? lastHoverRef.current : null);

  // Don't show ephemeral if it's already pinned
  const pinnedKeys = React.useMemo(() => new Set(pinned.map(p => p.key)), [pinned]);
  const ephemeral  = hoverSource && !pinnedKeys.has(getJobKey(hoverSource)) ? hoverSource : null;

  // Hide the whole stack only if no pinned, no ephemeral, and not hovering/grace
  const shouldRender = !!(pinned.length || ephemeral || isHovering || inGrace);
  if (!shouldRender) return null;

  // ---------- formatters ----------
  const num   = v => (v == null ? '–' : Number(v).toLocaleString('en-US'));
  const money = v => (v == null ? '–' : Number(v).toLocaleString('en-US', { style:'currency', currency:'USD' }));
  const pct   = v => {
    if (v == null || v === '') return '–';
    const n = typeof v === 'string' && v.includes('%')
      ? parseFloat(v)
      : (Math.abs(Number(v)) <= 1 ? Number(v) * 100 : Number(v));
    return isNaN(n) ? '–' : `${n.toFixed(2)}%`;
  };

  // ---------- viz helpers ----------
  const clamp01 = n => Math.max(0, Math.min(1, n));
  const parsePctNum = v => {
    if (v == null || v === '') return 0;
    const n = typeof v === 'string' && v.includes('%')
      ? parseFloat(v) / 100
      : (Math.abs(Number(v)) <= 1 ? Number(v) : Number(v) / 100);
    return isNaN(n) ? 0 : clamp01(n);
  };

  const Donut = ({ value = 0.0, size = 120 }) => {
    const r = (size - 14) / 2;
    const C = 2 * Math.PI * r;
    const p = clamp01(value);
    const off = C * (1 - p);
    return (
      <div className="donut">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`translate(${size/2},${size/2}) rotate(-90)`}>
            <circle r={r} cx="0" cy="0" className="trk" />
            <circle r={r} cx="0" cy="0" className="val" strokeDasharray={C} strokeDashoffset={off}/>
          </g>
        </svg>
        <div className="donut-label">{(p*100).toFixed(1)}%</div>
      </div>
    );
  };

  const BarPair = ({ label, py, cy }) => {
    const PY = Number(py) || 0;
    const CY = Number(cy) || 0;
    const max = Math.max(PY, CY, 1);
    return (
      <div className="barpair">
        <div className="bar-label">{label}</div>
        <div className="bar-track" aria-hidden="true">
          <span className="bar py" style={{ width: `${(PY/max)*100}%` }} />
          <span className="bar cy" style={{ width: `${(CY/max)*100}%` }} />
        </div>
        <div className="bar-vals">
          <span className="mini-pill py">{money(PY)}</span>
          <span className="mini-pill cy">{money(CY)}</span>
        </div>
      </div>
    );
  };

  const Row = ({ label, py, cy, kind }) => {
    const fmt = kind === 'money' ? money : kind === 'pct' ? pct : num;
    return (
      <div className="stat-row">
        <div className="k">{label}</div>
        <span className="pill py"><b>PY</b><span className="v">{fmt(py)}</span></span>
        <span className="pill cy"><b>CY</b><span className="v">{fmt(cy)}</span></span>
      </div>
    );
  };

  // ===== One reusable panel =====
  const Panel = ({ data, pinned, cacheRef, rangeRef }) => {
    const key = getJobKey(data);
    const j = (data.job) || {};
    const tab = tabByKey[key] || 'totals';
    const setTab = (t) => setTabFor(key, t);

  const disableOtherTabs = true; // lock non-totals tabs (UI only)
  function TotalsByInvoiceLinePane({ clientCode, cacheRef, rangeRef }) {
    // defaults: Jan 1 this year → today
    const today = new Date();
    const jan1  = new Date(today.getFullYear(), 0, 1);

    // restore per-client range if we have one
    const saved = rangeRef.current.get(clientCode);
    const [startDate, setStartDate] = React.useState(saved?.startDate ?? jan1);
    const [endDate, setEndDate]     = React.useState(saved?.endDate ?? today);
    const [forceOpenEnd, setForceOpenEnd] = React.useState(false);
    const [loading, setLoading] = React.useState(false);

    // NEW: distinct DebtTranIndex values for later API use
    const [debtTranIndexes, setDebtTranIndexes] = React.useState([]); // integers

    const handlePrintInvoices = async () => {
        if (!debtTranIndexes.length) return;
        try {
          setGlobalLoading?.(true); // show the same overlay used elsewhere
          console.log('DebtTranIndexes to print:', debtTranIndexes);

          const listIdText = await CreateInvoiceBulkPrintList(debtTranIndexes);
          const listId = listIdText.replaceAll('"', '');

          const blob = await DownloadBulkList(listId);
          const url  = window.URL.createObjectURL(blob);
          window.open(url);
        } catch (err) {
          console.error('Invoice print failed:', err);
        } finally {
          setGlobalLoading?.(false);
        }
      };

    // read a field regardless of casing (CLIENTCODE vs ClientCode, etc.)
    const f = (row, name) =>
      row?.[name] ?? row?.[name.toUpperCase()] ?? row?.[name.toLowerCase()] ?? undefined;

    // parse '2024-04-15 00:00:00.000' or ISO, without TZ shifts
    const parseSqlishDate = (s) => {
      if (s instanceof Date) return s;
      const txt = String(s ?? '').trim();
      if (!txt) return new Date(NaN);
      // split on space or 'T' then use y-m-d
      const [ymd] = txt.split(/[ T]/);
      return parseYmdLocal(ymd);
    };

    // derived, with simple validation (end >= start)
    const validRange = endDate >= startDate;

    const [rows, setRows] = React.useState([]);

    React.useEffect(() => {
      const key = `${clientCode}|${toIsoYmd(startDate)}|${toIsoYmd(endDate)}`;
      const cached = cacheRef.current.get(key);
      if (cached) {
        // back-compat if cache previously stored array only
        setRows(Array.isArray(cached) ? cached : (cached.rows || []));
        setDebtTranIndexes(Array.isArray(cached?.debtTranIndexes) ? cached.debtTranIndexes : []);
        setLoading(false);
        return;
      }

      setLoading(true);
      let cancelled = false;

      (async () => {
        try {
          const dateRange = `'${toIsoYmd(startDate)}' and '${toIsoYmd(endDate)}'`;
          const apiRows   = await GetInvoiceLineItems({ clientCode, dateRange });

          // distinct DebtTranIndex values (integers)
          const uniqueIdx = [
            ...new Set(
              (apiRows || [])
                .map(r => Number(f(r, 'DebtTranIndex')))
                .filter(n => Number.isFinite(n))
            ),
          ];

          // group by narrative (HTML stripped), sum Net
          const byNarr = new Map();
          for (const r of apiRows || []) {
            const narr = stripHtml(f(r, 'Narrative') || '').trim() || '—';
            const amt  = Number(f(r, 'Net')) || 0;
            byNarr.set(narr, (byNarr.get(narr) || 0) + amt);
          }
          const out = [...byNarr.entries()].map(([narrative, total]) => ({ narrative, total }))
            .sort((a, b) => b.total - a.total);

          if (!cancelled) {
            cacheRef.current.set(key, { rows: out, debtTranIndexes: uniqueIdx });
            setRows(out);
            setDebtTranIndexes(uniqueIdx);
          }
        } catch (err) {
          console.error('GetInvoiceLineItems failed, falling back to sample:', err);

          // fallback to local sample so the UI still shows *something*
          const start = parseYmdLocal(toIsoYmd(startDate));
          const end   = parseYmdLocal(toIsoYmd(endDate));
          const filtered = (sampleInvoiceLineItems || [])
            .filter(r => String(f(r, 'ClientCode')) === String(clientCode))
            .filter(r => {
              const d = parseSqlishDate(f(r, 'DebtTranDate'));
              return d >= start && d <= end;
            });

          const uniqueIdx = [
            ...new Set(
              filtered
                .map(r => Number(f(r, 'DebtTranIndex')))
                .filter(n => Number.isFinite(n))
            ),
          ];

          const byNarr = new Map();
          for (const r of filtered) {
            const narr = stripHtml(f(r, 'Narrative') || '').trim() || '—';
            const amt  = Number(f(r, 'Net')) || 0;
            byNarr.set(narr, (byNarr.get(narr) || 0) + amt);
          }
          const out = [...byNarr.entries()].map(([narrative, total]) => ({ narrative, total }))
            .sort((a, b) => b.total - a.total);

          if (!cancelled) {
            cacheRef.current.set(key, { rows: out, debtTranIndexes: uniqueIdx });
            setRows(out);
            setDebtTranIndexes(uniqueIdx);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      return () => { cancelled = true; };
    }, [clientCode, startDate, endDate]);

    return (
      <div className="totals-pane">
        <div className="pane-subhead">
          Displays totals by invoice line item for this client for the selected time period.
          Click the dates to update the period.
        </div>

        <div className="date-range">
          <DatePicker
            label="Start"
            date={startDate}
            setDate={(d) => {
              setStartDate(d);
              if (endDate < d) setEndDate(d);
              rangeRef.current.set(clientCode, { startDate: d, endDate: endDate < d ? d : endDate });
            }}
            onCloseNext={() => setForceOpenEnd(true)}
          />

          <DatePicker
            label="End"
            date={endDate}
            setDate={(d) => {
              setEndDate(d);
              rangeRef.current.set(clientCode, { startDate, endDate: d });
            }}
          />

          {/* NEW: “uploaded pages” / download invoices button */}
          <button
            type="button"
            className={`invoices-btn ${rows.length ? '' : 'disabled'}`}
            title="Click to download related invoices"
            aria-label="Download related invoices"
            disabled={!rows.length}
            onClick={handlePrintInvoices}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M13 2v5h5" fill="none" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M8 12h8M8 16h8M8 8h3" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>

        {!validRange && (
          <div className="range-error" role="alert">
            End date must be on or after the start date.
          </div>
        )}

        <div className="totals-table-wrap">
          {loading ? (
            <div className="mini-loader" style={{ minHeight: 120, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <InlineSpinner />
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-msg">No invoices for this client within the date range selected.</div>
          ) : (
            <table className="mini-table mini-table--tight">
              <thead>
                <tr>
                  <th style={{ width: '70%' }}>Narrative</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="narr-cell" title={r.narrative}>{r.narrative}</td>
                    <td className="num">{currency(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }


    return (
      <div className="job-details-split">
        <section className="panel panel--job">
          {/* Pin control */}
          <div className="pin-wrap">
            <button
              className={`pin-toggle ${pinned ? 'is-pinned' : ''}`}
              aria-pressed={pinned}
              onClick={() => (pinned ? removePin(key) : addPin(data))}
              title={pinned ? 'Unpin' : 'Pin'}
            >
              {/* bi-pin (outline) */}
              <svg className="ico pin-outline" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.708V2.277a2.77 2.77 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/>
              </svg>
              {/* bi-pin-fill (solid) */}
              <svg className="ico pin-solid" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.708V2.277a2.77 2.77 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/>
              </svg>
            </button>
          </div>

          <div className="panel__title">Job Details</div>

          <div className="job-header">
            <span
              className="chip job-id"
              title={`${data.clientCode} ${data.clientName}`}
              data-tooltip={`${data.clientCode} ${data.clientName}`}
            >
              {data.clientCode} {data.clientName}
            </span>
            <span
              className="chip job-chip"
              title={data.jobTitle}
              data-tooltip={data.jobTitle}
            >
              {data.jobTitle || '—'}
            </span>
          </div>

          {/* Two-column grid inside the blue panel */}
          <div className="job-body">
            {/* LEFT: fixed stats column */}
            <div className="stat-list">
              <Row label="Hours"            py={j.PYHours}           cy={j.CYHours}           kind="num" />
              <Row label="WIP Time"         py={j.PYWIPTime}         cy={j.CYWIPTime}         kind="money" />
              <Row label="WIP Exp"          py={j.PYWIPExp}          cy={j.CYWIPExp}          kind="money" />
              <Row label="Billed"           py={j.PYBilled}          cy={j.CYBilled}          kind="money" />
              <Row label="Realization"      py={j.PYRealization}     cy={j.CYRealization}     kind="pct" />
              <Row label="WIP Outstanding"  py={j.PYWIPOutstanding}  cy={j.CYWIPOutstanding}  kind="money" />
            </div>

            {/* RIGHT: white tabbed panel now nested inside the blue */}
            <div className="job-right">
              <section className="panel panel--jobtabs" aria-labelledby="jobtabs-title">
                <div id="jobtabs-title" className="sr-only">Job sub-sections</div>

                <div className="tabbar" role="tablist" aria-label="Job sub-sections">
                  <button
                    role="tab"
                    aria-selected={tab === 'progress'}
                    className={`tab-btn ${tab === 'progress' ? 'is-active' : ''} ${disableOtherTabs ? 'is-disabled' : ''}`}
                    disabled={disableOtherTabs}
                    aria-disabled={disableOtherTabs}
                    onClick={disableOtherTabs ? undefined : () => setTab('progress')}
                  >
                    Job Progress
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'totals'}
                    className={`tab-btn ${tab === 'totals' ? 'is-active' : ''}`}
                    onClick={() => setTab('totals')}
                  >
                    Totals by Invoice Line
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'review'}
                    className={`tab-btn ${tab === 'review' ? 'is-active' : ''} ${disableOtherTabs ? 'is-disabled' : ''}`}
                    disabled={disableOtherTabs}
                    aria-disabled={disableOtherTabs}
                    onClick={disableOtherTabs ? undefined : () => setTab('review')}
                  >
                    Invoice Review
                  </button>
                </div>

                <div className="tab-body">
                  {tab === 'progress' && (
                    <div className="progress-pane">
                      <div className="vis-card">
                        <div className="vis-title">CY Realization</div>
                        <Donut value={parsePctNum(j.CYRealization)} />
                      </div>
                      <div className="vis-card">
                        <div className="vis-title">Money Snapshot</div>
                        <BarPair label="WIP Time"        py={j.PYWIPTime}        cy={j.CYWIPTime} />
                        <BarPair label="WIP Exp"         py={j.PYWIPExp}         cy={j.CYWIPExp} />
                        <BarPair label="Billed"          py={j.PYBilled}         cy={j.CYBilled} />
                        <BarPair label="WIP Outstanding" py={j.PYWIPOutstanding} cy={j.CYWIPOutstanding} />
                      </div>
                    </div>
                  )}

                  {tab === 'totals' && (
                    <div className="vis-card">
                      <div className="vis-title">Totals by Invoice Line</div>
                      <TotalsByInvoiceLinePane clientCode={data.clientCode} cacheRef={cacheRef} rangeRef={rangeRef} />
                    </div>
                  )}

                  {tab === 'review' && (
                    <div className="placeholder-pane">
                      <div className="vis-card">
                        <div className="vis-title">Invoice Review</div>
                        <p className="muted">Review/approve UI placeholder.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    );
  };

  // ===== Render: all pinned panels, then the ephemeral one (if any) =====
  return (
    <div
      className="job-details-stack"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {pinned.map(p => (
        <Panel
          key={`pinned:${p.key}`}
          data={p.details}
          pinned
          cacheRef={invoiceTotalsCacheRef}
          rangeRef={invoiceDateRangeByClientRef}
        />
      ))}
      {ephemeral && (
        <Panel
          key={`hover:${getJobKey(ephemeral)}`}
          data={ephemeral}
          pinned={false}
          cacheRef={invoiceTotalsCacheRef}
          rangeRef={invoiceDateRangeByClientRef}
        />
      )}
    </div>
  );
}



/* ─── page ────────────────────────────────────────────────────────── */
export default function ExistingDrafts() {

  useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      setLoading(true);

      // 1) Fetch bill-through from blob (or default to EOM-1 if missing)
      let bt = endOfPrevMonth();
      try {
        const blob = await GetBillThroughBlob();
          if (blob?.billThroughDate) {
            const parsed = parseYmdLocal(blob.billThroughDate); // <-- local parse
            if (!isNaN(parsed)) bt = parsed;
          }
      } catch (e) {
        console.warn('Bill-through blob missing/unreadable; defaulting to EOM-1', e);
      }
      if (cancelled) return;

      setBillThrough(bt);
      setBtMonth(new Date(bt.getFullYear(), bt.getMonth(), 1));

      const iso = toIsoYmd(bt);

      // 2) Fetch data with billThroughDate in body
      const [dRes, gRes, wipRes] = await Promise.allSettled([
        GetDrafts(iso),
        GetGranularJobData(iso),
        GetGranularWIPData(),
      ]);
      if (cancelled) return;

      if (dRes.status === 'fulfilled') setRawRows(Array.isArray(dRes.value) ? dRes.value : []);
      else {
        console.error('GetDrafts failed:', dRes.reason);
        setRawRows(sampleDrafts); // graceful fallback
      }

      if (gRes.status === 'fulfilled') setGranularData(Array.isArray(gRes.value) ? gRes.value : []);
      else console.error('GetGranularJobData failed:', gRes.reason);

      if (wipRes.status === 'fulfilled') setGranularWip(Array.isArray(wipRes.value) ? wipRes.value : []);
       else console.error('GetGranularWIPData failed:', wipRes.reason);
    } finally {
      if (!cancelled) setLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, []); // run once



 //const sampleDraftIndexes = [94929]

  /* ── AUTH ───────────────────────────────────────────────────── */
  const { ready, principal, isSuperUser } = useAuth();
  const email = principal?.userDetails?.toLowerCase() || '';

  /* ── RAW DATA  (dev stub) ───────────────────────────────────── */
  const [rawRows, setRawRows] = useState([]);
  const [granularData, setGranularData] = useState([]);
  const [granularWip, setGranularWip]   = useState([]); // <<< live WIP rows (staff/task-level)
  const [loading, setLoading] = useState(false);

  const wipByDraftJob = useMemo(() => {
    const m = new Map();
    for (const r of granularWip) {
      // normalize keys: payload might send numbers as strings
      const key = `${Number(r.DraftFeeIdx)}|${Number(r.Job_Idx)}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    }
    return m;
  }, [granularWip]);


  /* >>> selection-state (NEW) >>> */
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toggleOne   = id =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleMany  = ids =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  const clearAll = () => setSelectedIds(new Set());
  /* <<< selection-state END <<< */

  /* >>> clearFiltersAndSelections (NEW) >>> */
  const resetFiltersAndSelections = () => {
    clearFilters();   // existing function, leave as-is
    clearAll();       // wipe checkboxes
  };
  /* <<< clearFiltersAndSelections END <<< */
  /* >>> header-checkbox-ref (NEW) >>> */
  const headerCbRef = useRef(null);
  /* <<< header-checkbox-ref END <<< */

  /* >>> modal-state (NEW) >>> */
  const [showScopeModal, setShowScopeModal] = useState(false);
  /* <<< modal-state END <<< */

  /* >>> select-all logic (REPLACED) >>> */
  const handleSelectAll = () => {
    if (headerCbRef.current) {
      headerCbRef.current.checked = false;        // undo the auto-tick
    }
    setShowScopeModal(true);           // just open the modal
  };
  /* <<< select-all logic END <<< */
  /* ── VISIBILITY  (filter by ROLES) ──────────────────────────── */
  const visibleRawRows = useMemo(() => {
    if (!ready) return [];

    if (isSuperUser || 1 === 1) {   // dev backdoor: set to false to test user filtering
      console.log('%cAUTH ▶ super-user – no filter', 'color:navy');
      return rawRows;
    }

    const rowsForUser = rawRows.filter(
      r => Array.isArray(r.ROLES) &&
           r.ROLES.some(role => role.toLowerCase() === email)
    );

    console.groupCollapsed(`AUTH ▶ ${email}`);
    console.log({ ready, email, matchCount : rowsForUser.length });
    console.log('sample row →', rowsForUser[0]);
    console.groupEnd();

    return rowsForUser;
  }, [ready, rawRows, isSuperUser, email]);

  /* ── GROUP by DRAFTFEEIDX (roll-up) ─────────────────────────── */
  const rows = useMemo(() => {
    const map = new Map();

    visibleRawRows.forEach(r => {
      const key = r.DRAFTFEEIDX;
      if (!map.has(key)) {
        map.set(key, {
          ...r,
          CLIENTS : [{ code : r.CLIENTCODE, name : r.CLIENTNAME, cont : r.CONTINDEX }],
          codeMap : { [r.CONTINDEX] : { code : r.CLIENTCODE, name : r.CLIENTNAME } },
          DRAFTDETAIL     : [...r.DRAFTDETAIL],
          NARRATIVEDETAIL : [...r.NARRATIVEDETAIL],
        });
      } else {
        const agg = map.get(key);

        if (!agg.codeMap[r.CONTINDEX]) {
          agg.CLIENTS.push({ code : r.CLIENTCODE, name : r.CLIENTNAME, cont : r.CONTINDEX });
          agg.codeMap[r.CONTINDEX] = { code : r.CLIENTCODE, name : r.CLIENTNAME };
        }
        agg.DRAFTDETAIL.push(...r.DRAFTDETAIL);
        agg.NARRATIVEDETAIL.push(...r.NARRATIVEDETAIL);

        agg.BILLED           += r.BILLED;
        agg.WIP              += r.WIP;
        agg['Write Off(Up)'] += r['Write Off(Up)'];
      }
    });

    console.log(`GROUP ▶ ${visibleRawRows.length} raw → ${map.size} grouped`);
    return [...map.values()];
  }, [visibleRawRows]);

  
  /* >>> keep header checkbox in sync (NEW) >>> */
  useEffect(() => {
    if (!headerCbRef.current) return;

    const total = rows.length;
    const sel   = selectedIds.size;

    headerCbRef.current.checked       = sel > 0 && sel === total;
    headerCbRef.current.indeterminate = sel > 0 && sel < total;
  }, [selectedIds, rows]);          // runs on every change
  /* <<< keep header checkbox in sync END <<< */

  /* Bill Through (value comes from blob on load; super users can change it) */
  const [billThrough, setBillThrough] = useState(endOfPrevMonth());
  const [btOpen, setBtOpen] = useState(false);
  const [btMonth, setBtMonth] = useState(() =>
    new Date(billThrough.getFullYear(), billThrough.getMonth(), 1)
  );

  /* lightweight calendar grid for the current btMonth (no selection yet) */
  const btGrid = useMemo(() => {
    const y = btMonth.getFullYear();
    const m = btMonth.getMonth();

    const firstDow = new Date(y, m, 1).getDay();                     // 0=Sun..6=Sat
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();

    const cells = [];
    // leading previous-month days
    for (let i = 0; i < firstDow; i++) {
      const dnum = prevDays - (firstDow - 1 - i);
      cells.push({ date: new Date(y, m - 1, dnum), muted: true });
    }
    // current month days
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(y, m, d), muted: false });
    // trailing next-month days to fill 6x7
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date;
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), muted: true });
    }
    return cells;
  }, [btMonth]);

  const btTitle = useMemo(() => btMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }), [btMonth]);
  const btPrev  = () => setBtMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const btNext  = () => setBtMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  /* ── FILTER STATE ──────────────────────────────────────────── */
  const [originatorFilter, setOriginatorFilter] = useState('');
  const [partnerFilter,   setPartnerFilter]     = useState('');
  const [managerFilter,   setManagerFilter]     = useState('');
  const [searchText,      setSearchText]        = useState('');
  const [realOp,          setRealOp]            = useState('');
  const [realVal1,        setRealVal1]          = useState('');
  const [realVal2,        setRealVal2]          = useState('');
  const [finalFilter, setFinalFilter] = useState('all');


  const onChangeRealOp = (e) => {
    const op = e.target.value;
    setRealOp(op);
    // reset values whenever the operator changes so you don't carry stale numbers
    setRealVal1('');
    setRealVal2('');
  };


  /* >>> hasChanges (NEW) – any filters OR any selections >>> */
  const hasChanges =
    selectedIds.size > 0 ||
    searchText            ||
    originatorFilter      ||
    partnerFilter         ||
    managerFilter         ||
    realOp                ||
    finalFilter !== 'all';
  /* <<< hasChanges END <<< */
  /* >>> pagination-state (NEW) >>> */
  const [currentPage, setCurrentPage]       = useState(1);   // 1-based index
  const [rowsPerPage, setRowsPerPage]       = useState(10);
  /* <<< pagination-state END <<< */

  /* ── options for dropdowns (derived) ───────────────────────── */
  const originatorOptions = useMemo(
    () => [...new Set(rows.map(r => r.ORIGINATOR))].sort(), [rows]);
  const partnerOptions = useMemo(
    () => [...new Set(rows.map(r => r.CLIENTPARTNER))].sort(), [rows]);
  const managerOptions = useMemo(
    () => [...new Set(rows.map(r => r.CLIENTMANAGER))].sort(), [rows]);

  /* ── CHIP helper ───────────────────────────────────────────── */
  const ChipSet = ({ items, field }) => {
  const visible = items.slice(0, 3);
  const hidden  = items.slice(3);
  const isName  = field === 'name';
  const isCode  = field === 'code';

  return (
    <div className={`chip-container row-chip ${isName ? 'name-col' : ''}`}>
      {visible.map(c => (
        <span
          key={c.code + field}
          className={`chip ${isName ? 'name-chip' : ''} ${isCode ? 'code-chip' : ''}`}
          data-tooltip={isName ? c[field] : undefined}
          title={isName ? c[field] : undefined}   // native fallback
        >
          {c[field]}
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          className="chip more"
          data-tooltip={hidden.map(c => c[field]).join('\n')}
        >
          +{hidden.length}
        </span>
      )}
    </div>
  );
};


  function RoleChips({ originator, partner, manager }) {
    const Item = ({ role, value, className }) => (
      <span
        className={`chip role ${className}`}
        data-tooltip={role}
        aria-label={role}
        title={role}
      >
        {value || '—'}
      </span>
    );

    return (
      <div className="chip-container role-chip-stack">
        <Item role="Client Originator" className="originator" value={originator} />
        <Item role="Client Partner"    className="partner"    value={partner} />
        <Item role="Client Manager"    className="manager"    value={manager} />
      </div>
    );
  }

  /* ── columns (uses ChipSet + currency) ─────────────────────── */
  const columns = [
      /* >>> checkbox-column (NEW) >>> */
    {
      name : (
      <input
        type="checkbox"
        className="row-cb"
        ref={headerCbRef}
        onChange={handleSelectAll}
      />
    ),
    selector : r => r.DRAFTFEEIDX,   // any stub selector – required by the lib
    width : '55px',
    ignoreRowClick : true,
    sortable : false,
      cell : r => (
        <input
          type="checkbox"
          className="row-cb"
          checked={selectedIds.has(r.DRAFTFEEIDX)}
          onChange={() => toggleOne(r.DRAFTFEEIDX)}
        />
      ),
    },
    /* <<< checkbox-column END <<< */
    { name : 'Code',      width:'120px', grow:0, sortable:true, center: true,
      cell : r => <ChipSet items={r.CLIENTS} field="code" /> },
    { name : 'Name',      grow:2.6, sortable:true, center: true,
      style: { minWidth: 0 },
      cell : r => <ChipSet items={r.CLIENTS} field="name" /> },
    { name : 'Client Roles', grow: 1, sortable:false, width:'170px', center: true,
      cell : r => (
        <RoleChips
          originator={r.ORIGINATOR}
          partner={r.CLIENTPARTNER}
          manager={r.CLIENTMANAGER}
        />
      )
    }, 
    { name : 'Office',    selector: r => r.CLIENTOFFICE, sortable:true, width:'80px', grow: 0 },
    { name : 'WIP',       selector: r => r.WIP,    sortable:true, format: r => currency(r.WIP) , grow: 0.4},
    { name : 'Bill',      selector: r => r.BILLED, sortable:true, format: r => currency(r.BILLED) , grow: 0.4},
    { name : 'W/Off',     selector: r => r.WRITEOFFUP, sortable:true,
                          format: r => currency(r.WRITEOFFUP) , grow: 0.4},
    { name : 'Real.%',    selector: r => r.BILLED / (r.WIP || 1), sortable:true,
                          format: r => `${((r.BILLED / (r.WIP || 1))*100).toFixed(1)}%`,
                          width:'84px', grow: 0 },
    { name : 'Draft Link', width:'150px', ignoreRowClick:true, center: true,
      cell : r => (
        <a href={r.DRAFTHYPERLINK} target="_blank" rel="noopener noreferrer" className="open-link">
          <img
            src="https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/images/ClickToOpen-PE.svg"
            alt="Open draft in Practice Engine" className="open-link-icon"
          />
        </a>
      )},
    { name : 'Actions', ignoreRowClick:true, button:true, grow: 0.5,
      cell : r => {
        const ACTIONS_DISABLED = true; // <— flip to false later when you want them enabled

        return (
          <div className="action-btns">
            {/* red “Abandon” (disabled) */}
            <button
              className="abandon-icon"
              title={ACTIONS_DISABLED ? 'Disabled' : 'Abandon draft'}
              disabled={ACTIONS_DISABLED}
              aria-disabled={ACTIONS_DISABLED}
              onClick={ACTIONS_DISABLED ? undefined : () => console.log('TODO – abandon draft', r.DRAFTFEEIDX)}
            >
              <svg viewBox="0 0 24 24" width="14" height="14"
                  stroke="#fff" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round" fill="none">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* green “Confirm” (disabled) */}
            <button
              className="confirm-icon"
              title={ACTIONS_DISABLED ? 'Disabled' : 'Confirm draft'}
              disabled={ACTIONS_DISABLED}
              aria-disabled={ACTIONS_DISABLED}
              onClick={ACTIONS_DISABLED ? undefined : () => console.log('TODO – confirm draft', r.DRAFTFEEIDX)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16"
                  stroke="#fff" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round" fill="none">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
        );
      }
    },

  ];

const money = v => v == null ? "–" :
  Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
const num = v => v == null ? "–" : Number(v).toLocaleString("en-US");

// Renders a compact key/value card
function JobHoverMatrix({ job }) {
  return (
    <div className="job-hover">
      {/* top summary */}
      <div className="job-top">
        <div className="kv"><span className="k">Office - </span><span className="v">{job.ClientOffice}</span></div>
        <div className="kv"><span className="k">Originator - </span><span className="v">{job.ClientOriginator}</span></div>
        <div className="kv"><span className="k">Partner - </span><span className="v">{job.JobPartner}</span></div>
        <div className="kv"><span className="k">Manager - </span><span className="v">{job.JobManager}</span></div>
      </div>

      {/* matrix */}
      <table className="hover-matrix" role="table" aria-label={`Job ${job.Job_Idx} summary`}>
        <thead>
          <tr>
            <th />         {/* row labels */}
            <th>PY</th>
            <th>CY</th>
          </tr>
        </thead>
        <tbody>
          <tr><th>Hours</th>            <td>{num(job.PYHours)}</td>           <td>{num(job.CYHours)}</td></tr>
          <tr><th>WIP Time</th>         <td>{money(job.PYWIPTime)}</td>       <td>{money(job.CYWIPTime)}</td></tr>
          <tr><th>WIP Exp</th>          <td>{money(job.PYWIPExp)}</td>        <td>{money(job.CYWIPExp)}</td></tr>
          <tr><th>Billed</th>           <td>{money(job.PYBilled)}</td>        <td>{money(job.CYBilled)}</td></tr>
          <tr><th>Realization</th>      <td>{job.PYRealization ?? "–"}</td>   <td>{job.CYRealization ?? "–"}</td></tr>
          <tr><th>WIP Outstanding</th>  <td>{money(job.PYWIPOutstanding)}</td><td>{money(job.CYWIPOutstanding)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function DraftRow({ d, client, granData, onHover, onLeave, onPin, expanded, onToggleExpand }) {
  const payload = {
    clientCode : client.code,
    clientName : client.name,
    jobTitle   : d.JOBTITLE,
    job        : Array.isArray(granData) ? granData[0] : undefined
  };

  const rowKey = `${d.DRAFTFEEIDX}-${d.SERVPERIOD}-${d.CONTINDEX}`;

  return (
    <tr key={rowKey} style={d.finalCheck === 'X' ? { color: 'red' } : undefined}>
      <td className="icon-cell">
        <div className="icon-stack">
          {/* zoom = ONLY for Job Details hover */}
          <button
            type="button"
            className="icon-btn zoom-in"
            title="View job details"
            onMouseEnter={() => onHover && onHover(payload)}
            onMouseLeave={() => onLeave && onLeave()}
            onClick={() => onPin && onPin(payload)}
            aria-label="View job details"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>

          {/* expand/collapse = toggles drilldown */}
          <button
            type="button"
            className="icon-btn expand-btn"
            title={expanded ? 'Collapse' : 'Expand'}
            aria-expanded={!!expanded}
            onClick={() => onToggleExpand && onToggleExpand(rowKey)}
          >
            {expanded ? '−' : '+'}
          </button>
        </div>
      </td>

      <td>{client.code}</td>
      <td>{client.name}</td>
      <td>{d.SERVINDEX}</td>
      <td>{d.WIPTYPE}</td>
      <td>{d.JOBTITLE}</td>
      <td>{currency(d.DRAFTWIP)}</td>
      <td>{currency(d.DRAFTAMOUNT)}</td>
      <td>{currency(d.WRITE_OFF_UP)}</td>
    </tr>
  );
}

  /* ── EXPANDABLE row render ────────────────────────────────── */
const Expandable = ({ data }) => {
  const [activeDetails, setActiveDetails] = React.useState(null);
  const hideTimer = React.useRef(null);

  // open/close per-row and mode per-row
  const [openRows, setOpenRows] = React.useState({});      // { [rowKey]: true }
  const [modeByRow, setModeByRow] = React.useState({});    // { [rowKey]: 'staff' | 'task' }
  const [pinRequest, setPinRequest] = React.useState(null);

  const toggleOpen = (key) => setOpenRows(prev => ({ ...prev, [key]: !prev[key] }));
  const setModeFor = (key, mode) => setModeByRow(prev => ({ ...prev, [key]: mode }));

  const showDetails = (p) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setActiveDetails(p);
  };
  const delayHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActiveDetails(null), 160);
  };

  // NOTE POPUP (hover)
  const [showNotes, setShowNotes] = React.useState(false);
  const notesTimer = React.useRef(null);
  const openNotes  = () => { if (notesTimer.current) clearTimeout(notesTimer.current); setShowNotes(true); };
  const closeNotes = () => {
    if (notesTimer.current) clearTimeout(notesTimer.current);
    // small delay to allow cursor to move from icon → popover without flicker
    notesTimer.current = setTimeout(() => setShowNotes(false), 120);
  };

  // Resolve Draft Notes once per Expanded group
  const draftNotes = React.useMemo(() => {
    if (data?.DRAFTNOTES && String(data.DRAFTNOTES).trim()) return String(data.DRAFTNOTES);
    // fallback: first non-empty notes from detail rows (if present)
    const fromDetail = (data?.DRAFTDETAIL || [])
      .map(r => r?.DRAFTNOTES)
      .find(t => t && String(t).trim());
    return fromDetail ? String(fromDetail) : '';
  }, [data]);

  // unique narratives
  const uniqueNarratives = Array.from(
    new Map((data.NARRATIVEDETAIL ?? []).map(n => [n.DEBTNARRINDEX, n])).values()
  );

  // sort rows: Code → Job → ServicePeriod
  const rows = (data.DRAFTDETAIL ?? []).toSorted((a, b) => {
    const ac = (data.codeMap[a.CONTINDEX]?.code ?? "").toString().trim();
    const bc = (data.codeMap[b.CONTINDEX]?.code ?? "").toString().trim();
    if (ac !== bc) {
      if (!ac) return 1; if (!bc) return -1;
      return ac.localeCompare(bc, undefined, { numeric: true, sensitivity: "base" });
    }
    const aj = (a.JOBTITLE ?? "").toString().trim();
    const bj = (b.JOBTITLE ?? "").toString().trim();
    if (aj !== bj) {
      if (!aj) return 1; if (!bj) return -1;
      return aj.localeCompare(bj, undefined, { numeric: true, sensitivity: "base" });
    }
    return String(a.SERVPERIOD ?? "").localeCompare(
      String(b.SERVPERIOD ?? ""), undefined, { numeric: true, sensitivity: "base" }
    );
  });

  // helper: aggregate Hours, WIP, Bill, Woff by Staff or Task
  const aggregate = (rows, by) => {
    const keyOf = (r) => by === 'task' ? (r.Task_Subject || '—') : (r.StaffName || '—');
    const map = new Map();
    rows.forEach(r => {
      const k = keyOf(r);
      const prev = map.get(k) || { hours:0, wip:0, bill:0, woff:0 };
      map.set(k, {
        hours: prev.hours + (+r.WIPHours   || 0),
        wip:   prev.wip   + (+r.WIPAmount  || 0),
        bill:  prev.bill  + (+r.BillAmount || 0),
        woff:  prev.woff  + (+r.BillWoff   || 0),
      });
    });
    return [...map.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric:true, sensitivity:'base' }));
  };

  return (
    <div className="expanded-content">

      {/* Panel 1: Draft WIP Analysis */}
      <div className="panel panel--draft">
        <div className="panel__title-row">
          <div className="panel__title">Draft WIP Analysis</div>

          {/* Notes icon + hover popover */}
          <div
            className="notes-wrap"
            onMouseEnter={openNotes}
            onMouseLeave={closeNotes}
          >
            <button
              type="button"
              className="notes-trigger bare"
              aria-haspopup="dialog"
              aria-expanded={showNotes}
              title="View draft notes"
            >
              {/* Your hosted SVG — no circle, exactly as stored */}
              <img
                src="https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/images/SpeechBubble.svg"
                alt="Draft notes"
                className="notes-icon"
                width="22"
                height="22"
                draggable="false"
              />
            </button>

            {showNotes && (
              <div className="note-popover" role="dialog" aria-label="Draft Notes">
                <div className="note-head">Draft Notes</div>
                <div className="note-body">
                  {draftNotes
                    ? draftNotes.split(/\r?\n/).map((line, i) => <p key={i}>{line}</p>)
                    : <p className="muted">No notes on this draft.</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table className="mini-table mini-table--tight existing-drafts">
            {/* lock widths so drill aligns perfectly */}
            <colgroup>
              <col style={{ width: 64 }} />            {/* icon */}
              <col /><col /><col /><col /><col />      {/* code | name | service | type | job */}
              <col className="col-money" />            {/* Draft WIP */}
              <col className="col-money" />            {/* Draft Amt */}
              <col className="col-money" />            {/* Write-Off */}
            </colgroup>

            <thead>
              <tr>
                <th></th>
                <th>Client Code</th>
                <th>Client Name</th>
                <th>Service</th>
                <th>Type</th>
                <th>Job</th>
                <th>Draft WIP</th>
                <th>Draft Amt</th>
                <th>Write-Off</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(d => {
                const client = data.codeMap[d.CONTINDEX] || {};
                const g = granularData.filter(x => Number(x.Job_Idx) === Number(d.SERVPERIOD));

                const rowKey = `${d.DRAFTFEEIDX}-${d.SERVPERIOD}-${d.CONTINDEX}`;
                const expanded = !!openRows[rowKey];
                const mode = modeByRow[rowKey] || 'staff';

                 // LIVE granular rows for this Draft + Job
                const wipKey   = `${Number(d.DRAFTFEEIDX)}|${Number(d.SERVPERIOD)}`;
                const wipRows  = wipByDraftJob.get(wipKey) || [];
                const grouped  = aggregate(wipRows, mode);

                return (
                  <React.Fragment key={rowKey}>
                    <DraftRow
                      d={d}
                      client={client}
                      granData={g}
                      onHover={showDetails}
                      onLeave={delayHide}
                      onPin={(p) => setPinRequest(p)}
                      expanded={expanded}
                      onToggleExpand={toggleOpen}
                    />

                    {expanded && (
                      <>
                        {/* TOGGLE ROW ONLY (white pills) */}
                        <tr className="drill-subhead">
                          <td colSpan={9}>
                            <div className="seg-toggle" role="tablist" aria-label="Breakdown mode">
                              <button
                                type="button"
                                role="tab"
                                aria-selected={mode === 'staff'}
                                className={`seg-btn ${mode === 'staff' ? 'is-active' : ''}`}
                                onClick={() => setModeFor(rowKey, 'staff')}
                              >
                                By Staff
                              </button>
                              <button
                                type="button"
                                role="tab"
                                aria-selected={mode === 'task'}
                                className={`seg-btn ${mode === 'task' ? 'is-active' : ''}`}
                                onClick={() => setModeFor(rowKey, 'task')}
                              >
                                By Task
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* HEADER ROW (labels only — aligns with data cells) */}
                        <tr className="drill-head-row">
                          <td colSpan={6}>
                            <div className="drill-subhead-grid">
                              <span className="hdr-left">{mode === 'task' ? 'Task Name' : 'Staff Name'}</span>
                              <span className="hdr-hours">Hours</span>
                            </div>
                          </td>
                          <td className="th-like num">Draft WIP</td>
                          <td className="th-like num">Draft Amt</td>
                          <td className="th-like num">Write-Off</td>
                        </tr>

                        {/* DATA ROWS */}
                        {grouped.length === 0 ? (
                          <tr className="drill-item">
                            <td colSpan={6} className="muted">No granular rows for this draft.</td>
                            <td className="num"></td>
                            <td className="num"></td>
                            <td className="num"></td>
                          </tr>
                        ) : (
                          grouped.map(r => (
                            <tr key={r.label} className="drill-item">
                              <td colSpan={6}>
                                <div className="row-left">
                                  <span className="lbl">{r.label}</span>
                                  <span className="hrs">{r.hours.toFixed(2)}</span>
                                </div>
                              </td>
                              <td className="num">{currency(r.wip)}</td>
                              <td className="num">{currency(r.bill)}</td>
                              <td className="num">{currency(r.woff)}</td>
                            </tr>
                          ))
                        )}

                        {/* bumper */}
                        <tr className="drill-bumper"><td colSpan={9} /></tr>
                      </>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel 2: Draft Narratives */}
      <div className="panel panel--narrative">
        <div className="panel__title">Draft Narratives</div>
        <div className="table-wrap">
          <table className="mini-table mini-table--tight">
            <thead>
              <tr><th>Narrative</th><th>Service</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {uniqueNarratives.map(n => (
                <tr key={n.DEBTNARRINDEX}>
                  <td dangerouslySetInnerHTML={{ __html:n.FEENARRATIVE }} />
                  <td>{n.SERVINDEX}</td>
                  <td>{currency(n.AMOUNT)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel 3: Job Details (hover from magnifier) */}
      <JobDetailsPanel
        details={activeDetails}
        pinRequest={pinRequest}
        setGlobalLoading={setLoading}
        onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); }}
        onMouseLeave={delayHide}
      />
    </div>
  );
};

  

  /* ── UI-FILTERED rows (after search / dropdowns) ───────────── */
  const filteredRows = useMemo(() => {
    const bySearch = r => {
      const q = norm(searchText).trim();
      if (!q) return true;

      // client codes & names
      const clientHit = (r.CLIENTS || []).some(c =>
        norm(c.code).includes(q) || norm(c.name).includes(q)
      );

      // roles
      const roleHit =
        norm(r.ORIGINATOR).includes(q) ||
        norm(r.CLIENTPARTNER).includes(q) ||
        norm(r.CLIENTMANAGER).includes(q);

      // draft notes (group-level or any detail row)
      const groupNotes = norm(r.DRAFTNOTES);
      const detailNotes = norm((r.DRAFTDETAIL || [])
        .map(d => d?.DRAFTNOTES ?? '')
        .join(' '));

      const notesHit =
        groupNotes.includes(q) || detailNotes.includes(q);

      // narratives (strip HTML first)
      const narratives = norm((r.NARRATIVEDETAIL || [])
        .map(n => stripHtml(n?.FEENARRATIVE))
        .join(' '));

      const narrativeHit = narratives.includes(q);

      return clientHit || roleHit || notesHit || narrativeHit;
    };


    const byOrigin  = r => !originatorFilter || r.ORIGINATOR    === originatorFilter;
    const byPartner = r => !partnerFilter   || r.CLIENTPARTNER === partnerFilter;
    const byManager = r => !managerFilter   || r.CLIENTMANAGER === managerFilter;

    const byReal    = r => {
      if (!realOp || realVal1 === '') return true;
      const pct = (r.BILLED / (r.WIP || 1)) * 100;
      const v   = Math.round(pct);

      switch (realOp) {
        case 'lt' : return v <  +realVal1;
        case 'lte': return v <= +realVal1;
        case 'eq' : return v === +realVal1;
        case 'gte': return v >= +realVal1;
        case 'gt' : return v >  +realVal1;
        case 'btw':
          if (realVal2 === '') return true;
          const min = Math.min(+realVal1, +realVal2);
          const max = Math.max(+realVal1, +realVal2);
          return v >= min && v <= max;
        default: return true;
      }
    };

    const byFinal = r => {
      if (finalFilter === 'all') return true;
      const anyFinal =
        Array.isArray(r.DRAFTDETAIL) &&
        r.DRAFTDETAIL.some(d => d.finalCheck === 'X');
      return finalFilter === 'true' ? anyFinal : !anyFinal;
    };

    const out = rows
      .filter(bySearch)
      .filter(byOrigin)
      .filter(byPartner)
      .filter(byManager)
      .filter(byReal)
      .filter(byFinal);

    console.log(`UI-FILTER ▶ ${rows.length} → ${out.length}`);
    return out;
  }, [
    rows,
    searchText,
    originatorFilter,
    partnerFilter,
    managerFilter,
    realOp,
    realVal1,
    realVal2,
    finalFilter,
  ]);

  /* >>> pageRows (NEW) >>> */
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;   // 1-based page index
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);
  /* <<< pageRows END <<< */

  /* ── events ─────────────────────────────────────────── */
  const clearFilters = () => {
    setOriginatorFilter('');
    setPartnerFilter('');
    setManagerFilter('');
    setSearchText('');
    setRealOp('');
    setRealVal1('');
    setRealVal2('');
    setFinalFilter('all');
  };

async function handleGeneratePDF(selectedIds) {

  //console.log('typeof draftindexes:', typeof selectedIds);

  //console.log(!Array.isArray(selectedIds) ? 'Array of draft indexes' : 'Not an array');

  try {
      // show global loader
      setLoading(true);
    // const stringifiedIds = JSON.stringify({selectedIds});
    console.log('Draft Indexes:', selectedIds);
    const details = await CreateBulkPrintList(selectedIds);
    console.log('List ID:', details);
    const stripQuotes = details.replaceAll('"', '');
    const download = await DownloadBulkList(stripQuotes);
    try {
const buffer = await download.arrayBuffer();
const bytes  = new Uint8Array(buffer);
console.log(bytes);
const header = new TextDecoder().decode(bytes.slice(0, 8));
console.log('PDF header:', header);
      // ➊ Create a temporary URL for the blob
      const url = window.URL.createObjectURL(download);
      window.open(url);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Download failed:', err);
    }
    // …do something with it…
  } catch (err) {
    console.error(err);
    // …show an error message…
  } finally {
      // hide loader once done (success or fail)
      setLoading(false);
    }

}

  /* >>> SelectScopeModal component (NEW) >>> */
  function SelectScopeModal({ visibleCount, totalCount, onSelectVisible, onSelectAll, onClose }) {
    if (!showScopeModal) return null;

    return (
      <div className="scope-modal-backdrop" onClick={onClose}>
        <div className="scope-modal" onClick={e => e.stopPropagation()}>
          {/* mascot */}
          <div className="botfield-container modal-bot">
            <video
              className="keith-bot-icon"
              src="https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/kbWaving.mp4"
              autoPlay loop muted playsInline
            />
          </div>

          <h3>Select rows to act on</h3>
          <p className="scope-hint">
            Choose whether you want to select only the rows on this page or&nbsp;every row that meets your current filters.
          </p>

          <div className="scope-btn-row">
            <button className="scope-btn visible" onClick={() => { onSelectVisible(); onClose(); }}>
              Select&nbsp;Visible&nbsp;({visibleCount})
            </button>
            <button className="scope-btn all" onClick={() => { onSelectAll(); onClose(); }}>
              Select&nbsp;All&nbsp;({totalCount})
            </button>
            <button className="scope-btn cancel" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }
  /* <<< SelectScopeModal component END <<< */

  /* ── RENDER ─────────────────────────────────────────── */
  if (!ready) return <div className="loading">Authenticating…</div>;

  return (
    <div className="app-container">
      {/* show loader overlay when loading */}
      {loading && <Loader />}
      <Sidebar />
      <TopBar />

      <main className="main-content existing-drafts">

        <div className="filter-bar">
          <select className="role-select originator" value={originatorFilter} onChange={e => setOriginatorFilter(e.target.value)}>
            <option value="">All Originators</option>
            {originatorOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>

          <select className="role-select partner" value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}>
            <option value="">All Partners</option>
            {partnerOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select className="role-select manager" value={managerFilter} onChange={e => setManagerFilter(e.target.value)}>
            <option value="">All Managers</option>
            {managerOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          {/* Realization % (styled as a pill group) */}
          <div className="real-filter">
            <select
              className="pill-select"
              value={realOp}
              onChange={onChangeRealOp}
            >
              <option value="">Real. % Filter</option>
              <option value="lt">Less&nbsp;Than</option>
              <option value="lte">≤</option>
              <option value="eq">Equals</option>
              <option value="gte">≥</option>
              <option value="gt">Greater&nbsp;Than</option>
              <option value="btw">Between</option>
            </select>

            {/* only show inputs once an operator is chosen */}
            {realOp && (
              <>
                <input
                  type="number"
                  className="pill-input pct"
                  placeholder={realOp === 'btw' ? 'min %' : '%'}
                  value={realVal1}
                  onChange={e => setRealVal1(e.target.value)}
                  min="0"
                  max="100"
                  step="1"
                  inputMode="numeric"
                />

                {realOp === 'btw' && (
                  <input
                    type="number"
                    className="pill-input pct"
                    placeholder="max %"
                    value={realVal2}
                    onChange={e => setRealVal2(e.target.value)}
                    min="0"
                    max="100"
                    step="1"
                    inputMode="numeric"
                  />
                )}
              </>
            )}
          </div>
          {/* Jobs in Finalization */}
          <div className="finalization-filter">
            <label className="sr-only" htmlFor="finalFilter">Jobs in Finalization</label>
            <select
              id="finalFilter"
              className="pill-select"
              value={finalFilter}
              onChange={e => setFinalFilter(e.target.value)}
              title="Jobs in Finalization"
            >
              <option value="all">All Drafts</option>
              <option value="true">Drafts w/ Jobs Nearing End</option>
            </select>
          </div>



          {/* RESET (filters + selections) */}
          <button
            className={`reset-btn ${hasChanges ? 'active' : ''}`}
            disabled={!hasChanges}
            onClick={resetFiltersAndSelections}
          >
            Reset
          </button>

          {/* GENERATE with tiny “X” when active */}
          <span className="generate-wrap">
            <button
              className={`generate-btn ${selectedIds.size ? 'active' : ''}`}
              disabled={!selectedIds.size}
              onClick={() => handleGeneratePDF(Array.from(selectedIds))}
            >
              Generate PDF{selectedIds.size === 1 ? '' : 's'} ({selectedIds.size || 0})
            </button>

            {selectedIds.size > 0 && (
              <button
                className="clear-sel-btn"
                aria-label="Clear selections"
                onClick={clearAll}
              >
                ×
              </button>
            )}
          </span>
        {/* ── Bill Through (UI-only) ───────────────────────────── */}
      <div className="billthrough ml-auto">
        <span className="bt-label">Bill Through:</span>
        <button
          type="button"
          className={`bt-display ${!isSuperUser ? 'readonly' : ''}`}
          onClick={() => isSuperUser && setBtOpen(v => !v)}
          aria-haspopup="dialog"
          aria-expanded={btOpen && isSuperUser}
          title={isSuperUser ? 'Choose bill-through date' : 'Bill-through date (read-only)'}
        >

          {fmtMMDDYYYY(billThrough)}
          <svg className="bt-cal" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <rect x="3" y="4" width="18" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="8" y1="2.5" x2="8" y2="5.5" stroke="currentColor" strokeWidth="1.5" />
            <line x1="16" y1="2.5" x2="16" y2="5.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        {btOpen && (
          <div className="bt-popover" role="dialog" aria-label="Choose bill-through date">
            <div className="bt-head">
              <button type="button" className="bt-nav" onClick={btPrev} aria-label="Previous month">‹</button>
              <div className="bt-title">{btTitle}</div>
              <button type="button" className="bt-nav" onClick={btNext} aria-label="Next month">›</button>
            </div>

            <div className="bt-grid">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} className="bt-dow">{d}</div>
              ))}
              {btGrid.map((cell, i) => (
                <button
                  key={i}
                  type="button"
                  className={`bt-day ${cell.muted ? 'muted' : ''}`}
                  disabled={!isSuperUser}
                  onClick={async () => {
                    if (!isSuperUser) return;  // extra guard
                    const picked = cell.date;
                    const iso = toIsoYmd(picked);
                    try {
                      setLoading(true);
                      // (a) write blob
                      await SetBillThroughBlob({ billThroughDate: iso, updatedBy: email });
                      // (b) update UI + close popover
                      setBillThrough(picked);
                      setBtMonth(new Date(picked.getFullYear(), picked.getMonth(), 1));
                      setBtOpen(false);
                      // (c) refresh data using the new ISO date
                      const [dRes, gRes, wipRes] = await Promise.allSettled([
                        GetDrafts(iso),
                        GetGranularJobData(iso),
                        GetGranularWIPData(),
                      ]);
                      if (dRes.status === 'fulfilled') setRawRows(Array.isArray(dRes.value) ? dRes.value : []);
                      else console.error('GetDrafts failed after bill-through change:', dRes.reason);
                      if (gRes.status === 'fulfilled') setGranularData(Array.isArray(gRes.value) ? gRes.value : []);
                      else console.error('GetGranularJobData failed after bill-through change:', gRes.reason);
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {cell.date.getDate()}
                </button>
              ))}
            </div>

            <div className="bt-footer">
              <button type="button" className="bt-link" onClick={() => setBtMonth(new Date())}>Jump to Today</button>
              <button type="button" className="bt-link" onClick={() => setBtOpen(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
  
        </div>

        <input
          type="text" className="search-input"
          placeholder="Search code, name, roles, notes, or narratives…"
          value={searchText} onChange={e => setSearchText(e.target.value)}
        />

        <div className="table-section">
          <GeneralDataTable
            keyField="DRAFTFEEIDX"
            data={filteredRows}
            columns={columns}
            progressPending={loading}
            pagination
            paginationPerPage={rowsPerPage}
            onChangePage={page => setCurrentPage(page)}
            onChangeRowsPerPage={(num, page) => {
              setRowsPerPage(num);
              setCurrentPage(page);
            }}
            highlightOnHover
            striped
            expandableRows
            expandableRowsComponent={Expandable}
          />
        </div>
        <SelectScopeModal
          visibleCount={pageRows.length}
          totalCount={filteredRows.length}
          onSelectVisible={() => toggleMany(pageRows.map(r => r.DRAFTFEEIDX))}
          onSelectAll  ={() => toggleMany(filteredRows.map(r => r.DRAFTFEEIDX))}
          onClose={() => {
          setShowScopeModal(false);
          /* reset the header checkbox visual state */
          if (headerCbRef.current) {
            headerCbRef.current.checked       = false;
            headerCbRef.current.indeterminate = false;
          }
        }}
        /> 
      </main>
    </div>
  );
}
