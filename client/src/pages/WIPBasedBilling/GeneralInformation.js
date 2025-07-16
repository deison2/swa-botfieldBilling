import Sidebar from '../../components/Sidebar';
import KpiShell from '../../components/KPIShell';
import GeneralDataTable from '../../components/DataTable';
import TopBar from '../../components/TopBar';
import './GeneralInformation.css';

export default function GeneralInformation() {
  return (
    <div className="app-container">
      <Sidebar />
      <TopBar />
      <main className="main-content">
        <div className="kpi-container">
          <KpiShell title="TOTAL BILLED" value="$0.00" />
          <KpiShell title="TOTAL WIP" value="$0.00" />
          <KpiShell title="UNIQUE CLIENTS" value="0" />
          <KpiShell title="UNIQUE STAFF" value="0" />
        </div>

        <div className="table-section">
          <h2>Billable Load by Employee</h2>
          <GeneralDataTable />
        </div>
      </main>
    </div>
  );
}
