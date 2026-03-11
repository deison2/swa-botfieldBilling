import { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import GeneralDataTable from '../components/DataTable';
import { GetBillThroughBlob, SetBillThroughBlob } from '../services/ExistingDraftsService';
import {
  readTechFeeData, writeTechFeeData,
  readAuditRecords, writeAuditRecords,
} from '../services/TechFeeService';
import { useAuth } from '../auth/AuthContext';
import './ExistingDrafts.css';
import './TechFees.css';

const toIsoYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const endOfPrevMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 0);
};

const fmtLabel = (key) =>
  key.replace(/([A-Z])/g, ' $1').replace(/[_]/g, ' ').trim();

const fmtMoney = v =>
  v == null ? '–' : Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const utcToCT = (utcStr) =>
  new Date(utcStr).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

const HIDDEN_COLUMNS = new Set(['_rowIdx', 'J O B I D X', 'JOB_IDX']);

const COLUMN_LABELS = {
  WIP2DATE:     'YTD WIP',
  TECHFEE2DATE: 'Billed Tech Fee',
  TECHFEE2ADD:  'Tech Fee Calculation',
};

const CURRENCY_COLUMNS = new Set(Object.keys(COLUMN_LABELS));

const LINK_COLUMNS = new Set(['PELink']);

const PE_LOGO_SRC =
  'https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/images/PElogo.svg';

export default function TechFees() {
  const { billingSuperUser, principal } = useAuth();
  const email = principal?.userDetails || '';

  const [billThrough, setBillThrough] = useState(toIsoYmd(endOfPrevMonth()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [includedSet, setIncludedSet] = useState(new Set());
  const [excludedSet, setExcludedSet] = useState(new Set());
  const [auditRecords, setAuditRecords] = useState([]);

  const auditTruth = useMemo(() => {
    if (!auditRecords.length) return null;
    return [...auditRecords].sort(
      (a, b) => new Date(b.auditDate) - new Date(a.auditDate)
    )[0];
  }, [auditRecords]);

  const isRunning = auditTruth?.status === 'Running';

  const loadAudit = async () => {
    try {
      const records = await readAuditRecords({});
      const list = Array.isArray(records) ? records : [];
      setAuditRecords(list);
      return list.sort((a, b) => new Date(b.auditDate) - new Date(a.auditDate))[0] ?? null;
    } catch (e) {
      console.error('Failed to load audit records', e);
      return null;
    }
  };

  const loadData = async (date) => {
    setLoading(true);
    setError('');
    try {
      const result = await readTechFeeData({
        billThroughDate: date,
        filteredPopulation: [],
        exclusionPopulation: [],
      });
      const mapped = Array.isArray(result)
        ? result.map((r, i) => ({ ...r, _rowIdx: i }))
        : [];
      setRows(mapped);
      setIncludedSet(new Set(mapped.map(r => r._rowIdx)));
      setExcludedSet(new Set());
    } catch (e) {
      console.error(e);
      setError('Failed to load tech fee data.');
    } finally {
      setLoading(false);
    }
  };

  // On mount: load audit status + bill-through blob + table data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const truth = await loadAudit();
      if (truth?.status === 'Running') return;
      let date = toIsoYmd(endOfPrevMonth());
      try {
        const blob = await GetBillThroughBlob();
        if (blob?.billThroughDate) date = blob.billThroughDate;
      } catch {}
      if (cancelled) return;
      setBillThrough(date);
      await loadData(date);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => loadData(billThrough);

  const toggleInclude = useCallback((idx) => {
    setIncludedSet(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    setExcludedSet(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  }, []);

  const toggleExclude = useCallback((idx) => {
    setExcludedSet(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    setIncludedSet(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  }, []);

  const handleUncheckAll = () => {
    setIncludedSet(new Set());
    setExcludedSet(new Set());
  };

  const handleCreate = async () => {
    setWriting(true);
    setError('');
    try {
      const getClientCode = r =>
        r.CLIENTCODE ?? r.ClientCode ?? r.CLIENT_CODE ?? r.clientcode ?? '';

      const filteredPopulation = rows
        .filter(r => includedSet.has(r._rowIdx))
        .map(getClientCode);
      const exclusionPopulation = rows
        .filter(r => excludedSet.has(r._rowIdx))
        .map(getClientCode);

      // Write Running audit record — this transitions the page to the Running state
      const newAuditRecord = {
        auditDate: new Date().toISOString(),
        user: email,
        status: 'Running',
        filteredPopulation,
        exclusionPopulation,
      };
      await writeAuditRecords({ record: newAuditRecord });
      setAuditRecords(prev => [...prev, newAuditRecord]);

      // Fire the tech fee process without blocking — page is already in Running state
      writeTechFeeData({
        billThroughDate: billThrough,
        filteredPopulation,
        exclusionPopulation,
      }).catch(console.error);
    } catch (e) {
      console.error(e);
      setError('Failed to start tech fee process.');
    } finally {
      setWriting(false);
    }
  };

  const partnerOptions = useMemo(() => {
    const set = new Set(
      rows.map(r => r.BILLINGCLIENTPARTNER || r.PARTNER || r.PartnerName || r.PARTNAME || '').filter(Boolean)
    );
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const managerOptions = useMemo(() => {
    const set = new Set(
      rows.map(r => r.BILLINGCLIENTMANAGER || r.MANAGER || r.ManagerName || r.MANAGERNAME || '').filter(Boolean)
    );
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r => {
      const partner = r.BILLINGCLIENTPARTNER || r.PARTNER || r.PartnerName || r.PARTNAME || '';
      const manager = r.BILLINGCLIENTMANAGER || r.MANAGER || r.ManagerName || r.MANAGERNAME || '';
      if (partnerFilter && partner !== partnerFilter) return false;
      if (managerFilter && manager !== managerFilter) return false;
      if (!s) return true;
      return Object.values(r).join(' ').toLowerCase().includes(s);
    });
  }, [rows, search, partnerFilter, managerFilter]);

  const checkboxColumns = useMemo(() => [
    {
      name: <span className="techfees-col-include">Include</span>,
      cell: r => (
        <input
          type="checkbox"
          checked={includedSet.has(r._rowIdx)}
          onChange={() => toggleInclude(r._rowIdx)}
          className="row-cb techfees-cb-include"
        />
      ),
      width: '80px',
      center: true,
      ignoreRowClick: true,
    },
    {
      name: 'Exclude',
      cell: r => (
        <input
          type="checkbox"
          checked={excludedSet.has(r._rowIdx)}
          onChange={() => toggleExclude(r._rowIdx)}
          className="row-cb"
        />
      ),
      width: '80px',
      center: true,
      ignoreRowClick: true,
    },
  ], [includedSet, excludedSet, toggleInclude, toggleExclude]);

  const dataColumns = useMemo(() => {
    if (!rows.length) return [];
    return Object.keys(rows[0])
      .filter(key => !HIDDEN_COLUMNS.has(key))
      .map(key => {
        if (LINK_COLUMNS.has(key)) {
          return {
            name: 'PE Link',
            cell: r => {
              const href = r[key];
              if (!href) return null;
              return (
                <a
                  className="pe-link-btn"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in Practice Engine"
                  aria-label="Open in Practice Engine"
                >
                  <img className="pe-logo" src={PE_LOGO_SRC} alt="PE" />
                </a>
              );
            },
            width: '90px',
            center: true,
            ignoreRowClick: true,
          };
        }
        if (CURRENCY_COLUMNS.has(key)) {
          return {
            name: COLUMN_LABELS[key],
            selector: r => r[key],
            format: r => fmtMoney(r[key]),
            sortable: true,
            right: true,
          };
        }
        return {
          name: COLUMN_LABELS[key] ?? fmtLabel(key),
          selector: r => r[key],
          sortable: true,
          wrap: true,
        };
      });
  }, [rows]);

  const columns = useMemo(() => [...checkboxColumns, ...dataColumns], [checkboxColumns, dataColumns]);

  return (
    <div className="app-container">
      {loading && <div className="loader-overlay" aria-live="polite" />}
      <Sidebar />
      <TopBar />

      <main className="main-content techfees">
        {isRunning ? (
          <div className="techfees-running-overlay">
            <div className="techfees-running-card">
              <div className="techfees-running-icon">⚙️</div>
              <h2 className="techfees-running-title">Tech Fee Process Running</h2>
              <p className="techfees-running-body">
                This process was triggered by <strong>{auditTruth.user}</strong>
                {' '}on <strong>{utcToCT(auditTruth.auditDate)} CT</strong>.
              </p>
              <p className="techfees-running-note">
                The page will become available and a notification will be sent to billing@bmss.com once the process completes.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="filter-bar">
              <input
                type="text"
                className="techfees-search"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              <select
                className="techfees-select"
                value={partnerFilter}
                onChange={e => setPartnerFilter(e.target.value)}
                disabled={!partnerOptions.length}
              >
                <option value="">All Partners</option>
                {partnerOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <select
                className="techfees-select"
                value={managerFilter}
                onChange={e => setManagerFilter(e.target.value)}
                disabled={!managerOptions.length}
              >
                <option value="">All Managers</option>
                {managerOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>

              <button
                type="button"
                className="techfees-btn--secondary"
                onClick={handleRefresh}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Refresh'}
              </button>

              <button
                type="button"
                className="techfees-btn--secondary"
                onClick={handleUncheckAll}
                disabled={loading || writing}
              >
                Uncheck All
              </button>

              {billingSuperUser && (
                <button
                  type="button"
                  className="create-draft-trigger-btn"
                  onClick={handleCreate}
                  disabled={writing || loading || includedSet.size === 0}
                >
                  {writing ? 'Creating…' : `Create Tech Fees (${includedSet.size})`}
                </button>
              )}

              <div className="techfees-date-wrap">
                <span className="techfees-date-label">Bill Through</span>
                <input
                  type="date"
                  className="techfees-date-input"
                  value={billThrough}
                  onChange={e => {
                    const newDate = e.target.value;
                    setBillThrough(newDate);
                    SetBillThroughBlob({ billThroughDate: newDate }).catch(console.error);
                  }}
                />
              </div>
            </div>

            {error && <div className="techfees-error">{error}</div>}

            <div className="table-section">
              <GeneralDataTable
                columns={columns}
                data={filtered}
                progressPending={loading}
                pagination
                noDataComponent={<span className="no-rows">No tech fee data to display.</span>}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
