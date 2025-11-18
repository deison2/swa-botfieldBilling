import { useEffect, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import GeneralDataTable from '../../components/DataTable';
import TopBar from '../../components/TopBar';
import './OfficePartnerClientStandards.css';
import { useAuth } from '../../auth/AuthContext';

import { getStandards, updateStandards } from '../../services/OfficePartnerClientStandards';

export default function OfficeStandards() {
  const { isSuperUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  let alive = true;
  (async () => {
    try {
      const data = await getStandards('office');

      // Do NOT overwrite an existing scalar `value`.
      const normalized = (data || []).map(d => {
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

      if (alive) setRows(normalized);
    } catch (e) {
      console.error('getStandards error:', e);
    } finally {
      if (alive) setLoading(false);
    }
  })();
  return () => { alive = false; };
}, []);


  // Update by OfficeCode; optimistic onBlur commit
  async function handleUpdate(officeCode, newValue) {
    // optimistic UI
    setRows(prev =>
      prev.map(r => (r.OfficeCode === officeCode ? { ...r, value: newValue } : r))
    );
    try {
      await updateStandards('office', officeCode, newValue);
    } catch (e) {
      console.error('Update Office Standard error:', e);
      // (Optional) revert on error if you prefer:
      // setRows(prev => prev.map(r => (r.OfficeCode === officeCode ? { ...r, value: oldValue } : r)));
    }
  }

  const columns = [
    {
      name: 'Office',
      grow: 3,
      selector: row => row.OfficeCode,
      sortable: true,
      wrap: true,
    },
    {
  name: 'Office Standard',
  grow: 1,
  sortable: true,
  selector: row => Number.parseFloat(row.value) || 0, // numeric sort
  cell: row => {
    const officeCode = row.OfficeCode;
    const raw = row.value ?? '';
    const num = Number.parseFloat(String(raw));
    const invalid = raw !== '' && (!Number.isFinite(num) || num < 0 || num > 100);

    // helpers
    const toNumber = (s) => {
      const n = Number.parseFloat(String(s).replace(/[^0-9.+-]/g, ''));
      return Number.isFinite(n) ? n : '';
    };
    const clamp = (n, min=0, max=100) => Math.min(max, Math.max(min, n));

    const stepValue = (current, step) => {
      const val = toNumber(current);
      if (val === '') return step > 0 ? step : 0;
      return clamp((val + step), 0, 100);
    };

    return (
      <div className={`percent-field ${invalid ? 'is-invalid' : ''}`}>
        <input
          className="percent-input"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={1}
          placeholder=""
          aria-label="Office standard percentage"
          value={raw}
          disabled={!isSuperUser}
          onChange={e => {
            const val = e.target.value; // keep raw while typing
            setRows(prev =>
              prev.map(r =>
                r.OfficeCode === officeCode ? { ...r, value: val } : r
              )
            );
          }}
          onBlur={e => {
            const num = toNumber(e.target.value);
            const clamped = num === '' ? '' : clamp(num);
            const display = clamped === '' ? '' : clamped.toFixed(2);
            setRows(prev =>
              prev.map(r =>
                r.OfficeCode === officeCode ? { ...r, value: display } : r
              )
            );
            if (display !== '') {
              handleUpdate(officeCode, Number(display));
            } else {
              handleUpdate(officeCode, null);
            }
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const base = e.shiftKey ? 5 : e.altKey ? 0.1 : 1; // Shift=±5, Alt=±0.1
              const next = stepValue(raw, e.key === 'ArrowUp' ? base : -base);
              const display = Number.isFinite(next) ? next.toFixed(2) : '';
              setRows(prev =>
                prev.map(r =>
                  r.OfficeCode === officeCode ? { ...r, value: display } : r
                )
              );
            }
          }}
        />
        <span className="percent-suffix">%</span>
      </div>
    );
  },
}

,
  ];

  return (
    <div className="app-container">
      <Sidebar />
      <TopBar />

      <main className="main-content">
        <div className="table-section">
          <GeneralDataTable
            keyField="OfficeCode" 
            title="Office Standards"
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
