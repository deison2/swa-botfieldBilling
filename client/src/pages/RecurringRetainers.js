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
  loadRecurringJobMapping,
  loadClientMapping
} from '../services/RecurringService.js';


const jobMapping = await loadRecurringJobMapping()
  .catch(err => {
    console.error(err);
  });

const sortedJobMapping = jobMapping.sort((a, b) => a.JobName.localeCompare(b.JobName));


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

  const { principal } = useAuth();
  const email = principal?.userDetails?.toLowerCase() || '';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [rowToDelete, setRowToDelete]   = useState(null);
  const [clientMapping, setClientMapping] = useState([]);
  const [clientLookup, setClientLookup] = useState({});


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
      const [recurrings, clientMap] = await Promise.all([
        loadRecurrings(),
        loadClientMapping()
      ]);

      setClientMapping(clientMap);
      setRows(recurrings);

      // Build lookup
      const lookup = clientMap.reduce((acc, client) => {
        acc[client.ContIndex] = client;
        return acc;
      }, {});
      setClientLookup(lookup);

      setLoading(false);
    } catch (e) {
      console.error('Failed to load recurrings/clientMapping:', e);
      toast.error('Failed to load recurrings or client mapping');
      setRows(recurringSample);
      setLoading(false);
    }
  })();
}, []);

const enrichedRows = useMemo(() => {
  if (!rows.length || !Object.keys(clientLookup).length) return rows;

  return rows.map(r => {
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
}, [rows, clientLookup]);



  // inside NarrativeStandards(), before the return:
const levelOptions = useMemo(
  () => Array.from(new Set(enrichedRows.map(r => r.Level)))
      .sort((a, b) => a.localeCompare(b)),
  [enrichedRows]
);
const typeOptions = useMemo(
  () => Array.from(new Set(enrichedRows.map(r => r.Type)))
      .sort((a, b) => a.localeCompare(b)),
  [enrichedRows]
);
const freqOptions = useMemo(
  () => Array.from(new Set(enrichedRows.map(r => r.Frequency)))
      .sort((a, b) => a.localeCompare(b)),
  [enrichedRows]
);


  // search state
  const [filterText, setFilterText] = useState('');

  // default modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);


  function hasDuplicateRecurring(newItem, rows) {
  return rows.some(
    r =>
      r.ContIndex === newItem.ContIndex &&
      r.Frequency === newItem.Frequency &&
      r.uuid !== newItem.uuid // exclude self when updating
  );
}



  // 2. table/modal handlers

  async function openAddModal(item) {
    setIsAddOpen(true)
  }

  async function handleCreate(item) {

  try {
    if (hasDuplicateRecurring(item, rows)) {
      toast.error(
        `A recurring bill already exists for this client with ${item.Frequency} frequency.`
      );
      return;
    }
      const newItem = { uuid: uuidv4(), ...item };
      await addRecurrings(newItem);
      setRows(r => [...r, newItem]);
      toast.success('Recurring added');
      setIsAddOpen(false);
      // sendNotificationEmail(newItem, email);
    }
   catch (e) {
    console.error('addRecurring error:', e);
    toast.error(e.message || 'Failed to add/request recurring - please try again or contact the Data Analytics Team');
  }
}


async function handleUpdate(item) {
  console.log('new item - ',  item)
  try {
    if (hasDuplicateRecurring(item, rows)) {
      toast.error(
        `A recurring already exists for this client with ${item.Frequency} frequency.`
      );
      return;
    }
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

      await updateRecurrings(item.uuid, payload);
      setRows(r =>
        r.map(rw => (rw.uuid === item.uuid ? { ...rw, ...item } : rw))
      );
      toast.success('Recurring updated');
      closeEditModal();
      // sendNotificationEmail(newItem, email);
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
    await deleteRecurrings(uuid);
    setRows(rs => rs.filter(r => r.uuid !== uuid));
    toast.success('Recurring deleted');
    closeDeleteModal();
      // sendNotificationEmail(newItem, email);
  } catch (e) {
    console.error('deleteRecurring error:', e);      // ← CHANGED
    toast.error(e.message || 'Failed to delete/request delete recurring - please try again or contact the Data Analytics Team'); // ← CHANGED
    setRows(rs => rs.filter(r => r.uuid !== uuid));
  }
}


  const filteredRows = useMemo(() => {
    // const filtered = enrichedRows
    // .filter(r => {
    //   if (!filterText) return true;

    //   const text = filterText.toLowerCase();
    //   console.log(text);
    //   //if (r.Narrative.toLowerCase().includes(text)) return true;

    //   return false;
    // })
    const search = filterText.trim().toLowerCase();

    const filtered = enrichedRows
      .filter(r => {
        if (!search) return true; // no search text -> keep everything

        // Collect text from the columns you care about
        const values = [];

        // Basic fields
        values.push(
          r.ClientCode,
          r.ClientName,
          r.ClientOffice,
          r.ClientPartner,
          r.ClientManager,
          r.BillType,
          r.Level,
          r.Frequency,
          r.Narrative
        );

        // Population (handles SERV vs JOB arrays)
        if (r.Level === 'SERV') {
          if (Array.isArray(r.Population)) {
            values.push(...r.Population);
          } else if (r.Population) {
            values.push(r.Population);
          }
        } else if (Array.isArray(r.Population)) {
          values.push(...r.Population.map(i => jobLookup[i] || ''));
        }

        // Bill amount as text
        if (r.BillAmount != null) {
          values.push(String(r.BillAmount));
        }

        // Build one big lowercase string to search in
        const haystack = values
          .filter(Boolean)            // drop null/undefined/empty
          .join(' ')
          .toLowerCase();

      return haystack.includes(search);
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

    // Default sort is ascending ClientCode
    return filtered.slice().sort((a,b) => {
      const aCode = a.ClientCode || '';
      const bCode = b.ClientCode || '';
      return aCode.localeCompare(bCode);
    });
}, [enrichedRows, filterText, levelFilter, typeFilter, freqFilter]);


  const columns = [
    { name: 'Client', selector: row => `${row.ClientCode} - ${row.ClientName}` , sortable: true , wrap: true , width: '184px', grow: 0, center: true 
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
    { name: 'Office', selector: row => row.ClientOffice , sortable: true , wrap: true , width:'80px', grow: 0.5, center: true },
    { name : 'Client Roles', grow: 0.5, sortable:false, center: true,
      cell : r => (
        <RoleChips
          partner={r.ClientPartner}
          manager={r.ClientManager}
        />
      )
    },
    { name: 'Bill Type', selector: row => row.BillType , sortable: true , wrap: true , width:'100px', grow: .5, center: true },
    { name: 'Level', selector: row => row.Level, sortable: true , width:'80px', grow: .5, center: true },
    { 
      name: 'Population' , sortable: true , wrap: true , width: '260px', grow: 2, center: true
      ,
    selector: row => {
      if (row.Level === 'SERV') {
      const arr = Array.isArray(row.Population)
        ? row.Population
        : [row.Population];

      return arr
        .slice()
        .sort((a, b) => (a || '').localeCompare(b || ''))
        .join(', ');
    } else {
      const names = row.Population
        .map(i => jobLookup[i] || '')
        .filter(Boolean)
        .slice()
        .sort((a, b) => a.localeCompare(b));

      return names.join(', ');
    }
      // if (row.Level === 'SERV') 
      //     return row.Population.join(', ');
      // else 
      //     return row.Population.map(i => jobLookup[i] || '').join(', ');
    },
    cell: row => {
      // build a flat list of labels in every case
      let labels;
      if (row.Level === 'SERV') {
        labels = Array.isArray(row.Population)
          ? row.Population
          : [row.Population];
      } else {
        labels = row.Population.map(i => jobLookup[i] || `#${i}`);
      }

      // sort alphabetically
      const sortedLabels = labels
        .slice()
        .sort((a, b) => (a || '').localeCompare(b || ''));
        // if (row.Level === 'SERV') 
        //   {
        //     labels = [row.Population]
        //   }
        // else 
        //     labels = row.Population.map(i => jobLookup[i] || `#${i}`);

      // show up to 3 chips, stash the rest
      const visible = sortedLabels.slice(0, 3);
      const hidden  = sortedLabels.slice(3);

      return (
        <div className="chip2-container population-chips">
          {visible.map(lbl => (
            <span key={lbl} className="chip2 population-chip">
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
    { name: 'Frequency', selector: row => row.Frequency , sortable: true , wrap: true , width:'120px', grow: .5, center: true },
    // { name: 'Narrative', selector: row => ( <div title={row.Narrative}> {row.Narrative?.length > 75 ? row.Narrative.slice(0, 75) + '...' : row.Narrative} </div>
    //   ), sortable: true , wrap: true, width: '200px', grow: 1, center: true },
    {
      name: 'Narrative',
      selector: row => row.Narrative || '',  // <-- plain string for sort
      sortable: true,
      wrap: true,
      width: '260px',
      grow: 1,
      center: true,
      cell: row => {
        const full = row.Narrative || '';
        const short =
          full.length > 75 ? full.slice(0, 75) + '...' : full;

        return <div title={full}>{short}</div>;
      }
    },
    // { name: 'Bill Amount', selector: row => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    //   .format(row.BillAmount || 0), sortable: true , grow: .5, center: true },
    {
      name: 'Bill Amount',
      selector: row => row.BillAmount ?? 0,  // <-- numeric value for sorting
      sortable: true,
      right: true,
      grow: 0.5,
      cell: row =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(row.BillAmount || 0)
    },
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
            + Create Recurring
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
            onRowDelete={openDeleteModal}
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
        allData={enrichedRows}
      />
            <EditRecurringModal
        isOpen={isModalOpen}
        onRequestClose={closeEditModal}
        initialData={selectedRow}
        onSave={handleUpdate}
        availableJobs={sortedJobMapping}
        allData={enrichedRows} 
      />
            <DeleteRecurringModal
        isOpen={isDeleteOpen}
        onRequestClose={closeDeleteModal}
        record={rowToDelete}
        jobLookup={jobLookup}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
}
