import { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import GeneralDataTable from '../../components/DataTable';
import TopBar from '../../components/TopBar';
import './OfficePartnerClientStandards.css';

import { getStandards, updateStandards } from '../../services/OfficePartnerClientStandards';

// --- constants ---
const MIN_QUERY_LEN = 3;

// --- small debounce hook ---
function useDebouncedValue(value, delay = 500) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ClientStandards() {
  // Data state
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search state
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 500);

  // Misc
  const hasMinChars = (debouncedSearch.trim().length >= MIN_QUERY_LEN);
  const tableContainerRef = useRef(null);
  const requestIdRef = useRef(0); // avoid race conditions

  // Helpers
  const normalizeRows = (data) => {
    return (data || []).map((d) => {
      // prefer scalar value returned by the backend
      let v = d.value;

      // backward-compat: if no `value`, try to pull it from `standards`
      if (v == null && Array.isArray(d.standards)) {
        const first = d.standards[0];
        v = (first && typeof first === 'object') ? first.value : first;
      }

      // coalesce to '' for the input
      const display = v == null ? '' : String(v);
      return { ...d, value: display };
    });
  };

  // Search-driven loader (initially empty; only load when ≥ MIN_QUERY_LEN)
  useEffect(() => {
    let active = true;
    const reqId = ++requestIdRef.current;

    const run = async () => {
      setError('');

      const q = debouncedSearch.trim();

      // Not enough characters → blank table & stop
      if (q.length < MIN_QUERY_LEN) {
        if (!active || reqId !== requestIdRef.current) return;
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // IMPORTANT: call getStandards with the user's search text
        // If your service expects a different signature, adapt this call.
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

  // Updates (leave last column behavior the same)
  async function handleUpdate(ClientCode, newValue) {
    // optimistic UI
    setRows((prev) =>
      prev.map((r) => (r.ClientCode === ClientCode ? { ...r, value: newValue } : r))
    );
    try {
      await updateStandards('client', ClientCode, newValue);
    } catch (e) {
      console.error('Update client Standard error:', e);
    }
  }

  // Columns (last column unchanged)
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
        name: 'Client Standard',
        grow: 1,
        sortable: true,
        selector: (row) => Number.parseFloat(row.value) || 0, // numeric sort
        cell: (row) => {
          const clientCode = row.ClientCode;
          const raw = row.value ?? '';
          const num = Number.parseFloat(String(raw));
          const invalid = raw !== '' && (!Number.isFinite(num) || num < 0 || num > 100);

          // helpers
          const toNumber = (s) => {
            const n = Number.parseFloat(String(s).replace(/[^0-9.+-]/g, ''));
            return Number.isFinite(n) ? n : '';
          };
          const clamp = (n, min = 0, max = 150) => Math.min(max, Math.max(min, n));

          const stepValue = (current, step) => {
            const val = toNumber(current);
            if (val === '') return step > 0 ? step : 0;
            return clamp(val + step, 0, 150);
          };

          return (
            <div className={`percent-field ${invalid ? 'is-invalid' : ''}`}>
              <input
                className="percent-input"
                type="number"
                inputMode="decimal"
                min={0}
                max={150}
                step={1}
                placeholder=""
                aria-label="Client standard percentage"
                value={raw}
                onChange={(e) => {
                  const val = e.target.value; // keep raw while typing
                  setRows((prev) =>
                    prev.map((r) => (r.ClientCode === clientCode ? { ...r, value: val } : r))
                  );
                }}
                onBlur={(e) => {
                  const n = toNumber(e.target.value);
                  const clamped = n === '' ? '' : clamp(n);
                  const display = clamped === '' ? '' : clamped.toFixed(2);
                  setRows((prev) =>
                    prev.map((r) => (r.ClientCode === clientCode ? { ...r, value: display } : r))
                  );
                  if (display !== '') {
                    handleUpdate(clientCode, Number(display));
                  } else {
                    handleUpdate(clientCode, null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const base = e.shiftKey ? 5 : e.altKey ? 0.1 : 1; // Shift=±5, Alt=±0.1
                    const next = stepValue(raw, e.key === 'ArrowUp' ? base : -base);
                    const display = Number.isFinite(next) ? next.toFixed(2) : '';
                    setRows((prev) =>
                      prev.map((r) => (r.ClientCode === clientCode ? { ...r, value: display } : r))
                    );
                  }
                }}
              />
              <span className="percent-suffix">%</span>
            </div>
          );
        },
      },
    ];
  }, []);

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
    </div>
  );
}
