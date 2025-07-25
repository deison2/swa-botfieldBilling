import { useEffect, useState, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import GeneralDataTable from '../../components/DataTable';
import TopBar from '../../components/TopBar';
import sampleJobs from '../../devSampleData/sampleNarrativeStandards.json'; // For testing only
import EditNarrativeModal from '../../components/EditNarrativeModal.js';
import './NarrativeStandards.css';
import jobMapping from '../../data/jobMapping.json';
import AddNarrativeModal from '../../components/AddNarrativeModal';
import DeleteNarrativeModal from '../../components/DeleteNarrativeModal.js';
import { v4 as uuidv4 } from 'uuid';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import {
  loadNarratives,
  addNarrative,
  updateNarrative,
  deleteNarrative
} from '../../services/NarrativeService.js';

// Dynamically create job names based off the Idx array
const jobLookup = jobMapping.reduce((acc, { Idx, JobName }) => {
  acc[Idx] = JobName;
  return acc;
}, {});

export default function NarrativeStandards() {

const SERVICE_COLORS = {
  ACCTG:   '#003C4B',
  ATTEST:  '#00464B',
  AUDIT:   '#11614C',
  BUSTAX:  '#24764D',
  INDTAX:  '#49A050',
  ESTATE:  '#79B873',
  NFP:     '#AEDCAA',
  HR:      '#DDDDDD',
  MAS:     '#999999',
  SALT:    '#555555',
  TAS:     '#333333',
  TASTAX:  '#111111',
  VAL:     '#111111',
  ALL:     '#111111'
};

// ➋ build conditionalRowStyles from that map
const conditionalRowStyles = Object.entries(SERVICE_COLORS).map(
  ([service, color]) => ({
    when: row => row.Serv === service,
    style: { color,
      fontWeight: 'bold' 
    }
  })
);


  // const [rows, setRows] = useState([]); //PROD VERSION
  const [rows, setRows] = useState(sampleJobs); // REMOVE THIS LINE AFTER TESTING
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [rowToDelete, setRowToDelete]   = useState(null);

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
  (async () => {
    try {
      const data = await loadNarratives();
      setRows(data);
    } catch (e) {
      console.error(e);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  })();
}, []);


  // 2. table/modal handlers

  async function openAddModal(item) {
    setIsAddOpen(true);
  }
 async function handleCreate(item) {
  console.log('handleCreate called');
   const newItem = { uuid: uuidv4(), ...item };
   await addNarrative(newItem);
   setRows(r => [...r, newItem]);
 }
  async function handleUpdate(item) {
    await updateNarrative(item.uuid, item);
    setRows(r => r.map(rw => (rw.uuid === item.uuid ? item : rw)));
    console.log(item);
    closeEditModal();
  }

  function openEditModal(row) {
    setSelectedRow(row);
    setIsModalOpen(true);
  }
  function closeEditModal() {
    setSelectedRow(null);
    setIsModalOpen(false);
  }
  function openDeleteModal(row) {
    console.log('openDeleteModal called with row:', row);
    if (row.Level !== 'JOB')
    {
      toast.error("Only Job-level narratives can be deleted.");
      console.log('User attempt to delete Serv-level or ALL-level narrative');
      return
    }
    setRowToDelete(row);
    setIsDeleteOpen(true);
  }
  function closeDeleteModal() {
    setRowToDelete(null);
    setIsDeleteOpen(false);
  }

  function handleConfirmDelete(uuid) {
    // 1) remove from local state
    setRows(rs => rs.filter(r => r.uuid !== uuid));
    deleteNarrative(uuid)
    closeDeleteModal();
  }
  const filteredRows = useMemo(() => {
  return rows
    .filter(r => {
      if (!filterText) return true;

      const text = filterText.toLowerCase();

      // 1️⃣ check narrative
      if (r.Narrative.toLowerCase().includes(text)) return true;

      if (r.Level === 'SPEC') 
        {
          const specText = 'SPEC'
          if (specText.toLowerCase().includes(text))
          return true;
        }

      // 2️⃣ check job names (only for JOB-level rows)
      if (r.Level === 'JOB') {
        const jobNames = r.Idx
          .map(i => jobLookup[i] || `#${i}`)
          .join(' ')
          .toLowerCase();
        if (jobNames.includes(text)) return true;
      }

      // 3️⃣ fallback: no match
      return false;
    })
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
      if (row.Level === 'SPEC') return 'Special Circumstances (Detailed Invoice, Out of Scope, etc.)';
      else if (row.Level === 'SERV') return `${row.Serv} - Service Level Standard`;
      else return row.Idx.map(i => jobLookup[i] || '').join(', ');
    },
    cell: row => {
      // build a flat list of labels in every case
      let labels;
        if (row.Level === 'SERV') 
          {
            labels = [`${row.Serv} - Service Level Standard`]
          }
        
        else if (row.Level === 'SPEC') 
          {
            labels = ['Special Circumstances (Detailed Invoice, Out of Scope, etc.)']
          }
        else 
            labels = row.Idx.map(i => jobLookup[i] || `#${i}`);

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
    allowoverflow: true
    },
    { name: 'Level', selector: row => row.Level, sortable: true , grow: .5 },
    { name: 'Type', selector: row => row.Type, sortable: true , grow: .5 },
    { name: 'Service', selector: row => row.Serv, sortable: true , grow: .5 },
    {
      name: '',
      cell: row => <button className="ed-del-btn" onClick={() => openEditModal(row)}>Edit</button>,
      center: true,
      ignoreRowClick: true,
      allowoverflow: true,
      button: true
    },
    {
      name: '',
      cell: row => <button className="ed-del-btn" onClick={() => openDeleteModal(row)}>Delete</button>,
      center: true,
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
        <div className="filter-bar">
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
            onRowUpdate={openEditModal}
            onRowDelete={handleConfirmDelete}
            pagination
            highlightOnHover
            striped
            conditionalRowStyles={conditionalRowStyles}
          />
        </div>
      </main>
            <AddNarrativeModal
        isOpen={isAddOpen}
        onRequestClose={() => setIsAddOpen(false)}
        onSave={handleCreate}
        availableJobs={jobMapping}
        allNarratives={rows}
      />
            <EditNarrativeModal
        isOpen={isModalOpen}
        onRequestClose={closeEditModal}
        initialData={selectedRow}
        onSave={handleUpdate}
        availableJobs={jobMapping}
        allNarratives={rows} 
      />
            <DeleteNarrativeModal
        isOpen={isDeleteOpen}
        onRequestClose={closeDeleteModal}
        narrative={rowToDelete}
        jobLookup={jobLookup}
        onConfirmDelete={handleConfirmDelete}
      />
      <ToastContainer position="top-right" autoClose={5000} />
    </div>
  );
}
