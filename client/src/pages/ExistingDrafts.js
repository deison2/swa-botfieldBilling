import { //useEffect,   // Commeting out because the build and deploy process fails when import not used. Not sure why, but it treats this warning as an error.
  useState, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import GeneralDataTable from '../components/DataTable';

import sampleDrafts from '../devSampleData/sampleExistingDrafts.json';          // ← testing only
import './ExistingDrafts.css';

const currency = n =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);

export default function ExistingDrafts() {
  /* ───────── raw rows (one per client code) ───────── */
  const [rawRows]  = useState(sampleDrafts);
  const [loading]  = useState(false);

  /* ───────── group by DRAFTFEEIDX ───────── */
  const rows = useMemo(() => {
    const map = new Map();

    rawRows.forEach(r => {
      const key = r.DRAFTFEEIDX;

      if (!map.has(key)) {
        map.set(key, {
          ...r,
          CLIENTS: [{ code: r.CLIENTCODE, name: r.CLIENTNAME, cont: r.CONTINDEX }],
          codeMap: { [r.CONTINDEX]: { code: r.CLIENTCODE, name: r.CLIENTNAME } },
          DRAFTDETAIL: [...r.DRAFTDETAIL],
          NARRATIVEDETAIL: [...r.NARRATIVEDETAIL],
        });
      } else {
        const agg = map.get(key);

        /* add client if new */
        if (!agg.codeMap[r.CONTINDEX]) {
          agg.CLIENTS.push({ code: r.CLIENTCODE, name: r.CLIENTNAME, cont: r.CONTINDEX });
          agg.codeMap[r.CONTINDEX] = { code: r.CLIENTCODE, name: r.CLIENTNAME };
        }

        /* merge arrays */
        agg.DRAFTDETAIL.push(...r.DRAFTDETAIL);
        agg.NARRATIVEDETAIL.push(...r.NARRATIVEDETAIL);

        /* sum totals */
        agg.BILLED          += r.BILLED;
        agg.WIP             += r.WIP;
        agg['Write Off(Up)'] += r['Write Off(Up)'];
      }
    });

    return [...map.values()];
  }, [rawRows]);

  /* ───────── filter state ───────── */
  const [originatorFilter, setOriginatorFilter] = useState('');
  const [partnerFilter,   setPartnerFilter]     = useState('');
  const [managerFilter,   setManagerFilter]     = useState('');
  const [searchText,      setSearchText]        = useState('');

  /* dropdown options */
  const originatorOptions = useMemo(
    () => [...new Set(rows.map(r => r.ORIGINATOR))].sort(), [rows]);
  const partnerOptions = useMemo(
    () => [...new Set(rows.map(r => r.CLIENTPARTNER))].sort(), [rows]);
  const managerOptions = useMemo(
    () => [...new Set(rows.map(r => r.CLIENTMANAGER))].sort(), [rows]);

  /* ───────── filtered rows ───────── */
  const filteredRows = useMemo(() => {
    return rows
      .filter(r =>
        !searchText ||
        r.CLIENTS.some(c =>
          c.code.toLowerCase().includes(searchText.toLowerCase()) ||
          c.name.toLowerCase().includes(searchText.toLowerCase())
        )
      )
      .filter(r => !originatorFilter || r.ORIGINATOR   === originatorFilter)
      .filter(r => !partnerFilter   || r.CLIENTPARTNER === partnerFilter)
      .filter(r => !managerFilter   || r.CLIENTMANAGER === managerFilter);
  }, [rows, searchText, originatorFilter, partnerFilter, managerFilter]);

  /* ───────── chips in main table ───────── */
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

  /* ───────── columns ───────── */
  const columns = [
    { name: 'Code', width: '150px', grow: 2, sortable: true, cell: r => <ChipSet items={r.CLIENTS} field="code" /> },
    { name: 'Name', grow: 3, sortable: true, cell: r => <ChipSet items={r.CLIENTS} field="name" /> },
    { name: 'Office', selector: r => r.CLIENTOFFICE, sortable: true, width: '80px' },
    { name: 'WIP', selector: r => r.WIP, sortable: true, format: r => currency(r.WIP) },
    { name: 'Bill', selector: r => r.BILLED, sortable: true, format: r => currency(r.BILLED) },
    { name: 'W/Off', selector: r => r['Write Off(Up)'], sortable: true,
      format: r => currency(r['Write Off(Up)']) },
    { name: 'Real.%', selector: r => r.BILLED / (r.WIP || 1), sortable: true,
      format: r => `${((r.BILLED / (r.WIP || 1)) * 100).toFixed(1)}%`, width: '90px' },
    { name: 'Draft Link',
      width: '150px',
      ignoreRowClick: true,
      cell: r => (
        <a
          href={r.DRAFTHYPERLINK}
          target="_blank"
          rel="noopener noreferrer"
          className="open-link"
        >
          <img
            src="https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/images/ClickToOpen-PE.svg"
            alt="Open draft in Practice Engine"
            className="open-link-icon"
          />
        </a>
      ),
    },
    { name: 'Actions',
      width: '60px',
      ignoreRowClick: true,
      button: true,
      cell: r => (
        <button
          className="abandon-icon"
          title="Abandon draft"
          onClick={() => console.log('TODO – abandon draft', r.DRAFTFEEIDX)}
        >
          {/* white “X” inside the red circle */}
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ),
    },
  ];

 /* ───────── expandable ───────── */
const Expandable = ({ data }) => {
  // unique narrative rows (dedupe by DEBTNARRINDEX)
  const uniqueNarratives = Array.from(
    new Map(data.NARRATIVEDETAIL.map(n => [n.DEBTNARRINDEX, n])).values()
  );

  return (
    <div className="expanded-content">
      <h4>Draft Analysis</h4>
      <table className="mini-table">
        <thead>
          <tr>
            <th>Client&nbsp;Code</th>
            <th>Client&nbsp;Name</th>
            <th>Job</th>
            <th>Draft&nbsp;WIP</th>
            <th>Draft&nbsp;Amt</th>
            <th>Write-Off</th>
          </tr>
        </thead>
        <tbody>
          {data.DRAFTDETAIL.map(d => {
            const client = data.codeMap[d.CONTINDEX] || {};
            return (
              <tr key={`${d.DRAFTFEEIDX}-${d.SERVPERIOD}-${d.CONTINDEX}`}>
                <td>{client.code}</td>
                <td>{client.name}</td>
                <td>{d.JOBTITLE}</td>
                <td>{currency(d.DRAFTWIP)}</td>
                <td>{currency(d.DRAFTAMOUNT)}</td>
                <td>{currency(d.WRITE_OFF_UP)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h4>Narrative</h4>
      <table className="mini-table">
        <thead>
          <tr>
            <th>Narrative</th>
            <th>Service</th>
            <th>Amount</th>
            
          </tr>
        </thead>
        <tbody>
          {uniqueNarratives.map(n => (
            <tr key={n.DEBTNARRINDEX}>
              <td
                dangerouslySetInnerHTML={{ __html: n.FEENARRATIVE }}
              />
              <td>{n.SERVINDEX}</td>
              <td>{currency(n.AMOUNT)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};


  /* ───────── handlers ───────── */
  const clearFilters = () => {
    setOriginatorFilter('');
    setPartnerFilter('');
    setManagerFilter('');
    setSearchText('');
  };
  const handleGeneratePDF = () =>
    console.log('TODO – merge PDFs & email to billing@bmss.com');

  /* ───────── render ───────── */
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
          <button onClick={clearFilters}>Reset Filters</button>
          <button onClick={handleGeneratePDF}>Generate PDF(s)</button>
        </div>

        <input
          type="text"
          className="search-input"
          placeholder="Search client code or name…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
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