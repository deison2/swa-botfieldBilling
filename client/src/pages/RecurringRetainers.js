import { useEffect, useState, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import GeneralDataTable from '../components/DataTable';
import TopBar from '../components/TopBar';
import './WIPBasedBilling/NarrativeStandards.css';
import recurringSample from '../devSampleData/recurringSample.json';
import AddRecurringModal from '../components/AddRecurringModal';
import EditRecurringModal from '../components/EditRecurringModal.js';
import DeleteRecurringModal from '../components/DeleteRecurringModal.js';
import { v4 as uuidv4 } from 'uuid';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAuth } from '../auth/AuthContext';
// import { dataType } from '../config.js'; // import dataType from config

import {
  loadRecurrings,
  addRecurrings,
  updateRecurrings,
  deleteRecurrings,
  reqAddRecurrings,
  reqUpdateRecurrings,
  reqDeleteRecurrings,
  loadJobMapping,
  loadClientMapping
} from '../services/RecurringService.js';


const jobMapping = await loadJobMapping()
  .catch(err => {
    console.error(err);
  });

const sortedJobMapping = jobMapping.sort((a, b) => a.Serv.localeCompare(b.Serv));


// Reverse lookup: JobName -> Idx
const jobNameToIdx = sortedJobMapping.reduce((acc, { Idx, JobName }) => {
  acc[JobName.toLowerCase()] = Idx;
  return acc;
}, {});


const jobLookup = sortedJobMapping.reduce((acc, { Idx, JobName }) => {
  acc[Idx] = JobName;
  return acc;
}, {});


export default function RecurringRetainers() {

  const { principal, isSuperUser } = useAuth();
  const email = principal?.userDetails?.toLowerCase() || '';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [rowToDelete, setRowToDelete]   = useState(null);

  // Filtering
  const [typeFilter, setTypeFilter]       = useState('');
  const [levelFilter, setLevelFilter]     = useState('');
  const [freqFilter, setFreqFilter] = useState('');

  const clearFilters = () => {
    setLevelFilter('');
    setTypeFilter('');
    setFreqFilter('');
    setFilterText('');
  };

  // helper(s) :P
  function RoleChips({  partner, manager }) {
    const Item = ({ role, value, className }) => (
      <span
        className={`chip2 role ${className}`}
        data-tooltip={role}
        aria-label={role}
        title={role}
      >
        {value || '—'}
      </span>
    );

    return (
      <div className="chip2-container role-chip2-stack">
        <Item role="Client Partner"    className="partner"    value={partner} />
        <Item role="Client Manager"    className="manager"    value={manager} />
      </div>
    );
  }

  
  // 1. load on mount
useEffect(() => {
  (async () => {
    try {
      const [recurrings, clientMapping] = await Promise.all([
        loadRecurrings(),
        loadClientMapping()
      ]);

      // Build lookup for client mapping by ContIndex
      const clientLookup = clientMapping.reduce((acc, client) => {
        acc[client.ContIndex] = client;
        return acc;
      }, {});

      // Map incoming recurrings (which now contain ContIndex) to full client details
      const enrichedData = recurrings.map(r => {
        const match = clientLookup[r.ContIndex] || {};
        return {
          ...r,
          ClientCode: match.ClientCode || '—',
          ClientName: match.ClientName || '—',
          ClientPartner: match.ClientPartner || '—',
          ClientManager: match.ClientManager || '—',
          ClientOffice: match.ClientOffice || '—'
        };
      });

      setRows(enrichedData);
      setLoading(false);
    } catch (e) {
      console.error('loadRecurrings/clientMapping error:', e);
      toast.error(
        e.message ||
          'Failed to load recurrings or client mapping — reverting to sample data'
      );
      setRows(recurringSample);
      setLoading(false);
    }
  })();
}, []);



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
const freqOptions = useMemo(
  () => Array.from(new Set(rows.map(r => r.Frequency)))
      .sort((a, b) => a.localeCompare(b)),
  [rows]
);


  // search state
  const [filterText, setFilterText] = useState('');

  // default modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);


  // 2. table/modal handlers

  async function openAddModal(item) {
    setIsAddOpen(true)
  }

  async function handleCreate(item) {

  try {
    if (isSuperUser || 1 === 1) { // Allow for creation for super users, requesting for non-super users
      const newItem = { uuid: uuidv4(), ...item };
      await addRecurrings(newItem);
      setRows(r => [...r, newItem]);
      toast.success('Recurring added');
      setIsAddOpen(false);
    }
    else {
      const newItem = { ...item, RequestedBy: email, uuid: uuidv4() };
      await reqAddRecurrings(newItem);
      toast.success('Recurring Requested! Our Billing Team will review your request shortly.');
      setIsAddOpen(false);
    }
  } catch (e) {
    console.error('addRecurring error:', e);
    toast.error(e.message || 'Failed to add/request recurring - please try again or contact the Data Analytics Team');
  }
}


async function handleUpdate(item) {
  console.log('new item - ',  item)
  try {
    // Ensure Population only contains job indexes
    const normalizedPopulation = (item.Population || []).map(p => {
      // If it's already a number (Idx), keep it
      if (typeof p === 'number') return p;

      // If it's a string (JobName), look up its Idx
      const idx = jobNameToIdx[p.toLowerCase()];
      return idx !== undefined ? idx : p; // fallback: keep as-is if not found
    });

    const payload = {
      ContIndex: item.ContIndex,
      BillType: item.BillType,
      Level: item.Level,
      Population: normalizedPopulation,
      Frequency: item.Frequency,
      Narrative: item.Narrative,
      BillAmount: item.BillAmount
    };

    if (isSuperUser || 1 === 1) {
      await updateRecurrings(item.uuid, payload);
      setRows(r =>
        r.map(rw => (rw.uuid === item.uuid ? { ...rw, ...item } : rw))
      );
      toast.success('Recurring updated');
      closeEditModal();
    } else {
      const reqPayload = { ...payload, RequestedBy: email };
      await reqUpdateRecurrings(reqPayload);
      toast.success('Recurring Requested! - Our Billing Team will review your request shortly.');
      closeEditModal();
    }
  } catch (e) {
    console.error('updateRecurring error:', e);
    toast.error(e.message || 'Failed to update recurring - please try again or contact the Data Analytics Team');
  }
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
    setRowToDelete(row);
    setIsDeleteOpen(true);
  }
  function closeDeleteModal() {
    setRowToDelete(null);
    setIsDeleteOpen(false);
  }

async function handleConfirmDelete(uuid) {
  try {      
    if (isSuperUser || 1 === 1) {
    await deleteRecurrings(uuid);
    setRows(rs => rs.filter(r => r.uuid !== uuid));
    toast.success('Recurring deleted');
    closeDeleteModal();
    }
    else {
      await reqDeleteRecurrings(uuid);
      toast.success('Delete Requested! - Our Billing Team will review your request shortly.');
      closeDeleteModal();
    }
  } catch (e) {
    console.error('deleteRecurring error:', e);      // ← CHANGED
    toast.error(e.message || 'Failed to delete/request delete recurring - please try again or contact the Data Analytics Team'); // ← CHANGED
    setRows(rs => rs.filter(r => r.uuid !== uuid));
  }
}


  const filteredRows = useMemo(() => {
  return rows
    .filter(r => {
      if (!filterText) return true;

      const text = filterText.toLowerCase();
      console.log(text);
      //if (r.Narrative.toLowerCase().includes(text)) return true;

      return false;
    })
    .filter(r =>
      // Level dropdown
      !levelFilter || r.Level === levelFilter
    )
    .filter(r =>
      // Type dropdown
      !typeFilter || r.BillType === typeFilter
    )
    .filter(r =>
      // Frequency dropdown
      !freqFilter || r.Frequency === freqFilter
    );
}, [rows, filterText, levelFilter, typeFilter, freqFilter]);


  const columns = [
    { name: 'Client', selector: row => `${row.ClientCode} - ${row.ClientName}` , sortable: true , wrap: true , grow: 1, center: true 
    , cell: row => {
      const visible = [`${row.ClientCode} - ${row.ClientName}`];

      return (
        <div className="chip2-container">
            <span key={visible[0]} className="chip2">
              {visible[0]}
            </span>
        </div>
      );
    }
    },
    { name: 'Office', selector: row => row.ClientOffice , sortable: true , wrap: true , grow: .5, center: true },
    { name : 'Client Roles', grow: .75, sortable:false, center: true,
      cell : r => (
        <RoleChips
          partner={r.ClientPartner}
          manager={r.ClientManager}
        />
      )
    },
    { name: 'Bill Type', selector: row => row.BillType , sortable: true , wrap: true , grow: .5, center: true },
    { name: 'Level', selector: row => row.Level, sortable: true , grow: .5, center: true },
    { 
      name: 'Population' , sortable: true , wrap: true , width: '240px', grow: 2, center: true
      ,
    selector: row => {
      if (row.Level === 'SERV') 
          return row.Population.join(', ');
      else 
          return row.Population.map(i => jobLookup[i] || '').join(', ');
    },
    cell: row => {
      // build a flat list of labels in every case
      let labels;
        if (row.Level === 'SERV') 
          {
            labels = [row.Population]
          }
        else 
            labels = row.Population.map(i => jobLookup[i] || `#${i}`);

      // show up to 3 chips, stash the rest
      const visible = labels.slice(0, 3);
      const hidden  = labels.slice(3);

      return (
        <div className="chip2-container">
          {visible.map(lbl => (
            <span key={lbl} className="chip2">
              {lbl}
            </span>
          ))}

          {hidden.length > 0 && (
            <span className="chip2 more" data-tooltip={hidden.join('\n')}>
              +{hidden.length}
            </span>
          )}
        </div>
      );
    }
    },
    { name: 'Frequency', selector: row => row.Frequency , sortable: true , wrap: true , grow: .5, center: true },
    { name: 'Narrative', selector: row => ( <div title={row.Narrative}> {row.Narrative?.length > 75 ? row.Narrative.slice(0, 75) + '...' : row.Narrative} </div>
  ), sortable: true , grow: 1, center: true },
    { name: 'Bill Amount', selector: row => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
      .format(row.BillAmount || 0), sortable: true , grow: .5, center: true },
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
        <div className="filter-bar">
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

  {/* Freq filter */}
  <select
    value={freqFilter}
    onChange={e => setFreqFilter(e.target.value)}
  >
    <option value="">All Frequencies</option>
    {freqOptions.map(type => (
      <option key={type} value={type}>
        {type}
      </option>
    ))}
  </select>

  {/* NEW: add recurring button */}
          <button
            type="button"
            className="add-narrative-btn"
            onClick={openAddModal}
          >
            + Create/Request
          </button>
</div>


        {/* Data table */}
        <div className="table-section"
        >
          <input
            type="text"
            placeholder="Search clients…"
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
            title="Recurring Clients"
            columns={columns}
            data={filteredRows}
            progressPending={loading}
            onRowAdd={openAddModal}
            onRowUpdate={openEditModal}
            onRowDelete={handleConfirmDelete}
            pagination
            highlightOnHover
            striped
          />
      <ToastContainer position="top-right" autoClose={5000} />
        </div>
      </main>
            <AddRecurringModal
        isOpen={isAddOpen}
        onRequestClose={() => setIsAddOpen(false)}
        onSave={handleCreate}
        availableJobs={sortedJobMapping}
        allData={rows}
      />
            <EditRecurringModal
        isOpen={isModalOpen}
        onRequestClose={closeEditModal}
        initialData={selectedRow}
        onSave={handleUpdate}
        availableJobs={sortedJobMapping}
        allData={rows} 
      />
            <DeleteRecurringModal
        isOpen={isDeleteOpen}
        onRequestClose={closeDeleteModal}
        narrative={rowToDelete}
        jobLookup={jobLookup}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
}
