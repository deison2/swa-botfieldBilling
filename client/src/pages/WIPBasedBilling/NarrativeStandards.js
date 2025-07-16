import { useEffect, useState, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import KpiShell from '../../components/KPIShell';
import GeneralDataTable from '../../components/DataTable';
import TopBar from '../../components/TopBar';
import sampleJobs from '../../devSampleData/sampleNarrativeStandards.json'; // For testing only
import EditNarrativeModal from '../../components/EditNarrativeModal.js';
import jobMapping from '../../data/jobMapping.json';
// import { v4 as uuidv4 } from 'uuid';

import {
  loadNarratives,
  addNarrative,
  //updateNarrative,
  deleteNarrative
} from '../../services/NarrativeService.js';

// Dynamically create job names based off the Idx array
const jobLookup = jobMapping.reduce((acc, { Idx, JobName }) => {
  acc[Idx] = JobName;
  return acc;
}, {});

export default function NarrativeStandards() {

  // const [rows, setRows] = useState([]); //PROD VERSION
  const [rows, setRows] = useState(sampleJobs); // REMOVE THIS LINE AFTER TESTING
  const [loading, setLoading] = useState(true);

  // search state
  const [filterText, setFilterText] = useState('');

  // default modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  // 1. load on mount
  useEffect(() => {
    loadNarratives()
      .then(data => setRows(data))
      .finally(() => setLoading(false));
  }, []);

  // 2. table/modal handlers
  async function handleAdd(item) {
    const newItem = await addNarrative(item);
    setRows(r => [...r, newItem]);
  }
  async function handleUpdate(item) {
    // await updateNarrative(item); // NEEDS BACKEND API SET UP
    setRows(r => r.map(rw => (rw.uuid === item.uuid ? item : rw)));
    console.log(item);
  }
  async function handleDelete(uuid) {
    await deleteNarrative(uuid);
    setRows(r => r.filter(rw => rw.uuid !== uuid));
  }

  function openEditModal(row) {
    setSelectedRow(row);
    setIsModalOpen(true);
  }
  function closeEditModal() {
    setSelectedRow(null);
    setIsModalOpen(false);
  }
    async function handleModalDelete(uuid) {
    await handleDelete(uuid);    // your existing deleteNarrative + state update
    closeEditModal();
  }
  async function handleSave(updated) {
    await handleUpdate(updated);
    closeEditModal();
  }
  const filteredRows = useMemo(() => {
    if (!filterText) return rows;
    const ft = filterText.toLowerCase();
    return rows.filter(r =>
      // check whichever columns you want searchable:
      r.Narrative.toLowerCase().includes(ft)
    );
  }, [rows, filterText]);

  const columns = [
    { name: 'Narrative', selector: row => row.Narrative, sortable: false, wrap: true },
    {
    name: 'Job Name(s)',
    sortable: true,
    // This string is what the table will sort on:
    selector: row =>
      row.Idx
        .map(i =>
          i === 0
            ? `${row.Serv} - Service Level Standard`
            : (jobLookup[i] || `#${i}`)
        )
        .join(', '),
    // This is what it will actually render, with newlines:
    cell: row => {
      const lines = row.Idx.map(i =>
        i === 0
          ? `${row.Serv} - Service Level Standard`
          : (jobLookup[i] || `#${i}`)
      );
      return (
        <div style={{ whiteSpace: 'pre-wrap' }}>
          {lines.join('\n')}
        </div>
      );
    },
    // ensure the cell can grow vertically
    allowoverflow: true
    },
    { name: 'Level', selector: row => row.Level, sortable: true },
    { name: 'Type', selector: row => row.Type, sortable: true },
    { name: 'Service', selector: row => row.Serv, sortable: true },
    { name: 'Default?', selector: row => (row.isDefault ? '✔️' : '—'), sortable: true },
    {
      name: 'Actions',
      cell: row => <button onClick={() => openEditModal(row)}>Edit</button>,
      ignoreRowClick: true,
      allowoverflow: true,
      button: true
    }
  ];

  return (
    <div className="app-container">
      <Sidebar />
      <TopBar />

      <main className="main-content">
        {/* KPIs */}
        <div className="kpi-container">
          <KpiShell title="TOTAL BILLED" value="$0.00" />
          <KpiShell title="TOTAL WIP" value="$0.00" />
          <KpiShell title="UNIQUE CLIENTS" value="0" />
          <KpiShell title="UNIQUE STAFF" value="0" />
        </div>

        {/* Data table */}
        <div className="table-section">
          <input
            type="text"
            placeholder="Search jobs or narratives…"
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
            keyField="uuid"
            title="Job Narratives"
            columns={columns}
            data={filteredRows}
            progressPending={loading}
            onRowAdd={handleAdd}
            onRowUpdate={handleUpdate}
            onRowDelete={handleDelete}
            pagination
            highlightOnHover
            striped
          />
        </div>
      </main>
            <EditNarrativeModal
        isOpen={isModalOpen}
        onRequestClose={closeEditModal}
        initialData={selectedRow}
        onSave={handleSave}
        onDelete={handleModalDelete}
        availableJobs={jobMapping}
      />
    </div>
  );
}
