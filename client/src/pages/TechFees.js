import { useEffect, useMemo, useState, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import GeneralDataTable from '../components/DataTable';
import TopBar from '../components/TopBar';
import './WIPBasedBilling/NarrativeStandards.css';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { readPopulation, writePopulation } from '../services/TechFeesService.js';
import './ExistingDrafts.css';

function RoleChips({ partner, manager }) {
  const Item = ({ role, value, className }) => (
    <span
      className={`chip2 role ${className}`}
      data-tooltip={role}
      aria-label={role}
      title={role}
    >
      {value || '—'}
    </span>
  );

  return (
    <div className="chip2-container role-chip2-stack">
      <Item role="Client Partner" className="partner" value={partner} />
      <Item role="Client Manager" className="manager" value={manager} />
    </div>
  );
}

export default function TechFees() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [cpFilter, setCPFilter] = useState('');
  const [cmFilter, setCMFilter] = useState('');
  const [jobNameFilter, setJobNameFilter] = useState('');
  const [filterText, setFilterText] = useState('');

  const clearFilters = () => {
    setCPFilter('');
    setCMFilter('');
    setJobNameFilter('');
    setFilterText('');
  };

  const loadPopulation = useCallback(async () => {
    setLoading(true);
    try {
      const population = await readPopulation();
      setRows(Array.isArray(population) ? population : []);
    } catch (e) {
      console.error('Failed to load population:', e);
      toast.error(
        'Failed to load population - please refresh or contact the Data Analytics Team'
      );
      setRows([]); // keep it an array so the table & filters don’t crash
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPopulation();
  }, [loadPopulation]);

  const handleRefresh = useCallback(async () => {
    // If you truly want “optional confirmation”, use this.
    // Replace with your modal if you prefer.
    const ok = window.confirm('Refresh population?');
    if (!ok) return;

    await loadPopulation();
    toast.success('Population refreshed');
  }, [loadPopulation]);

  const handleGenerate = useCallback(async () => {
    const ok = window.confirm('Generate population?');
    if (!ok) return;

    setLoading(true);
    try {
      await writePopulation();     // “generate” service call
      await loadPopulation();      // re-pull after generation (usually desired)
      toast.success('Population generated');
    } catch (e) {
      console.error('Failed to generate population:', e);
      toast.error('Generate failed - please try again or contact support');
    } finally {
      setLoading(false);
    }
  }, [loadPopulation]);

  // Build dropdown options safely
  const cpOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map(r => r?.ClientPartner).filter(Boolean))
    ).sort((a, b) => String(a).localeCompare(String(b)));
  }, [rows]);

  const cmOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map(r => r?.ClientManager).filter(Boolean))
    ).sort((a, b) => String(a).localeCompare(String(b)));
  }, [rows]);

  const jobNameOptions = useMemo(() => {
    return Array.from(new Set(rows.map(r => r?.JobName).filter(Boolean))).sort(
      (a, b) => String(a).localeCompare(String(b))
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const search = filterText.trim().toLowerCase();
    const data = Array.isArray(rows) ? rows : [];

    const filtered = data
      .filter(r => {
        if (!search) return true;

        const haystack = [
          r.ClientCode,
          r.ClientName,
          r.ClientOffice,
          r.ClientPartner,
          r.ClientManager,
          r.JobName
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(search);
      })
      .filter(r => (!cpFilter ? true : r.ClientPartner === cpFilter))
      .filter(r => (!cmFilter ? true : r.ClientManager === cmFilter))
      .filter(r => (!jobNameFilter ? true : r.JobName === jobNameFilter));

    return filtered.slice().sort((a, b) => {
      const aCode = a.ClientCode || '';
      const bCode = b.ClientCode || '';
      return String(aCode).localeCompare(String(bCode));
    });
  }, [rows, filterText, cpFilter, cmFilter, jobNameFilter]);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }),
    []
  );

  const columns = useMemo(
    () => [
      {
        id: 'row-select',
        name: <input type="checkbox" className="row-cb" />,
        selector: row => row.JOB_IDX,
        width: '55px',
        ignoreRowClick: true,
        sortable: false,
        cell: row => <input type="checkbox" className="row-cb" />
      },
      {
        name: 'Client',
        selector: row => `${row.ClientCode} - ${row.ClientName}`,
        sortable: true,
        wrap: true,
        grow: 2.5,
        width: '244px',
        cell: row => (
          <div style={{ width: 244, minWidth: 244, maxWidth: 244 }}>
            <div className="chip2-container">
              <span className="chip2">
                {`${row.ClientCode} - ${row.ClientName}`}
              </span>
            </div>
          </div>
        )
      }
,
      {
        name: 'Office',
        selector: row => row.ClientOffice,
        sortable: true,
        wrap: true,
        width: '180px',
        grow: 1,
        center: true
      },
      {
        name: 'Client Roles',
        grow: 1.5,
        sortable: false,
        center: true,
        cell: r => <RoleChips partner={r.ClientPartner} manager={r.ClientManager} />
      },
      {
        name: 'Job Name',
        selector: row => row.JobName,
        sortable: true,
        wrap: true,
        width: '240px',
        grow: 1.5,
        center: true
      },
      {
        name: 'WIP to Date',
        selector: row => row.WIP2DATE ?? 0,
        sortable: true,
        right: true,
        cell: row => currency.format(row.WIP2DATE || 0)
      },
      {
        name: 'Tech Fee to Date',
        selector: row => row.TECHFEE2DATE ?? 0,
        sortable: true,
        right: true,
        cell: row => currency.format(row.TECHFEE2DATE || 0)
      },
      {
        name: 'Tech Fee to Add',
        selector: row => row.TECHFEE2ADD ?? 0,
        sortable: true,
        right: true,
        cell: row => currency.format(row.TECHFEE2ADD || 0)
      },
      {
        name: 'Broken Out Narr',
        selector: row => row.brokenOutNarr,
        sortable: true,
        wrap: true,
        width: '80px',
        grow: 0.5,
        center: true
      },
      {
      name: "Draft Link",
      width: "90px",              // optional: match your PE Link column width
      ignoreRowClick: true,
      center: true,               // keep center if you like the alignment
      button: true,               // optional, if other link columns use this
      cell: (r) => {
        const href = r?.PELink ?? "";
        if (!href) return null;

        return (
          <a
            className="pe-link-btn"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title="Open draft in Practice Engine"
            aria-label="Open draft in Practice Engine"
          >
            <img className="pe-logo" src="https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/images/PElogo.svg" alt="PE" />
          </a>
        );
      },
    }
    ],
    [currency]
  );

  return (
    <div className="app-container">
      <Sidebar />
      <TopBar />


      <main className="main-content">

        <div className="existingDrafts-page">
  <div className="ed-header-row">
    {/* ROW 1: all filters / controls */}
    <div className="ed-filters-row">
      <div className="filter-bar ed-filters"></div>

          <button type="button" className="pill-select" onClick={clearFilters}>
            Clear Filters
          </button>

          <select value={cpFilter} onChange={e => setCPFilter(e.target.value)}>
            <option value="">All CPs</option>
            {cpOptions.map(cp => (
              <option key={cp} value={cp}>
                {cp}
              </option>
            ))}
          </select>

          <select value={cmFilter} onChange={e => setCMFilter(e.target.value)}>
            <option value="">All CMs</option>
            {cmOptions.map(cm => (
              <option key={cm} value={cm}>
                {cm}
              </option>
            ))}
          </select>

          <select value={jobNameFilter} onChange={e => setJobNameFilter(e.target.value)}>
            <option value="">All Job Names</option>
            {jobNameOptions.map(jobName => (
              <option key={jobName} value={jobName}>
                {jobName}
              </option>
            ))}
          </select>

          <button type="button" className="refresh-pop-btn" onClick={handleRefresh}>
            Refresh Population
          </button>

          <button type="button" className="generate-pop-btn" onClick={handleGenerate}>
            Generate Population
          </button>
        </div>
        </div>
        </div>

        <div className="table-section">
          <input
            type="text"
            placeholder="Search population on any field…"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            style={{
              padding: '8px',
              marginBottom: '1rem',
              width: '100%',
              boxSizing: 'border-box'
            }}
          />

          <GeneralDataTable
            keyField="JOB_IDX"
            title="Tech Fees"
            columns={columns}
            data={filteredRows}
            progressPending={loading}
            pagination
            highlightOnHover
            striped
          />

          <ToastContainer position="top-right" autoClose={5000} />
        </div>
      </main>
    </div>
  );
}
