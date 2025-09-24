import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import GeneralDataTable from '../components/DataTable';
import TopBar from '../components/TopBar';
import './MiscReports.css';

import { getMiscReports } from '../services/MiscReportsService';

export default function MiscReports() {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');

  // report selector + date
  const [selectedReport, setSelectedReport] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    // default to today's date in local timezone, formatted as YYYY-MM-DD
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // Optionally memoize a human-friendly date label
  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return '';
    try {
      const d = new Date(selectedDate);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  console.log(selectedDateLabel);


  useEffect(() => {
  // whenever report changes, clear out old data/columns immediately
  setRows([]);
  setColumns([]);
  setSearchText('');
}, [selectedReport]);


  // Fetch when both a report and date are set
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      if (!selectedReport || !selectedDate) return; // show instructions until a report is chosen
      setLoading(true);
      setError(null);
      try {
             const res = await getMiscReports(selectedReport, selectedDate);
      // Normalize to an array
      const arr =
        Array.isArray(res) ? res :
        Array.isArray(res?.data) ? res.data :
        Array.isArray(res?.rows) ? res.rows :
        [];
        setRows(arr);
        // If your table needs columns and you don't have a fixed set:
        if (arr.length && columns.length === 0) {
          const first = arr[0];
          const cols = Object.keys(first).map(key => ({
            name: key.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            selector: row => row[key],
            sortable: true,
            wrap: true,
          }));
          setColumns(cols);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load data.');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [selectedReport, selectedDate, columns.length]);

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


  return (
<div className="app-container">
{/* optional loader overlay */}
{loading && <div className="loader-overlay" aria-live="polite" />}


<Sidebar />
<TopBar />


<main className="main-content misc-reports">
{/* Filter bar to mirror your existing page style */}
<div className="select-bar">
<select
  id="report-select"
  className="pill-select report-select"
  value={selectedReport}
  onChange={(e) => setSelectedReport(e.target.value)}
  title="Choose report"
>
  <option value="">Select a report…</option>

  <option value="billing_error_partner" className="billing-error-opt">
    Billing Error Check - Partner
  </option>
  <option value="billing_error_manager" className="billing-error-opt">
    Billing Error Check - Manager
  </option>
  <option value="billing_error_partner_detail" className="billing-error-opt">
    Billing Error Check - Partner Detail
  </option>
  <option value="billing_error_interim_cfs" className="billing-error-opt">
    Billing Error Check - Interim CFs
  </option>
  <option value="billing_error_wip_cfs" className="billing-error-opt">
    Billing Error Check - WIP CFs
  </option>
  <option value="billing_error_interim_wos" className="billing-error-opt">
    Billing Error Check - Interim WOs
  </option>

  <option value="billing_inv_style_error">Billing Inv Style Error Check</option>

  <option value="wrong_invoice_date">Invoices with Wrong Date</option>


  <option value="wip_clean_negatives" className="wipclean-opt">
    WIP to Clean UP - All Negatives
  </option>
  <option value="wip_clean_rounding" className="wipclean-opt">
    WIP to Clean UP - Rounding Errors
  </option>
</select>

<input
  type="search"
  className="pill-input search-input-misc"
  placeholder="Search all columns…"
  value={searchText}
  onChange={(e) => setSearchText(e.target.value)}
  aria-label="Search table"
/>

<div className="date-filter">
<label className="sr-only" htmlFor="date-picker">Date</label>
<input
id="date-picker"
type="date"
className="pill-input date-input"
value={selectedDate}
onChange={(e) => setSelectedDate(e.target.value)}
title="Pick a date"
/>
</div>
</div>


{/* Instructions or table */}
{!selectedReport ? (
<div className="instructions-card">
<h2>Pick a report to get started</h2>
<p>
Use the <strong>Report</strong> dropdown above to choose a report. The <strong>Date</strong> picker defaults
to today. After selection, results will load automatically.
</p>
<ul>
<li>Select a report from the dropdown.</li>
<li>Adjust the date if needed (most reports do not require the date to be selected).</li>
</ul>
</div>
) : (
<>
{error && (
<div className="error-banner" role="alert">{error}</div>
)}
<div className="table-section">
<GeneralDataTable 
columns={columns} 
data={filteredRows} 
progressPending={loading} 
noDataComponent={<span className="no-rows">No rows to show!</span>}
/>
</div>
</>
)}
</main>
</div>
);
}