import './KPIShell.css';

export default function KpiShell({ title, value }) {
  return (
    <div className="kpi-shell">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
