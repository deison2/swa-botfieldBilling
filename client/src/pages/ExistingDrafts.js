/*************************************************************************
 * ExistingDrafts.js  – 2025-07-25
 *************************************************************************/

import React, { useState, useMemo, useRef, useEffect } from 'react';

import Sidebar          from '../components/Sidebar';
import TopBar           from '../components/TopBar';
import GeneralDataTable from '../components/DataTable';

import sampleDrafts     from '../devSampleData/sampleExistingDrafts.json';
import { useAuth }      from '../auth/AuthContext';
import './ExistingDrafts.css';
//import { getJobDetails } from '../services/PE - Get Job Details'; // Used for PE API config testing purposes
import {
  CreateBulkPrintList,
  DownloadBulkList,
  GetDrafts,
  GetGranularJobData
} from '../services/ExistingDraftsService';
import Loader           from '../components/Loader';
import { createPortal } from "react-dom";

export function PopoverPortal({ open, children }) {
  if (!open) return null;
  return createPortal(children, document.body);
}

const drafts = await GetDrafts()
  .catch(err => {
    console.error(err);
    return sampleDrafts;
  });

const granularData = await GetGranularJobData();
console.log(granularData);

/* ─── helpers ─────────────────────────────────────────────────────── */
const currency = n =>
  new Intl.NumberFormat('en-US', { style : 'currency', currency : 'USD' })
    .format(n ?? 0);

/* ─── page ────────────────────────────────────────────────────────── */
export default function ExistingDrafts() {

 //const sampleDraftIndexes = [94929]

  /* ── AUTH ───────────────────────────────────────────────────── */
  const { ready, principal, isSuperUser } = useAuth();
  const email = principal?.userDetails?.toLowerCase() || '';

  /* ── RAW DATA  (dev stub) ───────────────────────────────────── */
  const [rawRows]      = useState(drafts);
  // global loader state
  const [loading, setLoading] = useState(false);

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

  /* ── FILTER STATE ──────────────────────────────────────────── */
  const [originatorFilter, setOriginatorFilter] = useState('');
  const [partnerFilter,   setPartnerFilter]     = useState('');
  const [managerFilter,   setManagerFilter]     = useState('');
  const [searchText,      setSearchText]        = useState('');
  const [realOp,          setRealOp]            = useState('');
  const [realVal1,        setRealVal1]          = useState('');
  const [realVal2,        setRealVal2]          = useState('');

  /* >>> hasChanges (NEW) – any filters OR any selections >>> */
  const hasChanges =
    selectedIds.size > 0 ||
    searchText            ||
    originatorFilter      ||
    partnerFilter         ||
    managerFilter         ||
    realOp;               // if realOp is set, at least one real% filter box is active
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
    return (
      <div className="chip-container row-chip">
        {visible.map(c => (
          <span key={c.code + field} className="chip">{c[field]}</span>
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
    width : '60px',
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
    { name : 'Code',      width:'125px', grow:2, sortable:true,
      cell : r => <ChipSet items={r.CLIENTS} field="code" /> },
    { name : 'Name',      grow:1.5, sortable:true,
      cell : r => <ChipSet items={r.CLIENTS} field="name" /> },
    { name : 'Office',    selector: r => r.CLIENTOFFICE, sortable:true, width:'80px', grow: 0.5 },
    { name : 'WIP',       selector: r => r.WIP,    sortable:true, format: r => currency(r.WIP) , grow: 0.4},
    { name : 'Bill',      selector: r => r.BILLED, sortable:true, format: r => currency(r.BILLED) , grow: 0.4},
    { name : 'W/Off',     selector: r => r.WRITEOFFUP, sortable:true,
                          format: r => currency(r.WRITEOFFUP) , grow: 0.4},
    { name : 'Real.%',    selector: r => r.BILLED / (r.WIP || 1), sortable:true,
                          format: r => `${((r.BILLED / (r.WIP || 1))*100).toFixed(1)}%`,
                          width:'90px', grow: 0.5 },
    { name : 'Draft Link', width:'150px', ignoreRowClick:true,
      cell : r => (
        <a href={r.DRAFTHYPERLINK} target="_blank" rel="noopener noreferrer" className="open-link">
          <img
            src="https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/images/ClickToOpen-PE.svg"
            alt="Open draft in Practice Engine" className="open-link-icon"
          />
        </a>
      )},
    { name : 'Actions', ignoreRowClick:true, button:true, grow: 0.5,
      cell : r => (
      <div className="action-btns">
        {/* red “Abandon” */}
        <button
          className="abandon-icon"
          title="Abandon draft"
          onClick={() => console.log('TODO – abandon draft', r.DRAFTFEEIDX)}
        >
          <svg viewBox="0 0 24 24" width="14" height="14"
              stroke="#fff" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" fill="none">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* green “Confirm” */}
        <button
          className="confirm-icon"
          title="Confirm draft"
          onClick={() => console.log('TODO – confirm draft', r.DRAFTFEEIDX)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16"
              stroke="#fff" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" fill="none">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
    )},
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

function DraftRow({ d, client, granData }) {
  const iconRef = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });

  const handleEnter = () => {
    const r = iconRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.top + window.scrollY, left: r.right + window.scrollX + 12 });
    setOpen(true);
  };
  const handleLeave = () => setOpen(false);

  return (
    <tr key={`${d.DRAFTFEEIDX}-${d.SERVPERIOD}-${d.CONTINDEX}`}
        style={d.finalCheck === 'X' ? {color: 'red'} : undefined}
        >
      <td className="icon-cell">
        <span
          ref={iconRef}
          className="magnify"
          aria-label="Preview"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          tabIndex={0}
          onFocus={handleEnter}
          onBlur={handleLeave}
        >
          🔍
        </span>

        <PopoverPortal open={open}>
          <div
            className="hover-modal-fixed"
            style={{ top: pos.top
              , left: pos.left 
              }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={handleLeave}
            role="dialog"
            aria-modal="false"
          >
            <strong>Job Data</strong>
            {granData.length ? (
              <div className="hover-list">
                {granData.map(g => <JobHoverMatrix key={g.Job_Idx} job={g} />)}
              </div>
            ) : (
              <em>No job data</em>
            )}
          </div>
        </PopoverPortal>
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
    const uniqueNarratives = Array.from(
      new Map(data.NARRATIVEDETAIL.map(n => [n.DEBTNARRINDEX, n])).values()
    );

const rows = (data.DRAFTDETAIL ?? []).toSorted((a, b) => {
  const ac = (data.codeMap[a.CONTINDEX]?.code ?? "").toString().trim();
  const bc = (data.codeMap[b.CONTINDEX]?.code ?? "").toString().trim();

  // 1) sort by Client Code (blank codes last)
  if (ac !== bc) {
    if (!ac) return 1;
    if (!bc) return -1;
    return ac.localeCompare(bc, undefined, { numeric: true, sensitivity: "base" });
  }

  // 2) then by Job Name (JOBTITLE) (blank titles last)
  const aj = (a.JOBTITLE ?? "").toString().trim();
  const bj = (b.JOBTITLE ?? "").toString().trim();

  if (aj !== bj) {
    if (!aj) return 1;
    if (!bj) return -1;
    return aj.localeCompare(bj, undefined, { numeric: true, sensitivity: "base" });
  }

  // 3) stable tiebreaker (optional)
  return String(a.SERVPERIOD ?? "").localeCompare(
    String(b.SERVPERIOD ?? ""),
    undefined,
    { numeric: true, sensitivity: "base" }
  );
});


    return (
      <div className="expanded-content">
        <h4>Draft Analysis</h4>
        <table className="mini-table">
          <thead>
            <tr>
              <th /><th>Client Code</th><th>Client Name</th><th>Service</th><th>Type</th>
              <th>Job</th><th>Draft WIP</th><th>Draft Amt</th><th>Write-Off</th>
            </tr>
          </thead>
          <tbody>



              {rows.map(d => {
    const client = data.codeMap[d.CONTINDEX] || {};
    const granData = granularData.filter(x => Number(x.Job_Idx) === Number(d.SERVPERIOD));
    return (
      <DraftRow
        key={`${d.DRAFTFEEIDX}-${d.SERVPERIOD}-${d.CONTINDEX}`}
        d={d}
        client={client}
        granData={granData}
      />
    );
  })}


          </tbody>
        </table>

        <h4>Narrative</h4>
        <table className="mini-table">
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
    );
  };

  

  /* ── UI-FILTERED rows (after search / dropdowns) ───────────── */
  const filteredRows = useMemo(() => {
    const bySearch  = r =>
      !searchText ||
      r.CLIENTS.some(c =>
        c.code.toLowerCase().includes(searchText.toLowerCase()) ||
        c.name.toLowerCase().includes(searchText.toLowerCase())
      );

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

    const out = rows
      .filter(bySearch)
      .filter(byOrigin)
      .filter(byPartner)
      .filter(byManager)
      .filter(byReal);

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

      <main className="main-content">

        <div className="filter-bar">
          <select value={originatorFilter} onChange={e => setOriginatorFilter(e.target.value)}>
            <option value="">All Originators</option>
            {originatorOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>

          <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}>
            <option value="">All Partners</option>
            {partnerOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={managerFilter} onChange={e => setManagerFilter(e.target.value)}>
            <option value="">All Managers</option>
            {managerOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={realOp} onChange={e => setRealOp(e.target.value)}>
            <option value="">Real. % Filter</option>
            <option value="lt">Less&nbsp;Than</option>
            <option value="lte">≤</option>
            <option value="eq">Equals</option>
            <option value="gte">≥</option>
            <option value="gt">Greater&nbsp;Than</option>
            <option value="btw">Between</option>
          </select>

          <input
            type="number" placeholder="%"
            value={realVal1} onChange={e => setRealVal1(e.target.value)}
            style={{ width:'80px' }}
          />
          {realOp === 'btw' && (
            <input
              type="number" placeholder="and…"
              value={realVal2} onChange={e => setRealVal2(e.target.value)}
              style={{ width:'80px' }}
            />
          )}

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
        </div>

        <input
          type="text" className="search-input"
          placeholder="Search client code or name…"
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