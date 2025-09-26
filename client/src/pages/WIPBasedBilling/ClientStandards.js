import { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import GeneralDataTable from '../../components/DataTable';
import TopBar from '../../components/TopBar';
import './OfficePartnerClientStandards.css';

import { getStandards, updateStandards } from '../../services/OfficePartnerClientStandards';

// --- constants ---
const MIN_QUERY_LEN = 3;
const SERVICES = [
  'ALL','ACCTG','ATTEST','AUDIT','BUSTAX','EOS','ESTATE','GCC','HR',
  'INDTAX','MAS','NFP','SALT','TAS','TAS TAX','VAL'
];

// --- small debounce hook ---
function useDebouncedValue(value, delay = 500) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// --- Modal ---
function EditClientStandardModal({ open, onClose, client, onSaved }) {
  const [rows, setRows] = useState(() => SERVICES.map(s => ({ serv: s, value: '' })));
  const [initialMap, setInitialMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toNumOrNull = (v) => {
    if (v === '' || v == null) return null;
    const n = Number.parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };
  const fmt = (n) => (n == null ? '' : Number(n).toFixed(2));

  // load values for this client
  useEffect(() => {
    let active = true;
    async function load() {
      if (!open || !client?.ClientCode) return;
      setLoading(true);
      setError('');

      try {
        const data = await getStandards('client', client.ClientCode);

        // Build map SERV -> value
        const apiMap = {};
        for (const r of (data || [])) {
          const key = (r.popServ ?? r.blobServ ?? r.serv ?? '').toUpperCase();
          let v = r.value;
          if (v == null && Array.isArray(r.standards)) {
            const first = r.standards[0];
            v = (first && typeof first === 'object') ? first.value : first;
          }
          apiMap[key] = v == null ? '' : String(v);
        }

        const grid = SERVICES.map(s => ({
          serv: s,
          value: fmt(toNumOrNull(apiMap[s]))
        }));

        if (active) {
          setRows(grid);
          setInitialMap(grid.reduce((acc, r) => {
            acc[r.serv] = r.value;
            return acc;
          }, {}));
        }
      } catch (e) {
        console.error('load error', e);
        if (active) setError('Failed to load standards.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [open, client?.ClientCode]);

  const hasChanges = useMemo(() => {
    for (const r of rows) {
      if ((initialMap[r.serv] ?? '') !== (r.value ?? '')) return true;
    }
    return false;
  }, [rows, initialMap]);

  const onChangeCell = (serv, val) => {
    setRows(prev => prev.map(r => r.serv === serv ? { ...r, value: val } : r));
  };

  const saveChanges = async () => {
    if (!client?.ClientCode) return;
    setSaving(true);
    try {
      let changed = 0;
      for (const r of rows) {
        const before = initialMap[r.serv] ?? '';
        const after = r.value ?? '';
        if (before === after) continue;
        const num = toNumOrNull(after);
        await updateStandards('client', client.ClientCode, r.serv, num);
        changed++;
      }
      setInitialMap(rows.reduce((acc, r) => { acc[r.serv] = r.value; return acc; }, {}));
      onSaved?.(changed);
      onClose();
    } catch (e) {
      console.error('save error', e);
      setError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Edit Client Standards by Service</h3>
          <div className="modal-sub">
            {client?.ClientCode} — {client?.ClientName ?? ''}
          </div>
        </div>

        {error && <div className="bg-error" style={{ margin: '8px 0' }}>{error}</div>}

        <div className="modal-body">
          {loading ? (
            <div>Loading…</div>
          ) : (
            <table className="service-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th style={{ textAlign: 'right' }}>Standard (%)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ serv, value }) => (
                  <tr key={serv}>
                    <td>{serv}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="percent-field">
                        <input
                          className="percent-input"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={150}
                          step={1}
                          value={value}
                          onChange={(e) => onChangeCell(serv, e.target.value)}
                          onBlur={(e) => {
                            const n = Number.parseFloat(e.target.value);
                            const v = Number.isFinite(n) ? n.toFixed(2) : (e.target.value === '' ? '' : value);
                            onChangeCell(serv, v);
                          }}
                        />
                        <span className="percent-suffix">%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="buttons">
          <button onClick={onClose} disabled={saving}>Cancel</button>
          <button onClick={saveChanges} disabled={saving || loading || !hasChanges}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientStandards() {
  // Data state
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search state
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 500);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [activeClient, setActiveClient] = useState(null);

  // Misc
  const hasMinChars = (debouncedSearch.trim().length >= MIN_QUERY_LEN);
  const tableContainerRef = useRef(null);
  const requestIdRef = useRef(0);

  // Helpers
  const normalizeRows = (data) => {
    return (data || []).map((d) => {
      let v = d.value;
      if (v == null && Array.isArray(d.standards)) {
        const first = d.standards[0];
        v = (first && typeof first === 'object') ? first.value : first;
      }
      const display = v == null ? '' : String(v);
      return { ...d, value: display };
    });
  };

  // Search-driven loader
  useEffect(() => {
    let active = true;
    const reqId = ++requestIdRef.current;

    const run = async () => {
      setError('');
      const q = debouncedSearch.trim();

      if (q.length < MIN_QUERY_LEN) {
        if (!active || reqId !== requestIdRef.current) return;
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await getStandards('client', q);
        if (!active || reqId !== requestIdRef.current) return;
        setRows(normalizeRows(data));
      } catch (e) {
        console.error('getStandards error:', e);
        if (active && reqId === requestIdRef.current) {
          setError('Sorry—there was a problem loading client standards.');
          setRows([]);
        }
      } finally {
        if (active && reqId === requestIdRef.current) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [debouncedSearch]);

  // Optional: keep a summary column in the grid (e.g., show ALL or average)
  // For now we’ll just provide the edit button.

  const columns = useMemo(() => {
    return [
      {
        name: 'Client Code',
        grow: 0.5,
        selector: (row) => row.ClientCode,
        sortable: false,
        wrap: true,
      },
      {
        name: 'Client Name',
        grow: 2,
        selector: (row) => row.ClientName,
        sortable: false,
        wrap: true,
      },
      {
        name: 'Client Office',
        grow: 0.5,
        selector: (row) => row.ClientOffice,
        sortable: false,
        wrap: true,
      },
      {
        name: 'Client Partner',
        grow: 1,
        selector: (row) => row.ClientPartner,
        sortable: false,
        wrap: true,
      },
      {
        name: 'Client Manager',
        grow: 1,
        selector: (row) => row.ClientManager,
        sortable: false,
        wrap: true,
      },
      {
        name: 'Client Standards',
        grow: 1,
        sortable: false,
        cell: (row) => (
          <button
            className="add-narrative-btn"
            onClick={() => {
              setActiveClient(row);
              setModalOpen(true);
            }}
          >
            Edit services
          </button>
        ),
      },
    ];
  }, []);

// --- Parent component return ---
return (
  <div className="app-container">
    <Sidebar />
    <TopBar />

    <main className="main-content">
      <div className="table-section" ref={tableContainerRef}>
        <div className="bg-header">
          <h2>Client Standards</h2>
          <p className="bg-sub">Search by client code or client name. Results load as you type.</p>
        </div>

        <input
          type="text"
          placeholder={`Search clients by code or name (min ${MIN_QUERY_LEN} chars)…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-search"
        />

        {!hasMinChars && search && (
          <div className="bg-sub" style={{ marginTop: 6 }}>
            Keep typing — need at least {MIN_QUERY_LEN} characters.
          </div>
        )}

        {error && <div className="bg-error">{error}</div>}

        <GeneralDataTable
          keyField="ClientCode"
          title=""
          columns={columns}
          data={rows}
          progressPending={loading}
          pagination
          highlightOnHover
          striped
        />
      </div>
    </main>

    <EditClientStandardModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        client={activeClient}
        onSaved={(changed) => {
          if (!activeClient || !changed) return;
          // optional: refresh list
        }}
      />
    </div>
);
}