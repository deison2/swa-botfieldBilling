import { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import GeneralDataTable from '../components/DataTable';
import { GetBillThroughBlob, SetBillThroughBlob, GetGranularJobData } from '../services/ExistingDraftsService';
import { toast } from 'react-toastify';
import {
  readTechFeeData, writeTechFeeData,
  readAuditRecords, writeAuditRecords,
  createForcedTechFees
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

const FORCE_CURRENCY_COLS = new Set([
  'CYWIPOutstanding', 'CYWIPExp', 'CYBilled', 'CYWIPTime',
].map(k => k.toLowerCase()));

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

  // Force Tech Fee modal
  const [showForceModal, setShowForceModal] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);
  const [granularRows, setGranularRows] = useState([]);
  const [forceSearch, setForceSearch] = useState('');
  const [forceIncludedSet, setForceIncludedSet] = useState(new Set());
  const [forceTechFeeAmounts, setForceTechFeeAmounts] = useState({});
  const [showForceReviewModal, setShowForceReviewModal] = useState(false);
  const [forceCreating, setForceCreating] = useState(false);

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

  const handleOpenForceModal = async () => {
    setShowForceModal(true);
    setForceLoading(true);
    setForceSearch('');
    setForceIncludedSet(new Set());
    setForceTechFeeAmounts({});
    setShowForceReviewModal(false);
    try {
      const data = await GetGranularJobData(billThrough);
      const mapped = Array.isArray(data) ? data.map((r, i) => ({ ...r, _rowIdx: i })) : [];
      setGranularRows(mapped);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load granular job data.');
    } finally {
      setForceLoading(false);
    }
  };

  const toggleForceInclude = useCallback((idx) => {
    setForceIncludedSet(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
        setForceTechFeeAmounts(prev2 => { const a = { ...prev2 }; delete a[idx]; return a; });
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const handleReviewForce = () => {
    const includedRows = granularRows.filter(r => forceIncludedSet.has(r._rowIdx));
    if (includedRows.length === 0) {
      toast.warn('No jobs are included to receive a tech fee.');
      return;
    }
    const badRows = includedRows.filter(r => {
      const amt = forceTechFeeAmounts[r._rowIdx];
      return !amt || Number(amt) === 0;
    });
    if (badRows.length > 0) {
      badRows.forEach(r => {
        const code = r.ClientCode ?? '';
        const name = r.ClientName ?? '';
        const job  = r.Job_Name ?? r.Job_Idx ?? 'Unknown Job';
        const label = [code, name].filter(Boolean).join(' ');
        toast.warn(`${label}'s ${job} has an empty or zero entry.`);
      });
      return;
    }
    setShowForceReviewModal(true);
  };

  const handleCreateForcedTechFees = async () => {
    setForceCreating(true);
    try {
      const forcedTechFeePopulation = granularRows
        .filter(r => forceIncludedSet.has(r._rowIdx))
        .map(r => ({
          Job_Idx: r.Job_Idx,
          TechFeeAmount: Number(forceTechFeeAmounts[r._rowIdx]),
        }));

      const newAuditRecord = {
        auditDate: new Date().toISOString(),
        user: email,
        status: 'Running',
        filteredPopulation: [],
        exclusionPopulation: [],
        forcedTechFeePopulation,
      };

      await createForcedTechFees({ record: newAuditRecord });
      setAuditRecords(prev => [...prev, newAuditRecord]);

      toast.success('Forced tech fees created successfully.');
      setShowForceReviewModal(false);
      setShowForceModal(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to create forced tech fees.');
    } finally {
      setForceCreating(false);
    }
  };

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

  const allUnchecked = includedSet.size === 0;

  const handleUncheckAll = () => {
    if (allUnchecked) {
      setIncludedSet(new Set(rows.map(r => r._rowIdx)));
      setExcludedSet(new Set());
    } else {
      setIncludedSet(new Set());
      setExcludedSet(new Set());
    }
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

  const forceFiltered = useMemo(() => {
    const s = forceSearch.trim().toLowerCase();
    const base = s
      ? granularRows.filter(r => Object.values(r).join(' ').toLowerCase().includes(s))
      : granularRows;
    return [...base].sort((a, b) => {
      const aIn = forceIncludedSet.has(a._rowIdx) ? 0 : 1;
      const bIn = forceIncludedSet.has(b._rowIdx) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;
      const aCode = (a.ClientCode ?? a.clientcode ?? '').toString();
      const bCode = (b.ClientCode ?? b.clientcode ?? '').toString();
      return aCode.localeCompare(bCode);
    });
  }, [granularRows, forceSearch, forceIncludedSet]);

  const forceIncludedRows = useMemo(
    () => granularRows.filter(r => forceIncludedSet.has(r._rowIdx)),
    [granularRows, forceIncludedSet]
  );

  const forceDataCols = useMemo(() => {
    if (!granularRows.length) return [];
    const FORCE_HIDDEN = new Set([
      '_rowIdx', 'job_idx', 'job_previousjob', 'job_final', 'clientpartner', 'clientmanager',
      'cybilledwdraft', 'cyrealwdraft', 'jobpartner', 'jobmanager', 'row_idx', 'clientoriginator', 'rowidx', 'row idx',
    ]);
    const normalizeKey = k => k.toLowerCase().replace(/[_ ]/g, '');
    const isHidden = k => FORCE_HIDDEN.has(k.toLowerCase()) || FORCE_HIDDEN.has(normalizeKey(k));
    const isPYCol = k => {
      const l = k.toLowerCase().replace(/[_ ]/g, '');
      return l.startsWith('py');
    };
    return Object.keys(granularRows[0])
      .filter(k => !isHidden(k) && !isPYCol(k))
      .map(k => {
        if (FORCE_CURRENCY_COLS.has(k.toLowerCase())) {
          return {
            name: COLUMN_LABELS[k] ?? fmtLabel(k),
            selector: r => r[k],
            format: r => fmtMoney(r[k]),
            sortable: true,
            right: true,
          };
        }
        return {
          name: COLUMN_LABELS[k] ?? fmtLabel(k),
          selector: r => r[k],
          format: r => (r[k] === 'NA' || r[k] === 'N/A') ? '' : r[k],
          sortable: true,
          wrap: true,
        };
      });
  }, [granularRows]);

  const forceColumns = useMemo(() => {
    const includeCol = {
      name: <span className="techfees-col-include">Include</span>,
      cell: r => (
        <input
          type="checkbox"
          checked={forceIncludedSet.has(r._rowIdx)}
          onChange={() => toggleForceInclude(r._rowIdx)}
          className="row-cb techfees-cb-include"
        />
      ),
      width: '80px',
      center: true,
      ignoreRowClick: true,
    };
    const amountCol = {
      name: 'Tech Fee Amount',
      cell: r => (
        <input
          type="number"
          className="force-fee-amount-input"
          value={forceTechFeeAmounts[r._rowIdx] ?? ''}
          onChange={e => setForceTechFeeAmounts(prev => ({ ...prev, [r._rowIdx]: e.target.value }))}
          disabled={!forceIncludedSet.has(r._rowIdx)}
          placeholder="0.00"
          min="0"
          step="0.01"
        />
      ),
      width: '150px',
      ignoreRowClick: true,
    };
    return [includeCol, ...forceDataCols, amountCol];
  }, [forceDataCols, forceIncludedSet, forceTechFeeAmounts, toggleForceInclude]);

  const forceReviewColumns = useMemo(() => {
    const amountCol = {
      name: 'Tech Fee Amount',
      selector: r => Number(forceTechFeeAmounts[r._rowIdx] ?? 0),
      format: r => fmtMoney(Number(forceTechFeeAmounts[r._rowIdx] ?? 0)),
      sortable: true,
      right: true,
    };
    return [...forceDataCols, amountCol];
  }, [forceDataCols, forceTechFeeAmounts]);

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
              >
                <option value="">All Partners</option>
                {partnerOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <select
                className="techfees-select"
                value={managerFilter}
                onChange={e => setManagerFilter(e.target.value)}
              >
                <option value="">All Managers</option>
                {managerOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>

              <button
                type="button"
                className="techfees-btn--secondary"
                onClick={handleUncheckAll}
                disabled={loading || writing}
              >
                {allUnchecked ? 'Check All' : 'Uncheck All'}
              </button>

              {billingSuperUser && (
                <button
                  type="button"
                  className="techfees-btn--secondary"
                  onClick={handleOpenForceModal}
                  disabled={loading || writing}
                >
                  Force Tech Fee
                </button>
              )}

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

      {/* ── Force Tech Fee Modal ───────────────────────────────── */}
      {showForceModal && !showForceReviewModal && (
        <div className="force-modal-backdrop">
          <div className="force-modal">
            <div className="force-modal-header">
              <h2 className="force-modal-title">Force Tech Fee</h2>
              <button
                type="button"
                className="force-modal-close"
                onClick={() => setShowForceModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="force-modal-search-bar">
              <input
                type="text"
                className="techfees-search"
                placeholder="Search…"
                value={forceSearch}
                onChange={e => setForceSearch(e.target.value)}
              />
            </div>

            <div className="force-modal-table">
              <GeneralDataTable
                columns={forceColumns}
                data={forceFiltered}
                progressPending={forceLoading}
                pagination
                noDataComponent={<span className="no-rows">No granular job data to display.</span>}
              />
            </div>

            <div className="force-modal-footer">
              <button
                type="button"
                className="techfees-btn--secondary"
                onClick={() => setShowForceModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="create-draft-trigger-btn"
                onClick={handleReviewForce}
                disabled={forceLoading}
              >
                Review Forced Tech Fees
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Force Tech Fee Review Modal ────────────────────────── */}
      {showForceModal && showForceReviewModal && (
        <div className="force-modal-backdrop">
          <div className="force-modal force-modal--review">
            <div className="force-modal-header">
              <h2 className="force-modal-title">Review Forced Tech Fees</h2>
            </div>

            <div className="force-modal-table">
              <GeneralDataTable
                columns={forceReviewColumns}
                data={forceIncludedRows}
                pagination
                noDataComponent={<span className="no-rows">No rows selected.</span>}
              />
            </div>

            <div className="force-modal-footer">
              <button
                type="button"
                className="techfees-btn--secondary"
                onClick={() => setShowForceReviewModal(false)}
                disabled={forceCreating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="create-draft-trigger-btn"
                onClick={handleCreateForcedTechFees}
                disabled={forceCreating}
              >
                {forceCreating ? 'Creating…' : 'Create Forced Tech Fees'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
