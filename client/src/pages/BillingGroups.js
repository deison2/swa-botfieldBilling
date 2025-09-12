
  import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
  import Sidebar from '../components/Sidebar';
  import GeneralDataTable from '../components/DataTable';
  import TopBar from '../components/TopBar';
  import './BillingGroups.css';
  import sampleBillingGroupData     from '../devSampleData/sampleBillingGroupData.json';
  import sampleChildBillingData     from '../devSampleData/sampleChildBillingData.json';

  import {
    dynamicClientLoad,
    dynamicChildBillLoad, 
    updateClientGrouping,
    updateBillingInstructions,
    getBillingGroups,
    addBillingGroup
  } from '../services/BillingGroups.js';
  import { createPortal } from 'react-dom';

export function SimplePopover({
  open,
  anchorRef,           // ref to the element the popover should align to
  onClose,             // called when user clicks scrim
  children,
  offset = { x: 12, y: 12 }, // pixel offset from anchor's right/top
  maxWidth = 320,
  withScrim = true,    // set false if you don't want a backdrop
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // compute position relative to the anchor
const computePos = useCallback(() => {
  const el = anchorRef?.current;
  if (!el) return;
  const r = el.getBoundingClientRect();

  let left = r.right + offset.x;
  let top  = r.top + offset.y;

  left = Math.max(8, Math.min(left, window.innerWidth - maxWidth - 8));
  top  = Math.max(8, top);

  setPos({ top, left });
}, [anchorRef, offset.x, offset.y, maxWidth]);

useEffect(() => {
  if (!open) return;
  computePos();
  const onResize = () => computePos();
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}, [open, computePos]);

  if (!open) return null;

  return createPortal(
    <>
      {withScrim && (
        <div
          className="sp-scrim"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 10000,
          }}
        />
      )}

      <div
        className="sp-popover"
        role="dialog"
        aria-modal={withScrim ? 'true' : 'false'}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          maxWidth,
          zIndex: 10001,
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}


  const BC_COLORS = {
  self:   '#003C4B', // self-referenced, no children
  parent: '#24764D', // parent with children
  child:  '#AEDCAA', // is a child
};

// Tiny header with hover legend for Billing Client
function BillingClientHeader() {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);

  return (
    <div ref={anchorRef} className="bc-legend-wrap"onMouseEnter={() => setOpen(true)}
  onMouseLeave={() => setOpen(false)}>
      <span>Billing Client</span>
      <button
        type="button"
        className="bc-legend-info"
        onClick={() => setOpen(v => !v)}
      >
        ?
      </button>

      <SimplePopover
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        maxWidth={320}
        withScrim={false}  // set true if you want the dark backdrop
        offset={{ x: 10, y: 10 }}
      >
        <div className="bc-legend-title">Color legend</div>
        <div className="bc-legend-row">
          <span className="bc-chip" style={{ background: BC_COLORS.self }} />
          <div className="bc-legend-text"><strong>Self</strong> — No parent/child link.</div>
        </div>
        <div className="bc-legend-row">
          <span className="bc-chip" style={{ background: BC_COLORS.parent }} />
          <div className="bc-legend-text"><strong>Parent</strong> — Has children; bills to itself.</div>
        </div>
        <div className="bc-legend-row">
          <span className="bc-chip" style={{ background: BC_COLORS.child }} />
          <div className="bc-legend-text"><strong>Child</strong> — Bills to parent.</div>
        </div>
      </SimplePopover>
    </div>
  );
}



  
const DEFAULT_EDITED = Object.freeze({
  grouping: '-',
  instructions: '',
  billingClient: undefined,
});

  const useDebouncedValue = (value, delay = 500) => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const id = setTimeout(() => setDebounced(value), delay);
      return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
  };

  const BillingInstructionsCell = ({ code, value, onChange, persistEdit }) => {
  const debounced = useDebouncedValue(value, 3000); // ← 1s debounce
  const lastSentRef = useRef((value ?? '').trim()); // prevent firing on mount

  // Save when the debounced value changes
  useEffect(() => {
    const v = (debounced ?? '').trim();
    if (v === lastSentRef.current) return; // nothing new to save
    lastSentRef.current = v;
    persistEdit(code, 'instructions', v);
  }, [debounced, code, persistEdit]);

  // Flush immediately on blur/Enter
  const flushNow = () => {
    const v = (value ?? '').trim();
    if (v !== lastSentRef.current) {
      lastSentRef.current = v;
      persistEdit(code, 'instructions', v);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      flushNow();
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={flushNow}
      onKeyDown={onKeyDown}
      placeholder="Add instructions…"
      className="bg-input"
      style={{ width: '100%' }}
    />
  );
};

  export default function BillingGroups() {

    const classifyBillingClient = (clientCode) => {
  if (relChildSet.has(clientCode)) return 'child';
  if ((relParentCount.get(clientCode) || 0) > 0) return 'parent';
  return 'self';
};

const [relChildSet, setRelChildSet] = useState(new Set());
const [relParentCount, setRelParentCount] = useState(new Map());
const [relChildToParent, setRelChildToParent] = useState(new Map());

const buildFromPairs = (pairs = []) => {
  const childSet = new Set();            // all children
  const parentCount = new Map();         // parent -> #children
  const childToParent = new Map();       // child -> parent

  for (const row of pairs) {
    const p = String(row?.parentCode ?? '').trim();
    const c = String(row?.childCode  ?? '').trim();
    if (!p || !c) continue;

    // Only keep real parent/child links
    if (p === c) continue;

    childSet.add(c);
    parentCount.set(p, (parentCount.get(p) || 0) + 1);

    // If duplicates exist, latest wins (or change logic as needed)
    childToParent.set(c, p);
  }
  return { childSet, parentCount, childToParent };
};

useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const pairs = await getBillingGroups(); // returns [{ parentCode, childCode }, ...]
      console.log(pairs);
      if (cancelled) return;
      const { childSet, parentCount, childToParent } = buildFromPairs(pairs);
      setRelChildSet(childSet);
      setRelParentCount(parentCount);
      setRelChildToParent(childToParent);
    } catch (e) {
      console.error('getBillingGroups failed:', e);
      if (!cancelled) {
        setRelChildSet(new Set());
        setRelParentCount(new Map());
      }
    }
  })();
  return () => { cancelled = true; };
}, []);

  // -------------------------------
  // Helpers
  // -------------------------------

  // Data state
  const [rows, setRows] = useState([]);                // search results
  const [bills, setBillingData] = useState([]);        // child billing rows (for hover modal)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search state
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 500);

  // Inline edit state (per ClientCode)
  const [edited, setEdited] = useState({/* [ClientCode]: { grouping, instructions, billingClient } */});

  // Hover modal state
  const [hoverInfo, setHoverInfo] = useState({
    visible: false,
    x: 0,
    y: 0,
    clientCode: null,
  });
  const tableContainerRef = useRef(null);

const requestIdRef = useRef(0);

useEffect(() => {
  let active = true;
  const reqId = ++requestIdRef.current;

  const run = async () => {
    setError('');

    const q = (debouncedSearch || '').trim();
    if (q.length < MIN_QUERY_LEN) {
      setRows([]);
      setBillingData([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Fire both requests using the SAME searchText
      const [clientData, billData] = await Promise.all([
        dynamicClientLoad(q),          // your existing client search
        dynamicChildBillLoad(q),       // ← now takes the same q
      ]);

      if (!active || reqId !== requestIdRef.current) return;

      setRows(Array.isArray(clientData) ? clientData : []);
      setBillingData(Array.isArray(billData) ? billData : []);

    } catch (e) {
      if (!active || reqId !== requestIdRef.current) return;

      console.error('search/billing fetch error:', e);

      // Fallback to local samples filtered by q
      const ql = q.toLowerCase();
      const fallbackClients = (sampleBillingGroupData || []).filter(
        r =>
          String(r.ClientCode || '').toLowerCase().includes(ql) ||
          String(r.ClientName || '').toLowerCase().includes(ql)
      );
      setRows(fallbackClients);

      // Filter child sample by whatever key your rows use (ClientCode / clientCode)
      const codeSet = new Set(fallbackClients.map(r => r.ClientCode));
      const fallbackBills = (sampleChildBillingData || []).filter(
        b => codeSet.has(b.ClientCode || b.clientCode)
      );
      setBillingData(fallbackBills);

    } finally {
      if (active && reqId === requestIdRef.current) setLoading(false);
    }
  };

  run();
  return () => { active = false; };
}, [debouncedSearch]);


 const updateEdited = useCallback((code, patch) => {
  setEdited(prev => {
    const prevFor = prev[code] ?? DEFAULT_EDITED;
    return { ...prev, [code]: { ...prevFor, ...patch } };
  });
}, []);

  // Placeholder “save” hooks you’ll wire up later
const persistEdit = useCallback(async (code, field, value) => {
  try {
    if (field === 'instructions') {
      
      console.log('Persisting billing instructions for', code, 'with value:', value);
      await updateBillingInstructions(code, value);
    }
       else if (field === 'billingClient') {
     console.log('Persisting billing client for', code, '→ parent:', value);
      await addBillingGroup(code, value);
  }
  } 
  catch (e) {
    console.error('Persist failed:', e);
    throw e;
  }
}, []);


  // Hover modal handlers
  const handleMagnifyEnter = (evt, clientCode) => {
    const rect = tableContainerRef.current?.getBoundingClientRect();
    const offsetX = rect ? evt.clientX - rect.left : evt.clientX;
    const offsetY = rect ? evt.clientY - rect.top : evt.clientY;
    setHoverInfo({ visible: true, x: offsetX, y: offsetY, clientCode });
  };

  const handleMagnifyMove = (evt) => {
    if (!hoverInfo.visible) return;
    const rect = tableContainerRef.current?.getBoundingClientRect();
    const offsetX = rect ? evt.clientX - rect.left : evt.clientX;
    const offsetY = rect ? evt.clientY - rect.top : evt.clientY;
    setHoverInfo(info => ({ ...info, x: offsetX, y: offsetY }));
  };

  const handleMagnifyLeave = () => {
    setHoverInfo({ visible: false, x: 0, y: 0, clientCode: null });
  };
  
    const MIN_QUERY_LEN = 3;
    const hasMinChars = (search.trim().length >= MIN_QUERY_LEN);

    const toArray = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};
  const norm = (v) => String(v ?? '').toLowerCase().trim();

  // --- Billing Client modal state
const [bcModal, setBcModal] = useState({ open: false, forClientCode: null });
const [bcQuery, setBcQuery] = useState('');
const [bcLoading, setBcLoading] = useState(false);
const [bcError, setBcError] = useState('');
const [bcResults, setBcResults] = useState([]);

// Tracks which codes are *parents* (have at least one child) based on the latest fetch
const [bcTargetIsParent, setBcTargetIsParent] = useState(false);

const openBillingClientModal = (code) => {
  // If this code is a parent (has ≥1 child), do not allow changing billing client
  if ((relParentCount.get(code) || 0) > 0) {
    // optional: toast / screenreader alert here
    return;
  }
  setBcModal({ open: true, forClientCode: code });
  setBcQuery('');
  setBcResults([]);
  setBcError('');
  setBcTargetIsParent(false);
};


const closeBillingClientModal = () => {
  setBcModal({ open: false, forClientCode: null });
  setBcQuery('');
  setBcResults([]);
  setBcError('');
  setBcTargetIsParent(false);
};

useEffect(() => {
  if (!bcModal.open) return;
  const onKey = (e) => { if (e.key === 'Escape') closeBillingClientModal(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [bcModal.open]);


const isMatch = (row, q) => {
  const code = String(row.ClientCode ?? '').toLowerCase();
  const name = String(row.ClientName ?? '').toLowerCase();
  return code.includes(q) || name.includes(q);
};

useEffect(() => {
  if (!bcModal.open) return;

  const q = bcQuery.trim().toLowerCase();
  setBcError('');

  if (q.length < MIN_QUERY_LEN) {
   if (bcModal.forClientCode) {
     const self = rows.find(r => r.ClientCode === bcModal.forClientCode);
     setBcResults(self ? [self] : []);
   } else {
     setBcResults([]);
   }
    setBcLoading(false);
    return;
  }

  setBcLoading(true);
  const t = setTimeout(async () => {
    try {
      const raw = await dynamicClientLoad(q);
      const arr = Array.isArray(raw) ? raw : (raw?.data || raw?.items || []);
      // find parents/children from the fetched slice

      // filter to query match and exclude children (only parent-eligible remain)
      const filtered = arr
        .filter(r => isMatch(r, q))
        .filter(r => !relChildSet.has(r.ClientCode));
      
      setBcResults(filtered.slice(0, 50));
    } catch (e) {
      console.error('Billing Client modal search failed:', e);
      setBcResults([]);
      setBcError('Search failed. Try again.');
    } finally {
      setBcLoading(false);
    }
  }, 500);

  return () => clearTimeout(t);
}, [bcModal.open, bcQuery, relChildSet, bcModal.forClientCode, rows]);

// Determine if the target is a parent (must self-reference)
useEffect(() => {
  if (!bcModal.open || !bcModal.forClientCode) return;
 // compute from relationship state you already hold
 setBcTargetIsParent((relParentCount.get(bcModal.forClientCode) || 0) > 0);
}, [bcModal.open, bcModal.forClientCode, relParentCount]);


const handleBillingClientSelect = async (selected) => {
  const child = bcModal.forClientCode;
  if (!child || !selected) return;

  const nextParent = selected.ClientCode;

  // Rule: if target is a parent, it must be its own parent
  if ((relParentCount.get(child) || 0) > 0 && nextParent !== child) {
    setBcError('This client has children and must be its own billing parent.');
    return;
  }

  // Snapshot prev state (for rollback)
  const prevEdited = edited[child];
  const prevParent = relChildToParent.get(child) ?? child;

  // --- 1) Optimistic UI text in pill
  updateEdited(child, { billingClient: nextParent });

  // --- 2) Optimistic relationship update (drives color/disabled state)
  // Clone to trigger React updates
  const newChildToParent = new Map(relChildToParent);
  const newChildSet      = new Set(relChildSet);
  const newParentCount   = new Map(relParentCount);

  const dec = (map, key) => {
    const cur = map.get(key) || 0;
    if (cur <= 1) map.delete(key);
    else map.set(key, cur - 1);
  };
  const inc = (map, key) => map.set(key, (map.get(key) || 0) + 1);

  if (prevParent !== nextParent) {
    // Remove child from old parent count if it was a real child before
    if (prevParent !== child) dec(newParentCount, prevParent);

    if (nextParent === child) {
      // Self-parent: no longer a child
      newChildSet.delete(child);
      newChildToParent.delete(child);
    } else {
      // Becomes (or stays) a child of nextParent
      newChildSet.add(child);
      newChildToParent.set(child, nextParent);
      inc(newParentCount, nextParent);
    }
  }

  // Commit optimistic relationship state
  setRelChildToParent(newChildToParent);
  setRelChildSet(newChildSet);
  setRelParentCount(newParentCount);

  // --- 3) Persist; rollback on failure
  try {
    await persistEdit(child, 'billingClient', nextParent);
  } catch (e) {
    console.error('Failed to save billing client:', e);

    // Roll back edited
    updateEdited(child, prevEdited || { billingClient: prevParent });

    // Roll back relationships
    setRelChildToParent(relChildToParent);
    setRelChildSet(relChildSet);
    setRelParentCount(relParentCount);
  } finally {
    closeBillingClientModal();
  }
};



  // --- modal state
  const [groupModal, setGroupModal] = useState({ open: false, forClientCode: null });
  const [groupModalQuery, setGroupModalQuery] = useState('');
  const [groupModalLoading, setGroupModalLoading] = useState(false);
  const [groupModalError, setGroupModalError] = useState('');
  const [groupModalResults, setGroupModalResults] = useState([]);

  const openGroupModal = (code) => {
  setGroupModal({ open: true, forClientCode: code });
  setGroupModalQuery('');        // start empty; or prefill with current grouping
  setGroupModalResults([]);
  setGroupModalError('');
};
const closeGroupModal = () => {
  setGroupModal({ open: false, forClientCode: null });
  setGroupModalQuery('');
  setGroupModalResults([]);
  setGroupModalError('');
};

// ESC to close
useEffect(() => {
  if (!groupModal.open) return;
  const onKey = (e) => { if (e.key === 'Escape') closeGroupModal(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [groupModal.open]);

// pick handler: store a readable string + call your backend stub
const handleGroupSelect = async (selected) => {
  const target = groupModal.forClientCode;
  if (!target) return;

  // New value to display/store
  const newValue = `${selected.ClientCode} - ${selected.ClientName}`;
  const newClientCode = selected.ClientCode;

  // Keep the old value for rollback if needed
  const oldValue =
    edited[target]?.grouping ??
    rows.find(r => r.ClientCode === target)?.ClientGrouping ??
    '';

  // 1) Optimistic UI update
  updateEdited(target, { grouping: newValue });
  setRows(prev => prev.map(r => r.ClientCode === target ? { ...r, ClientGrouping: newValue } : r));

  // 2) Attempt to persist
  try {
    console.log('Updating client grouping for', target, 'to', newClientCode);
    updateClientGrouping(target, newClientCode);            // <-- your backend call
    // Optional: toast.success('Grouping updated');
  } catch (e) {
    console.error('Failed to save grouping:', e);
    // 3) Roll back UI on failure
    updateEdited(target, { grouping: oldValue });
    setRows(prev => prev.map(r => r.ClientCode === target ? { ...r, ClientGrouping: oldValue } : r));
    // Optional: toast.error(e.message || 'Failed to update grouping');
  } finally {
    closeGroupModal();
  }
};


useEffect(() => {
  if (!groupModal.open) return;

  const q = groupModalQuery.trim();
  setGroupModalError('');

  if (q.length < MIN_QUERY_LEN) {
    setGroupModalResults([]);
    setGroupModalLoading(false);
    return;
  }

  setGroupModalLoading(true);
  const controller = new AbortController();
  const t = setTimeout(async () => {
    try {
     const raw = await dynamicClientLoad(q);

      const arr = toArray(raw);
      // safety filter in case API returns everything
      const filtered = arr.filter(r =>
        norm(r.ClientCode).includes(norm(q)) || norm(r.ClientName).includes(norm(q))
      );
      setGroupModalResults(filtered);
    } catch (e) {
      console.error('Grouping modal search failed:', e);
      const filtered = (sampleBillingGroupData || []).filter(r =>
        norm(r.ClientCode).includes(norm(q)) || norm(r.ClientName).includes(norm(q))
      ).slice(0, 50);
      setGroupModalResults(filtered);
      setGroupModalError('Showing local results due to a search error.');
    } finally {
      setGroupModalLoading(false);
    }
  }, 500);

  return () => { clearTimeout(t); controller.abort(); };
}, [groupModal.open, groupModalQuery]);

const tableData = useMemo(() => {
  return rows.map(r => {
    const e = edited[r.ClientCode] ?? DEFAULT_EDITED;
    const parentForThisClient = relChildToParent.get(r.ClientCode);
    return {
      ...r,
      _instructions:  e.instructions ?? '',
      _grouping:      r.ClientGrouping ?? '',
      _billingClient: e.billingClient ?? parentForThisClient ?? r.ClientCode,
    };
  });
}, [rows, edited, relChildToParent]);

// Map all returned items by their parent, sorted by totalChildDrafts desc
const childByParent = useMemo(() => {
  const m = new Map();

  const getParent = (r) =>
    String(r.parentClient ?? r.ParentClient ?? r.ParentCode ?? '').trim();

  const getTotalDrafts = (r) =>
    Number(r.totalChildDrafts ?? r.TotalChildDrafts ?? r.totalDrafts ?? 0);

  (bills || []).forEach((r) => {
    const parent = getParent(r);
    if (!parent) return;
    if (!m.has(parent)) m.set(parent, []);
    m.get(parent).push(r);
  });

  // Sort each parent's array by totalChildDrafts descending
  for (const arr of m.values()) {
    arr.sort((a, b) => getTotalDrafts(b) - getTotalDrafts(a));
  }

  return m;
}, [bills]);



  // Columns
  const columns = useMemo(() => {
    return [
      {
        name: '',
        width: '56px',
        sortable: false,
        cell: (row) => (
          <span
            className="mag-icon"
            onMouseEnter={(e) => handleMagnifyEnter(e, row.ClientCode)}
            onMouseMove={handleMagnifyMove}
            onMouseLeave={handleMagnifyLeave}
            style={{ cursor: 'zoom-in', fontSize: '18px', userSelect: 'none' }}
            aria-label={`View child billing for ${row.ClientCode}`}
          >
            🔍
          </span>
        )
      },
      {
        name: 'Client Code',
        grow: 0.5,
        selector: row => row.ClientCode,
        sortable: false,
        wrap: true
      },
      {
        name: 'Client Name',
        grow: 2,
        selector: row => row.ClientName,
        sortable: false,
        wrap: true
      },
      {
        name: 'Client Office',
        grow: 0.5,
        selector: row => row.ClientOffice,
        sortable: false,
        wrap: true
      },
      {
        name: 'Client Partner',
        grow: 1,
        selector: row => row.ClientPartner,
        sortable: false,
        wrap: true
      },
      {
        name: 'Client Manager',
        grow: 1,
        selector: row => row.ClientManager,
        sortable: false,
        wrap: true
      },
      {
  name: 'Client Grouping',
  grow: 2,
  sortable: false,
  cell: (row) => {
    const code = row.ClientCode;
    const displayGrouping = (row._grouping ?? '').trim();
    const label   = displayGrouping || 'Set grouping…';
    const isEmpty = !displayGrouping;

    return (
      <button
        type="button"
        className={`bg-pill-btn ${isEmpty ? 'is-empty' : 'is-filled'}`}
        onClick={() => openGroupModal(code)}
        aria-label={`Change grouping for ${code}`}
        title="Click to choose grouping"
      >
        <span className="bg-pill-icon" aria-hidden>🔎</span>
        <span className="bg-pill-text">{label}</span>
      </button>
    );
  }
}
,
      {
  name: 'Billing Instructions',
    grow: 2,
    sortable: false,
    ignoreRowClick: true,
    cell: (row) => {
      const code = row.ClientCode;
      return (
        <BillingInstructionsCell
          code={code}
          value={row._instructions ?? ''}
          onChange={(val) => updateEdited(code, { instructions: val })}
          persistEdit={persistEdit}
        />
    );
  }
}
      ,
      {
        name: <BillingClientHeader />,
        grow: 2,
        sortable: false,
    ignoreRowClick: true,
        cell: (row) => {
          const code = row.ClientCode;
          const current = (row._billingClient ?? code).trim();
   const isSelf = current === code;
   const label = isSelf ? code : current;
   const isEmpty = !current;
   const kind  = classifyBillingClient(code); // 'self' | 'parent' | 'child'
   const color = BC_COLORS[kind];
   return (
     <button
       type="button"
       className={`bg-pill-btn ${isEmpty ? 'is-empty' : 'is-filled'} bc-${kind}`}
       onClick={() => openBillingClientModal(code)}
       aria-label={`Change billing client for ${code}`}
       title="Click to choose billing client"
       style={{
         // Inline safety in case CSS doesn't load
         borderColor: color,
         boxShadow: `0 0 0 2px ${color}`,
       }}
     >
       <span className="bg-pill-icon" aria-hidden>🔎</span>
       <span className="bg-pill-text">{label}</span>
     </button>
   );
        }
      }
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateEdited, persistEdit, openGroupModal, openBillingClientModal, relChildSet, relParentCount]);
  

  // Hover Modal Content
  const hoverContent = useMemo(() => {
  const parentCode = hoverInfo.clientCode;
  if (!parentCode) return null;

  const children = childByParent.get(parentCode) || [];
  if (!children.length) {
    return (
      <div className="hover-modal-inner">
        <div className="hover-title"># of prior 12-m bills for {parentCode}</div>
        <div className="hover-empty">No prior 12-m bills.</div>
      </div>
    );
  }

  const getChildCode = (r) => String(r.childClient ?? r.ChildCode ?? r.ClientCode ?? '').trim();
  const getChildName = (r) => String(r.childName ?? r.ChildName ?? r.ClientName ?? '').trim();
  const totalChildDrafts= (r) => Number(r.totalChildDrafts);
  const getService = (r) => r.Service ?? r.service;
  const getNotes = (r) => r.Notes ?? r.notes;

  return (
    <div className="hover-modal-inner">
      <div className="hover-title">
        # of prior 12-m bills for {parentCode}
      </div>
      <div className="hover-list">
        {children.map((c, idx) => (
          <div className="hover-item" key={`${parentCode}-${idx}`}>
            <div className="hover-line">
              <strong>({getChildCode(c)}</strong>) {getChildName(c)} - {totalChildDrafts(c)}
            </div>
            {getService(c) && <div className="hover-badge">{getService(c)}</div>}
            {getNotes(c) && <div className="hover-notes">{getNotes(c)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}, [hoverInfo.clientCode, childByParent]);


  return (
    <div className="app-container">
      <Sidebar />
      <TopBar />

      <main className="main-content">
        <div className="table-section" ref={tableContainerRef}>
          <div className="bg-header">
            <h2>Billing Groups</h2>
            <p className="bg-sub">Search by client code or client name. Results load as you type.</p>
          </div>

          <input
            type="text"
            placeholder={`Search clients by code or name (min ${MIN_QUERY_LEN} chars)…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-search"
          />

          {!hasMinChars && search && (
          <div className="bg-sub" style={{ marginTop: 6 }}>
          Keep typing — need at least {MIN_QUERY_LEN} characters.
          </div>
          )}

          {error && <div className="bg-error">{error}</div>}

          <GeneralDataTable
            keyField="ClientCode"
            title=""
            columns={columns}
            data={tableData}
            progressPending={loading}
            pagination
            highlightOnHover
            striped
          />

          {/* Floating hover modal */}
          {hoverInfo.visible && (
            <div
              className="hover-modal"
              style={{
                position: 'absolute',
                padding: '12px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: 'white',
                left: Math.max(8, hoverInfo.x + 12),
                top: Math.max(8, hoverInfo.y + 80),
                zIndex: 1000
              }}
              onMouseLeave={handleMagnifyLeave}
            >
              {hoverContent}
            </div>
          )}

          {bcModal.open && (
  <div
    className="bg-modal-overlay"
    onClick={(e) => { if (e.target === e.currentTarget) closeBillingClientModal(); }}
  >
    <div className="bg-modal">
      <div className="bg-modal-header">
        <div className="bg-modal-title">
          Select billing client for <strong>{bcModal.forClientCode}</strong>
          {bcTargetIsParent && (
            <span className="bg-tag" style={{ marginLeft: 8 }}>Parent account</span>
          )}
        </div>
        <button className="bg-modal-close" onClick={closeBillingClientModal} aria-label="Close">×</button>
      </div>

      <input
        type="text"
        className="bg-input"
        placeholder={`Search client code or name (min ${MIN_QUERY_LEN} chars)…`}
        value={bcQuery}
        onChange={(e) => setBcQuery(e.target.value)}
        autoFocus
      />

      {bcError && <div className="bg-error" style={{ marginTop: 8 }}>{bcError}</div>}

      <div className="bg-modal-results">
        {bcLoading && <div className="bg-loading">Searching…</div>}

        {!bcLoading && bcQuery.trim().length >= MIN_QUERY_LEN && bcResults.length === 0 && (
          <div className="bg-empty">No matching billing clients found.</div>
        )}

        {!bcLoading && bcResults.map((r) => (
          <div
            key={r.ClientCode}
            className="bg-result-row"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleBillingClientSelect(r)}
            title={`${r.ClientCode} — ${r.ClientName}`}
          >
            <div className="bg-result-code">{r.ClientCode}</div>
            <div className="bg-result-name">{r.ClientName}</div>
          </div>
        ))}
      </div>

      <div className="bg-modal-footer">
        <button type="button" className="bg-btn" onClick={closeBillingClientModal}>Cancel</button>
      </div>
    </div>
  </div>
)}


          {groupModal.open && (
  <div
    className="bg-modal-overlay"
    onClick={(e) => { if (e.target === e.currentTarget) closeGroupModal(); }}
  >
    <div className="bg-modal">
      <div className="bg-modal-header">
        <div className="bg-modal-title">
          Select grouping for <strong>{groupModal.forClientCode}</strong>
        </div>
        <button className="bg-modal-close" onClick={closeGroupModal} aria-label="Close">×</button>
      </div>

      <input
        type="text"
        className="bg-input"
        placeholder={`Search client code or name (min ${MIN_QUERY_LEN} chars)…`}
        value={groupModalQuery}
        onChange={(e) => setGroupModalQuery(e.target.value)}
        autoFocus
      />

      {groupModalError && <div className="bg-error" style={{ marginTop: 8 }}>{groupModalError}</div>}

      <div className="bg-modal-results">
        {groupModalLoading && <div className="bg-loading">Searching…</div>}

        {!groupModalLoading && groupModalQuery.trim().length >= MIN_QUERY_LEN && groupModalResults.length === 0 && (
          <div className="bg-empty">No matching clients found.</div>
        )}

        {!groupModalLoading && groupModalResults.map((r) => (
          <div
            key={r.ClientCode}
            className="bg-result-row"
            onMouseDown={(e) => e.preventDefault()}  // let click register before blur
            onClick={() => handleGroupSelect(r)}
            title={`${r.ClientCode} - ${r.ClientName}`}
          >
            <div className="bg-result-code">{r.ClientCode}</div>
            <div className="bg-result-name">{r.ClientName}</div>
          </div>
        ))}
      </div>

      <div className="bg-modal-footer">
        <button type="button" className="bg-btn" onClick={closeGroupModal}>Cancel</button>
      </div>
    </div>
  </div>
)}

        </div>
      </main>
    </div>
  );
}
