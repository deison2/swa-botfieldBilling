/*************************************************************************
 * ExistingDrafts.js  – 2025-07-25
 *************************************************************************/

import { useState, useMemo } from 'react';

import Sidebar          from '../components/Sidebar';
import TopBar           from '../components/TopBar';
import GeneralDataTable from '../components/DataTable';

import sampleDrafts     from '../devSampleData/sampleExistingDrafts.json';
import { useAuth }      from '../auth/AuthContext';
import './ExistingDrafts.css';

/* ─── helpers ─────────────────────────────────────────────────────── */
const currency = n =>
  new Intl.NumberFormat('en-US', { style : 'currency', currency : 'USD' })
    .format(n ?? 0);

/* ─── page ────────────────────────────────────────────────────────── */
export default function ExistingDrafts() {
  /* ── AUTH ───────────────────────────────────────────────────── */
  const { ready, principal, isSuperUser } = useAuth();
  const email = principal?.userDetails?.toLowerCase() || '';

  /* ── RAW DATA  (dev stub) ───────────────────────────────────── */
  const [rawRows] = useState(sampleDrafts);
  const [loading] = useState(false);

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

  /* ── FILTER STATE ──────────────────────────────────────────── */
  const [originatorFilter, setOriginatorFilter] = useState('');
  const [partnerFilter,   setPartnerFilter]     = useState('');
  const [managerFilter,   setManagerFilter]     = useState('');
  const [searchText,      setSearchText]        = useState('');
  const [realOp,          setRealOp]            = useState('');
  const [realVal1,        setRealVal1]          = useState('');
  const [realVal2,        setRealVal2]          = useState('');

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
    { name : 'Code',      width:'150px', grow:2, sortable:true,
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
    { name : 'Actions',   width:'60px', ignoreRowClick:true, button:true,
      cell : r => (
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
  const handleGeneratePDF = () =>
    console.log('TODO – merge PDFs & email to billing@bmss.com');

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

          <button onClick={clearFilters}>Reset</button>
          <button onClick={handleGeneratePDF}>Generate PDF(s)</button>
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
            highlightOnHover
            striped
            expandableRows
            expandableRowsComponent={Expandable}
          />
        </div>
      </main>
    </div>
  );
}