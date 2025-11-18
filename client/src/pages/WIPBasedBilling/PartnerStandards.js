import { useEffect, useState, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import GeneralDataTable from '../../components/DataTable';
import TopBar from '../../components/TopBar';
import './OfficePartnerClientStandards.css';
import { useAuth } from '../../auth/AuthContext';

import { getStandards, updateStandards } from '../../services/OfficePartnerClientStandards';

export default function PartnerStandards() {
  const { isSuperUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

    const filteredRows = useMemo(() => {
  const q = (searchText || '').trim().toLowerCase();
  if (!q) return rows;

  return rows.filter(row => {
    // Examine all values in the row. Stringify non-strings.
    for (const val of Object.values(row || {})) {
      if (val == null) continue;
      const s = typeof val === 'string' ? val : JSON.stringify(val);
      if (s.toLowerCase().includes(q)) return true;
    }
    return false;
  });
}, [rows, searchText]);

useEffect(() => {
  let alive = true;
  (async () => {
    try {
  const [partnerData, managerData] = await Promise.all([
    getStandards('partner'),
    getStandards('manager'),
  ]);


const mergedMap = new Map();

const normalizeValue = v => (v == null ? '' : String(v));

const taggedPartnerData = (partnerData || []).map(d => ({ ...d, role: 'partner' }));
const taggedManagerData = (managerData || []).map(d => ({ ...d, role: 'manager' }));

for (const d of [...taggedPartnerData, ...taggedManagerData]) {
  const code = d.StaffCode;
  const existing = mergedMap.get(code) || { ...d };
  if (d.role === 'partner') existing.partnerValue = normalizeValue(d.value);
  if (d.role === 'manager') existing.managerValue = normalizeValue(d.value);
  mergedMap.set(code, existing);
}


const normalized = Array.from(mergedMap.values());
console.log(taggedPartnerData);
console.log(taggedManagerData);
console.log(normalized);

  if (alive) setRows(normalized);
}
 catch (e) {
      console.error('getStandards error:', e);
    } finally {
      if (alive) setLoading(false);
    }
  })();
  return () => { alive = false; };
}, []);


  // Update by partnerCode; optimistic onBlur commit
  async function handleUpdate(staffCode, type, newValue) {
    // optimistic UI
    setRows(prev =>
  prev.map(r =>
    r.StaffCode === staffCode
      ? type === 'partner'
        ? { ...r, partnerValue: newValue }
        : { ...r, managerValue: newValue }
      : r
  )
);

    try {
      await updateStandards(type, staffCode, newValue);
    } catch (e) {
      console.error(`Update ${type}, Standard error: `, e);
    }
  }

  const columns = [
    {
      name: 'Staff',
      grow: 3,
      selector: row => row.StaffName,
      sortable: true,
      wrap: true,
    },
    {
      name: 'Staff Office',
      grow: 3,
      selector: row => row.StaffOffice,
      sortable: true,
      wrap: true,
    },
    {
  name: 'Partner Standard',
  grow: 1,
  sortable: true,
  selector: row => Number.parseFloat(row.partnerValue) || 0, // numeric sort
  cell: row => {
    const staffCode = row.StaffCode;
    const raw = row.partnerValue ?? '';
    const num = Number.parseFloat(String(raw));
    const invalid = raw !== '' && (!Number.isFinite(num) || num < 0 || num > 150);

    // helpers
    const toNumber = (s) => {
      const n = Number.parseFloat(String(s).replace(/[^0-9.+-]/g, ''));
      return Number.isFinite(n) ? n : '';
    };
    const clamp = (n, min=0, max=150) => Math.min(max, Math.max(min, n));

    const stepValue = (current, step) => {
      const val = toNumber(current);
      if (val === '') return step > 0 ? step : 0;
      return clamp((val + step), 0, 150);
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
          aria-label="Partner standard percentage"
          value={raw}
          disabled={!isSuperUser}
          onChange={e => {
  const val = e.target.value; // keep raw while typing
  setRows(prev =>
    prev.map(r =>
      r.StaffCode === staffCode ? { ...r, partnerValue: val } : r
    )
  );
}}
onBlur={e => {
  const num = toNumber(e.target.value);
  const clamped = num === '' ? '' : clamp(num);
  const display = clamped === '' ? '' : clamped.toFixed(2);

  setRows(prev =>
    prev.map(r =>
      r.StaffCode === staffCode ? { ...r, partnerValue: display } : r
    )
  );

  if (display !== '') {
    handleUpdate(staffCode, 'partner', Number(display));
  } else {
    handleUpdate(staffCode, 'partner', null);
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
                  r.StaffCode === staffCode ? { ...r, partnerValue: display } : r
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

    {
  name: 'Manager Standard',
  grow: 1,
  sortable: true,
  selector: row => Number.parseFloat(row.managerValue) || 0, // numeric sort
  cell: row => {
    const staffCode = row.StaffCode;
    const raw = row.managerValue ?? '';
    const num = Number.parseFloat(String(raw));
    const invalid = raw !== '' && (!Number.isFinite(num) || num < 0 || num > 150);

    // helpers
    const toNumber = (s) => {
      const n = Number.parseFloat(String(s).replace(/[^0-9.+-]/g, ''));
      return Number.isFinite(n) ? n : '';
    };
    const clamp = (n, min=0, max=150) => Math.min(max, Math.max(min, n));

    const stepValue = (current, step) => {
      const val = toNumber(current);
      if (val === '') return step > 0 ? step : 0;
      return clamp((val + step), 0, 150);
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
          aria-label="Manager standard percentage"
          value={raw}
          disabled={!isSuperUser}
          onChange={e => {
  const val = e.target.value;
  setRows(prev =>
    prev.map(r =>
      r.StaffCode === staffCode ? { ...r, managerValue: val } : r
    )
  );
}}
onBlur={e => {
  const num = toNumber(e.target.value);
  const clamped = num === '' ? '' : clamp(num);
  const display = clamped === '' ? '' : clamped.toFixed(2);

  setRows(prev =>
    prev.map(r =>
      r.StaffCode === staffCode ? { ...r, managerValue: display } : r
    )
  );

  if (display !== '') {
    handleUpdate(staffCode, 'manager', Number(display));
  } else {
    handleUpdate(staffCode, 'manager', null);
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
                  r.StaffCode === staffCode ? { ...r, managerValue: display } : r
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
  ];

  return (
    <div className="app-container">
      <Sidebar />
      <TopBar />

      <main className="main-content">
        <div className="table-section">
              <input
  type="search"
  className="pill-input search-input-misc"
  placeholder="Search all staff..."
  value={searchText}
  onChange={(e) => setSearchText(e.target.value)}
  aria-label="Search table"
/>
          <GeneralDataTable
            keyField="StaffCode" 
            title="Staff Standards"
            columns={columns}
            data={filteredRows}
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
