/*************************************************************************
 * ExistingDrafts.js  – 2025-07-25
 *************************************************************************/

import { useState, useMemo, useRef, useEffect } from 'react';

import Sidebar          from '../components/Sidebar';
import TopBar           from '../components/TopBar';
import GeneralDataTable from '../components/DataTable';

import sampleDrafts     from '../devSampleData/sampleExistingDrafts.json';
import { useAuth }      from '../auth/AuthContext';
import './ExistingDrafts.css';
//import { getJobDetails } from '../services/PE - Get Job Details'; // Used for PE API config testing purposes
import {
  CreateBulkPrintList,
  DownloadBulkList
} from '../services/ExistingDraftsService';


/* ─── helpers ─────────────────────────────────────────────────────── */
const currency = n =>
  new Intl.NumberFormat('en-US', { style : 'currency', currency : 'USD' })
    .format(n ?? 0);

/* ─── page ────────────────────────────────────────────────────────── */
export default function ExistingDrafts() {

 // const sampleDraftIndexes = [94520, 94713]

  /* ── AUTH ───────────────────────────────────────────────────── */
  const { ready, principal, isSuperUser } = useAuth();
  const email = principal?.userDetails?.toLowerCase() || '';

  /* ── RAW DATA  (dev stub) ───────────────────────────────────── */
  const [rawRows] = useState(sampleDrafts);
  const [loading] = useState(false);

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

    if (isSuperUser) {
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
    { name : 'Name',      grow:3, sortable:true,
      cell : r => <ChipSet items={r.CLIENTS} field="name" /> },
    { name : 'Office',    selector: r => r.CLIENTOFFICE, sortable:true, width:'80px' },
    { name : 'WIP',       selector: r => r.WIP,    sortable:true, format: r => currency(r.WIP) },
    { name : 'Bill',      selector: r => r.BILLED, sortable:true, format: r => currency(r.BILLED) },
    { name : 'W/Off',     selector: r => r['Write Off(Up)'], sortable:true,
                          format: r => currency(r['Write Off(Up)']) },
    { name : 'Real.%',    selector: r => r.BILLED / (r.WIP || 1), sortable:true,
                          format: r => `${((r.BILLED / (r.WIP || 1))*100).toFixed(1)}%`,
                          width:'90px' },
    { name : 'Draft Link', width:'150px', ignoreRowClick:true,
      cell : r => (
        <a href={r.DRAFTHYPERLINK} target="_blank" rel="noopener noreferrer" className="open-link">
          <img
            src="https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/images/ClickToOpen-PE.svg"
            alt="Open draft in Practice Engine" className="open-link-icon"
          />
        </a>
      )},
    { name : 'Actions',   width:'80px', ignoreRowClick:true, button:true,
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

  /* ── EXPANDABLE row render ────────────────────────────────── */
  const Expandable = ({ data }) => {
    const uniqueNarratives = Array.from(
      new Map(data.NARRATIVEDETAIL.map(n => [n.DEBTNARRINDEX, n])).values()
    );

    return (
      <div className="expanded-content">
        <h4>Draft Analysis</h4>
        <table className="mini-table">
          <thead>
            <tr>
              <th>Client Code</th><th>Client Name</th><th>Job</th>
              <th>Draft WIP</th><th>Draft Amt</th><th>Write-Off</th>
            </tr>
          </thead>
          <tbody>
            {data.DRAFTDETAIL.map(d => {
              const client = data.codeMap[d.CONTINDEX] || {};
              return (
                <tr key={`${d.DRAFTFEEIDX}-${d.SERVPERIOD}-${d.CONTINDEX}`}>
                  <td>{client.code}</td><td>{client.name}</td><td>{d.JOBTITLE}</td>
                  <td>{currency(d.DRAFTWIP)}</td><td>{currency(d.DRAFTAMOUNT)}</td>
                  <td>{currency(d.WRITE_OFF_UP)}</td>
                </tr>
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
    // const stringifiedIds = JSON.stringify({selectedIds});
    console.log('Draft Indexes:', selectedIds);
    const details = await CreateBulkPrintList(selectedIds);
    console.log('List ID:', details);
    const download = await DownloadBulkList(details);
    try {

      // ➊ Create a temporary URL for the blob
      const url = window.URL.createObjectURL(download);

      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');  // months are 0-based
      const dd = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear(); 

      // ➋ Create and click a hidden link
      const a = document.createElement('a');
      a.href = url;
      const filename = `Draft Bills ${mm}-${dd}-${yyyy}.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // ➌ Cleanup
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
    // …do something with it…
  } catch (err) {
    console.error(err);
    // …show an error message…
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
              onClick={() => handleGeneratePDF(selectedIds)}
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