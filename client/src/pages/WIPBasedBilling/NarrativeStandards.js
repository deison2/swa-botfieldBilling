import { useEffect, useState, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import GeneralDataTable from '../../components/DataTable';
import TopBar from '../../components/TopBar';
import sampleJobs from '../../devSampleData/sampleNarrativeStandards.json'; // For testing only
import EditNarrativeModal from '../../components/EditNarrativeModal.js';
import './NarrativeStandards.css';
import jobMapping from '../../data/jobMapping.json';
import AddNarrativeModal from '../../components/AddNarrativeModal';
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
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Filtering
  const [levelFilter, setLevelFilter]     = useState('');
  const [typeFilter, setTypeFilter]       = useState('');
  const [serviceFilter, setServiceFilter] = useState('');

  const clearFilters = () => {
    setLevelFilter('');
    setTypeFilter('');
    setServiceFilter('');
    setFilterText('');
  };

  // inside NarrativeStandards(), before the return:
const levelOptions = useMemo(
  () => Array.from(new Set(rows.map(r => r.Level)))
      .sort((a, b) => a.localeCompare(b)),
  [rows]
);
const typeOptions = useMemo(
  () => Array.from(new Set(rows.map(r => r.Type)))
      .sort((a, b) => a.localeCompare(b)),
  [rows]
);
const serviceOptions = useMemo(
  () => Array.from(new Set(rows.map(r => r.Serv)))
      .sort((a, b) => a.localeCompare(b)),
  [rows]
);


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

  async function openAddModal(item) {
    setIsAddOpen(true);
  }
 async function handleCreate(item) {
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
  return rows
    .filter(r =>
      // full‐text search
      !filterText ||
        r.Narrative.toLowerCase().includes(filterText.toLowerCase())
    )
    .filter(r =>
      // Level dropdown
      !levelFilter || r.Level === levelFilter
    )
    .filter(r =>
      // Type dropdown
      !typeFilter || r.Type === typeFilter
    )
    .filter(r =>
      // Service dropdown
      !serviceFilter || r.Serv === serviceFilter
    );
}, [rows, filterText, levelFilter, typeFilter, serviceFilter]);


  const columns = [
    { 
      name: 'Narrative'
      , grow: 3
      , selector: row => row.Narrative
      , sortable: false
      , wrap: true 
    }, //test
  {
    name: 'Job Name(s)',
    grow: 3, //thrice as greedy as other columns
    sortable: true,
    selector: row => {
      if (row.Level === 'ALL') return '';
      if (row.Level === 'SERV') return `${row.Serv} - Service Level Standard`;
      return row.Idx.map(i => jobLookup[i] || `#${i}`).join(', ');
    },
    cell: row => {
      if (row.Level === 'ALL') {
        return <div />;
      }

      // build a flat list of labels in every case
      const labels =
        row.Level === 'SERV'
          ? [`${row.Serv} - Service Level Standard`]
          : row.Idx.map(i => jobLookup[i] || `#${i}`);

      // show up to 3 chips, stash the rest
      const visible = labels.slice(0, 3);
      const hidden  = labels.slice(3);

      return (
        <div className="chip-container">
          {visible.map(lbl => (
            <span key={lbl} className="chip">
              {lbl}
            </span>
          ))}

          {hidden.length > 0 && (
            <span className="chip more" data-tooltip={hidden.join('\n')}>
              +{hidden.length}
            </span>
          )}
        </div>
      );
    },
    allowOverflow: true
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
        {/* Filtering*/}
        <div className="kpi-container">
  {/* Clear button */}
          <button
            type="button"
            className="clear-filters-btn"
            onClick={clearFilters}
          >
            Clear Filters
          </button>
  {/* Level filter */}
  <select
    value={levelFilter}
    onChange={e => setLevelFilter(e.target.value)}
  >
    <option value="">All Levels</option>
    {levelOptions.map(lvl => (
      <option key={lvl} value={lvl}>
        {lvl}
      </option>
    ))}
  </select>

  {/* Type filter */}
  <select
    value={typeFilter}
    onChange={e => setTypeFilter(e.target.value)}
  >
    <option value="">All Types</option>
    {typeOptions.map(type => (
      <option key={type} value={type}>
        {type}
      </option>
    ))}
  </select>

  {/* Service filter */}
  <select
    value={serviceFilter}
    onChange={e => setServiceFilter(e.target.value)}
  >
    <option value="">All Services</option>
    {serviceOptions.map(svc => (
      <option key={svc} value={svc}>
        {svc}
      </option>
    ))}
  </select>

  {/* NEW: add narrative button */}
          <button
            type="button"
            className="add-narrative-btn"
            onClick={openAddModal}
          >
            + New Narrative
          </button>
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
            onRowAdd={openAddModal}
            onRowUpdate={handleUpdate}
            onRowDelete={handleDelete}
            pagination
            highlightOnHover
            striped
          />
        </div>
      </main>
            <AddNarrativeModal
        isOpen={isAddOpen}
        onRequestClose={() => setIsAddOpen(false)}
        onSave={handleCreate}
        availableJobs={jobMapping}
      />
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
