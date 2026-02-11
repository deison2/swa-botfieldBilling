import React, { useState, useEffect, useMemo } from "react";
import { PopoverPortal } from "./ExistingDrafts";
import "./ExistingDrafts.css";
import KbRunnerLoader from "../components/KbRunnerLoader"; // adjust path as needed
import LoaderMini from "../components/LoaderMini"; // adjust path if needed


import {
  getDraftFeeAnalysis,
  getDraftFeeWIPSpecialList,
  getDraftFeeNarratives,
  saveDraftFeeAnalysisRow,
  updateDraftFeeNarrative,
  deleteDraftFeeNarrative,
  addDraftFeeNarrative,
  draftFeeDeleteWipAllocation,
  draftFeeAddClients,
  draftFeeClientOrGroupWIPList, //show wip population
  populateWIPAnalysisDrillDown,
  recalculateWIPAllocFromSummary
} from '../services/ExistingDraftsService';

import {
  dynamicClientLoad as getClients
} from "../services/BillingGroups";

const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n ?? 0);

// Strip HTML to plain text for editing
const stripHtml = (html) => {
  if (!html) return "";
  return String(html)
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
};

// Escape when wrapping back into HTML
const escapeHtml = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Wrap plain text into standard PE narrative HTML
const wrapNarrativeHtml = (text) => {
  const t = (text || "").trim();
  if (!t) return "";
  return `<p><font style="font-family: Arial, Helvetica, sans-serif; font-size: 10pt;">${escapeHtml(
    t
  )}</font></p>`;
};

// Helpers for money parsing / formatting
const parseMoneyInput = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const formatMoneyInput = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const num =
    typeof value === "number" ? value : parseMoneyInput(String(value));
  return currency(num);
};


function rowKey(row, i) {
  return String(row?.WIPIndex ?? row?.WipIndex ?? row?.Id ?? `row-${i}`);
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },
  modal: {
    width: "min(1100px, 95vw)",
    maxHeight: "90vh",
    background: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #eee",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  closeBtn: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
  },
  section: { padding: 16, display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", alignItems: "center", gap: 12 },
  rowBetween: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  input: {
    width: "min(420px, 100%)",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #ddd",
  },
  tableWrap: { overflow: "auto", border: "1px solid #eee", borderRadius: 10 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  primaryBtn: {
    border: "1px solid #1f6feb",
    background: "#1f6feb",
    color: "#fff",
    borderRadius: 8,
    padding: "7px 10px",
  },
  secondaryBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 8,
    padding: "7px 10px",
    cursor: "pointer",
  },
  muted: { color: "#666", fontSize: 13 },
  error: { color: "#b42318", fontSize: 13 },
  empty: { textAlign: "center", padding: 14, color: "#666" },
  footer: {
    padding: 12,
    borderTop: "1px solid #eee",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },
};

export default function ExistingDraftsEditTray({
      open,
      loading,
      onClose,
      draftIdx,
      contindex,
      clientName,
      clientCode,
      billedClient,
      analysisItems,
      narrativeItems,
      currentUser,
      billThroughDate,
      onSave,
      debttrandate,
      wipindexes,
      onWipAdded
}) {
  // ---------- local editable state ----------
  const [analysisRows_Orig, setanalysisRows_Orig] = useState([]);
  const [narrRows_Orig, setnarrRows_Orig] = useState([]);
  const [analysisRows_New, setanalysisRows_New] = useState([]);
  const [narrRows_New, setnarrRows_New] = useState([]);
  const [wipIndexes_Orig, setWipIndexes_Orig] = useState([]);
  const updateTimersRef = React.useRef({});
  const narrUpdateTimersRef = React.useRef({}); // { [rowKey]: timeoutId }


  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [billingNotes, setBillingNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState("");

  const [selectedContIndex, setSelectedContIndex] = useState(null);
  const [selectedClientCode, setSelectedClientCode] = useState(null);
  const [selectedClientName, setSelectedClientName] = useState(null);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [wipModalOpen, setWipModalOpen] = useState(false);



  const [wipRows, setWipRows] = useState([]);
  const [wipLoading, setWipLoading] = useState(false);
  const [wipError, setWipError] = useState("");

  const [checkedMap, setCheckedMap] = useState({}); // key -> boolean
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

const DRILL_OPTIONS = ["Staff", "Analysis", "Task", "Roles"];
const [drillOpen, setDrillOpen] = useState(false);
const [drillParentIndex, setDrillParentIndex] = useState(null); // which analysis row is drilled
const [drillSelected, setDrillSelected] = useState("Staff");
const [drillRows, setDrillRows] = useState([]); // whatever populate returns

const clearAllTimers = () => {
  Object.values(updateTimersRef.current).forEach(clearTimeout);
  updateTimersRef.current = {};

  Object.values(narrUpdateTimersRef.current).forEach(clearTimeout);
  narrUpdateTimersRef.current = {};
};

const resetAllState = () => {
  clearAllTimers();

  // revert editable data back to original (or empty if you prefer)
  setanalysisRows_New(analysisRows_Orig);
  setnarrRows_New(narrRows_Orig);

  // top-level form fields
  setReason("");
  setOtherReason("");
  setBillingNotes("");
  setError("");
  setSaving(false);

  // modals + client/wip state
  setSearchText("");
  setClients([]);
  setClientsLoading(false);
  setClientsError("");

  setSelectedContIndex(null);
  setSelectedClientCode(null);
  setSelectedClientName(null);

  setClientModalOpen(false);
  setWipModalOpen(false);

  setWipRows([]);
  setWipLoading(false);
  setWipError("");
  setCheckedMap({});
  setAddLoading(false);
  setAddError("");

  // drill state
  setDrillOpen(false);
  setDrillParentIndex(null);
  setDrillSelected("Staff");
  setDrillRows([]);
};



  // ---------- sync props -> local state whenever we get fresh data ----------

useEffect(() => {
  if (!open) {
    resetAllState();
  }
}, [open]);


  useEffect(() => {
    if (!open) return;
    const rows = (analysisItems ?? []).map((r) => {
      const base =
        r.BillInClientCur ?? r.BillAmount ?? r.BalInClientCur ?? 0;
      return {
        ...r,
        BillInClientCur: Number(base) || 0,
        _draftAmtDisplay: formatMoneyInput(base),
      };
    });
    setanalysisRows_Orig(rows);
    setanalysisRows_New(rows);
  }, [analysisItems, open]);

  useEffect(() => {
    if (!open) return;
    const rows = (narrativeItems ?? []).map((r) => {
      const amt = r.Amount ?? 0;
      return {
        ...r,
        // edit narrative as plain text
        FeeNarrative: stripHtml(r.FeeNarrative || ""),
        Amount: Number(amt) || 0,
        _amountDisplay: formatMoneyInput(amt),
        _deleted: false,
        _isNew: false,
      };
    });
    setnarrRows_Orig(rows);
    setnarrRows_New(rows);
  }, [narrativeItems, open]);

  // set wipindexes original on open, for later comparison when reverting
useEffect(() => {
  if (!open || !draftIdx) return;

  let cancelled = false;

  (async () => {
    try {
      const raw = await getDraftFeeWIPSpecialList(draftIdx);
      const wipIndexes = (Array.isArray(raw) ? raw : [])
        .map((x) => x?.WipIndex ?? x?.WIPIndex ?? x?.wipIndex)
        .filter((v) => v != null);

      if (!cancelled) setWipIndexes_Orig(wipIndexes);
    } catch (e) {
      console.error("Failed to load special WIP list", e);
      if (!cancelled) setWipIndexes_Orig([]);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [open, draftIdx]);



// When opening the CLIENT modal
useEffect(() => {
  if (!clientModalOpen) return;

  // mimic's PE functionality - retains search results w out retaining the selected client
  setClientsError("");
  setClientsLoading(false);

  setSelectedContIndex(null);
  setSelectedClientCode(null);
  setSelectedClientName(null);

  // clear all wip population
  setWipRows([]);
  setWipError("");
  setCheckedMap({});
  setAddError("");
}, [clientModalOpen]);

// When opening the WIP modal, clear selection state
useEffect(() => {
  if (!wipModalOpen) return;

  setWipError("");
  setCheckedMap({});
  setAddError("");
}, [wipModalOpen]);



  // Debounced search -> getClients(searchText)
useEffect(() => {
  if (!clientModalOpen) return;

  const q = searchText.trim();

  // enforce minimum 3 characters
  if (q.length < 3) {
    setClients([]);
    setClientsError(q.length === 0 ? "" : "Enter at least 3 characters.");
    return;
  }

  const handle = setTimeout(async () => {
    try {
      setClientsLoading(true);
      setClientsError("");
      const res = await getClients(q);
      setClients(Array.isArray(res) ? res : []);
    } catch (e) {
      setClientsError("Failed to load clients.");
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  }, 300);

  return () => clearTimeout(handle);
}, [clientModalOpen, searchText]);


  /*  DRILLDOWN FUNCTIONALITY */
// Dummy delete for drill rows
const deleteDrillRow = (rowIndex, WIPIds) => {
  //WIPIds
  const newWIPIndexArray = WIPIds.split(',');
  draftFeeDeleteWipAllocation(draftIdx, newWIPIndexArray); 
  setDrillRows((rows) => rows.filter((_, i) => i !== rowIndex));
};

// Load drilldown rows whenever open + selection changes (and we have a parent)
useEffect(() => {
  if (!drillOpen || drillParentIndex == null) return;

  (async () => {
    try {
      const allocIndex = analysisRows_New[drillParentIndex]?.AllocIdx;

      const rows = await populateWIPAnalysisDrillDown(draftIdx, drillSelected, allocIndex);
      setDrillRows(rows ?? []);
    } catch (e) {
      console.error(e);
      setDrillRows([]);
    }
  })();
}, [drillOpen, drillParentIndex, drillSelected]);
useEffect(() => {
  if (!drillOpen || drillParentIndex == null) return;

  const sum = (drillRows || []).reduce(
    (s, r) => s + Number(r?.BillInClientCur ?? 0),
    0
  );

  setanalysisRows_New((rows) =>
    rows.map((row, idx) =>
      idx === drillParentIndex
        ? { ...row, BillInClientCur: sum, _draftAmtDisplay: formatMoneyInput(sum) }
        : row
    )
  );
}, [drillOpen, drillParentIndex, drillRows]);


const openDrillDown = (parentIndex) => {
  setDrillParentIndex(parentIndex);
  setDrillSelected("Staff");   // default
  setDrillOpen(true);
};

const closeDrillDown = () => {
  setDrillOpen(false);
  setDrillParentIndex(null);
  setDrillRows([]);
};




// stable key per narrative row for debouncing
const narrDebounceKey = (row, i) =>
  String(row?.DebtNarrIndex ?? row?.DebtNarrIdx ?? `narr-${i}`);

// Calls backend to update the narrative row
const updateNarrative = async (idx, lang, servindex, amount) => {
  const row = narrRows_New[idx];
  console.log(row);
  if (!row) return;

  // If your API cannot update "new" rows until they exist, guard here:
  if (!row.DebtNarrIndex || Number(row.DebtNarrIndex) === 0) {
    // optional: skip backend updates for brand-new unsaved rows
    return;
  }

  await updateDraftFeeNarrative({
    DebtNarrIndex: row.DebtNarrIndex,
    DraftFeeIdx: draftIdx,
    LineOrder: row.LineOrder,
    WIPType: row.WIPType ?? "TIME",
    ServIndex: servindex ?? "",
    Amount: Number(amount ?? 0) || 0,
    FeeNarrative: wrapNarrativeHtml(lang ?? ""),
    Units: row.Units ?? 0,
    VATRate: row.VATRate ?? "0",
    VATPercent: row.VATPercent ?? 0,
    VATAmount: row.VATAmount ?? 0,
  });
};

// Debounce wrapper
const scheduleNarrativeUpdate = (row, i) => {
  const key = narrDebounceKey(row, i);

  if (narrUpdateTimersRef.current[key]) {
    clearTimeout(narrUpdateTimersRef.current[key]);
  }

  narrUpdateTimersRef.current[key] = setTimeout(() => {
    const lang = row?.FeeNarrative ?? "";
    const servindex = row?.ServIndex ?? "";
    const amount = Number(row?.Amount ?? 0) || 0;

    updateNarrative(i, lang, servindex, amount).catch((e) => {
      console.error("Failed updating narrative:", e);
    });
  }, 500);
};

// Optional but recommended: clear timers on unmount/close
useEffect(() => {
  if (!open) return;
  return () => {
    Object.values(narrUpdateTimersRef.current).forEach(clearTimeout);
    narrUpdateTimersRef.current = {};
  };
}, [open]);




  const canAdd = useMemo(() => {
    return wipRows.length > 0 && Object.values(checkedMap).some(Boolean) && !addLoading;
  }, [wipRows.length, checkedMap, addLoading]);

const onSelectClient = async (contIndex, clientcode, clientname) => {
  // Step 1: lock in the selected client and move to step 2
  setSelectedContIndex(contIndex);
  setSelectedClientCode(clientcode);
  setSelectedClientName(clientname);

  // close client modal, open WIP modal
  setClientModalOpen(false);
  setWipModalOpen(true);

  // now load WIP rows for this client
  try {
    setWipLoading(true);
    setWipError("");
    setAddError("");
    setCheckedMap({});

    const payload = await draftFeeClientOrGroupWIPList(draftIdx, contIndex);
    const rows = Array.isArray(payload) ? payload : [];
    setWipRows(rows);

    const initial = {};
    rows.forEach((r, i) => {
      initial[rowKey(r, i)] = false;
    });
    setCheckedMap(initial);
  } catch (e) {
    setWipError("Failed to load WIP list for selected client.");
    setWipRows([]);
    setCheckedMap({});
  } finally {
    setWipLoading(false);
  }
};


  const toggleRow = (r, i) => {
    const key = rowKey(r, i);
    setCheckedMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const onAddWip = async () => {
    try {
      setAddLoading(true);
      setAddError("");

      const selected = wipRows.filter((r, i) => checkedMap[rowKey(r, i)]);
      console.log(selected);
      const selectedWipIndexes = selected.map(r => Number(r.WIPIds)).filter(Boolean);
      console.log(selectedWipIndexes);
      await draftFeeAddClients(draftIdx, [selectedContIndex], selectedWipIndexes);

      if (typeof onWipAdded === "function") {
          await onWipAdded();
        } else {
          console.warn("onWipAdded prop is not a function:", onWipAdded);
        }

      setWipModalOpen(false);
    } catch (e) {
      setAddError("Failed to add WIP.");
    } finally {
      setAddLoading(false);
    }
  };

  // ---------- service options from analysis table ----------
  const serviceOptions = useMemo(
    () => {
      const set = new Set();

      (analysisRows_New || []).forEach((r) => {
        if (r.WipService) {
          set.add(r.WipService);
        }
      });

      (narrRows_New || []).forEach((r) => {
        if (r.ServIndex && !set.has(r.ServIndex)) {
          set.add(r.ServIndex);
        }
      });

      return Array.from(set).sort();
    },
    [analysisRows_New, narrRows_New]
  );

  // ---------- derived totals ----------
  const analysisTotal = useMemo(
    () =>
      analysisRows_New.reduce(
        (sum, r) =>
          sum +
          Number(
            r.BillInClientCur ?? r.BalInClientCur ?? r.BillAmount ?? 0
          ),
        0
      ),
    [analysisRows_New]
  );

  const narrativeTotal = useMemo(
    () =>
      narrRows_New.reduce(
        (sum, r) => (r._deleted ? sum : sum + Number(r.Amount ?? 0)),
        0
      ),
    [narrRows_New]
  );

const toCents = (n) => Math.round((Number(n) || 0) * 100);
const totalsMatch = useMemo(
  () => toCents(analysisTotal) === toCents(narrativeTotal),
  [analysisTotal, narrativeTotal]
);


  // --- generic handlers for non-money fields ------------------------------------------------
  const updateAnalysis = (idx, value) => {
      const matchingRow = analysisRows_New[idx];
      const allocIndex = matchingRow?.['AllocIdx'];
      const OSWIP = matchingRow?.['WIPInClientCur'];
      const billAmount = value;
      const Woff = OSWIP - billAmount;

      const payload = {
          "AllocIndex": allocIndex,
          "BillAmount": billAmount,
          "WIPOS": matchingRow?.['WIPInClientCur'],
          "BillType": matchingRow?.['BillType'],
          "BillWoff": Woff,
          "DebtTranIndex": draftIdx,
          "Job_Allocation_Type": matchingRow?.['Job_Allocation_Type'],
          "Narrative": "",
          "VATCode": "0",
          "WipAnalysis": matchingRow?.['WipAnalysis'],
          "VATAmt": 0,
          "DebtTranDate": debttrandate,
          "CFwd": false
        };
        console.log(payload);
      if (matchingRow) {
         saveDraftFeeAnalysisRow(draftIdx, payload);
      }
    setanalysisRows_New((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, BillAmount: value } : r))
    );
  };



  const addNarrRow = async () => {
  const lineOrder =
    narrRows_New.reduce((max, r) => Math.max(max, Number(r.LineOrder ?? 0)), 0) + 1;

  const defaultService = serviceOptions[0] || "";

  // ✅ wait for backend to create the row and return the new index
  const res = await addDraftFeeNarrative(draftIdx);
  const items = await getDraftFeeNarratives(draftIdx);
  const lastObj = Array.isArray(items) && items.length ? items[items.length - 1] : null;


  // depending on what your service returns, pick the right property:
  const debtNarrIndex = lastObj?.DebtNarrIndex;

  setnarrRows_New((rows) => [
    ...rows,
    {
      DebtNarrIndex: debtNarrIndex,
      DraftFeeIdx: draftIdx,
      LineOrder: lineOrder,
      WIPType: "TIME",
      ServIndex: defaultService,
      Units: 0,
      Amount: 0,
      VATRate: "0",
      VATPercent: 0,
      VATAmount: 0,
      FeeNarrative: "",
      _amountDisplay: "",
      _isNew: true,
      _deleted: false,
    },
  ]);
};



const deleteNarrRow = async (i) => {
  const row = narrRows_New[i];
  if (!row) return;

  try {
    // Only call backend delete if it exists server-side
    if (row.DebtNarrIndex && Number(row.DebtNarrIndex) !== 0) {
      await deleteDraftFeeNarrative(draftIdx, row.DebtNarrIndex);
    }

    setnarrRows_New((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, _deleted: true } : r))
    );
  } catch (e) {
    console.error("Failed to delete narrative row:", e);
    setError("Failed to delete narrative row.");
  }
};
const deleteAnalysisRow = (idx) => { 
  const allocIndexes = [analysisRows_New?.[idx].AllocIdx]; 
  console.log(allocIndexes); 
  draftFeeDeleteWipAllocation(draftIdx, allocIndexes); 
  setanalysisRows_New(rows => rows.filter((_, i) => i !== idx)); 
};

  const handleSave = async () => {
    setError("");
    if (!reason) {
      setError("Please choose a reason for the change.");
      return;
    }
    if (reason === "Other" && !otherReason.trim()) {
      setError("Please describe the reason when selecting Other.");
      return;
    }

    const reasonText =
      reason === "Other" ? `Other – ${otherReason.trim()}` : reason;

    const nowIso = new Date().toISOString();

    // Wrap narratives back into standard HTML before sending up
    const narrativeRowsForSave = narrRows_New.map((r) => ({
      ...r,
      FeeNarrative: wrapNarrativeHtml(r.FeeNarrative),
    }));

    const payload = {
      draftIdx,
      clientCode,
      clientName,
      billThroughDate,
      user: currentUser,
      when: nowIso,
      reason: reasonText,
      billingNotes: billingNotes.trim() || null,
      analysisRows_New,
      narrativeRows: narrativeRowsForSave,
      _original: {
        analysisItems,
        narrativeItems,
      },
    };

    try {
      setSaving(true);
      await onSave(payload);
      resetAllState();
      onClose(true); // true = saved
    } catch (err) {
      console.error(err);
      setError("Sorry, something went wrong saving your changes.");
    } finally {
      setSaving(false);
    }
  };

  

  const handleCancel = async () => {
    

// syncronously delete all current analysis + narr rows and re-add original rows

    try { 
const processes = [];

if (analysisRows_Orig !== analysisRows_New) {
  processes.push((async () => {
  console.log('Reverting to original analysis lines...');
    const allocIndexes = analysisRows_New.map((r) => r.AllocIdx);
    await draftFeeDeleteWipAllocation(draftIdx, allocIndexes);

    // Get uniquer contindexes from original analysis rows to re-add clients
    const uniqueContIndexes = Array.from(
      new Set((analysisRows_Orig || [])
      .map(item => item?.ContIndex)
      .filter(v => v !== null && v !== undefined)
      .map(Number) // optional: force to number
      .filter(Number.isFinite)
  )
  );

    await draftFeeAddClients(draftIdx, uniqueContIndexes, wipIndexes_Orig);
    
    console.log(analysisRows_Orig);
    // add analysis row back
    await Promise.all(
/*
      const payload = {
          "AllocIndex": allocIndex,
          "BillAmount": billAmount,
          "WIPOS": matchingRow?.['WIPInClientCur'],
          "BillType": matchingRow?.['BillType'],
          "BillWoff": Woff,
          "DebtTranIndex": draftIdx,
          "Job_Allocation_Type": matchingRow?.['Job_Allocation_Type'],
          "Narrative": "",
          "VATCode": "0",
          "WipAnalysis": matchingRow?.['WipAnalysis'],
          "VATAmt": 0,
          "DebtTranDate": debttrandate,
          "CFwd": false
        };
        */
      (analysisRows_Orig || []).map((item) => {
        const payload = {
          AllocIndex: item.AllocIdx,
          BillAmount: item.BillInClientCur,
          WIPOS: item.WIPInClientCur,
          BillType: item.Job_Billing_Type,
          BillWoff: item.WoffInClientCur,
          DebtTranIndex: draftIdx,
          Job_Allocation_Type: item.Job_Allocation_Type,
          Narrative: "",
          VATCode: "0",
          WipAnalysis: item.WipAnalysis,
          VATAmt: 0,
          DebtTranDate: debttrandate,
          CFwd: false,
        };

        return saveDraftFeeAnalysisRow(draftIdx, payload);
      })
    );
    


  })());
}

if (narrRows_Orig !== narrRows_New) {
  console.log('Reverting to original narratives...');
  processes.push((async () => {
      await Promise.all(
        (narrRows_New || []).map((row) =>
          deleteDraftFeeNarrative(draftIdx, row.DebtNarrIndex)
        )
      );

      // 2) Add back blanks (one per original row) (wait for completion)
      await Promise.all(
        (narrRows_Orig || []).map(() =>
          addDraftFeeNarrative(draftIdx)
        )
      );

    const blankNarrs = await getDraftFeeNarratives(draftIdx); //needs creation
    console.log('Blank narratives after re-adding:', blankNarrs);

    
await Promise.all(
  blankNarrs.map((narr, idx) => {
    const src = narrRows_Orig[idx];
    console.log(src);
    if (!src) {
      console.warn("No source row for blank narrative idx", idx, narr);
      return Promise.resolve();
    }

    const payload = {
      Amount: Number(src.Amount ?? 0),
      DebtNarrIndex: narr.DebtNarrIndex,     // keep the NEW blank row’s index
      DraftFeeIdx: draftIdx,
      FeeNarrative: src.FeeNarrative ?? "",
      LineOrder: Number(narr.LineOrder ?? src.LineOrder ?? 0), // preserve blank’s line order
      ServIndex: src.ServIndex ?? "",
      Units: Number(src.Units ?? 0),
      VATAmount: Number(src.VATAmount ?? 0),
      VATPercent: Number(src.VATPercent ?? 0),
      VATRate: src.VATRate ?? "0",
      WIPType: src.WIPType ?? "TIME",
    };

    return updateDraftFeeNarrative(payload);
  })
);
  })());
}

await Promise.all(processes);


const sameNarr = JSON.stringify(narrRows_Orig) === JSON.stringify(narrRows_New);
const sameAnalysis = JSON.stringify(analysisRows_Orig) === JSON.stringify(analysisRows_New);

if (sameNarr && sameAnalysis) {
  setSaving(false);
  onClose(false);
  return;         //stop the save flow if no changes
}

setSaving(true);
onClose(true);
      resetAllState();
    } catch (err) {
      console.error(err);
      setError("Sorry, something went wrong reverting your changes.");
    } finally {
      setSaving(false);
    }
  };

  // NOTE: no early `if (!open) return null;`

  return (
    <PopoverPortal open={open}>
        <div className="edtray-backdrop">
        <section
            className={`edtray ${open ? "edtray--open" : ""}`}
            aria-label="Edit Draft"
        >
          <header className="edtray__head">
            <div>
              <div className="edtray__title">Edit Draft</div>
              <div className="edtray__meta">
                {billedClient} &middot; Draft #{draftIdx}
              </div>
            </div>
            <div className="edtray__totals">
              <div className="edtray__total-row">
                <span>Draft Amt (Jobs)</span>
                <strong>{currency(analysisTotal)}</strong>
              </div>
              <div className="edtray__total-row">
                <span>Narrative Total</span>
                <strong>{currency(narrativeTotal)}</strong>
              </div>
              <div
                className={`edtray__total-pill ${
                  totalsMatch ? "ok" : "warn"
                }`}
              >
                {totalsMatch
                  ? "Totals match invoice"
                  : "Totals do not match"}
              </div>
            </div>
          </header>
<div className="edtray__body">
  {loading ? (
    <div className="ed-tray__loading ed-tray__loading--kb">
      <LoaderMini primary="#4F46E5" />
    </div>
  ) : (
    <>
      {/* -------- left: analysis table -------- */}
<div className="edtray__col edtray__col--analysis">
  <div className="edtray__subhead-row">
    <div className="edtray__subhead">Draft WIP Analysis</div>
    <button
      type="button"
      className="edtray__add-btn"
      onClick={() => setClientModalOpen(true)}
    >
      + Add WIP
    </button>
  </div>

  <div className="edtray__table-wrap">
    <table className="mini-table mini-table--tight">
      <thead>
        <tr>
          <th></th>
          <th>Client</th>
          <th>Service</th>
          <th>Job</th>
          <th>Type</th>
          <th className="num">WIP</th>
          <th className="num">OOS</th>
          <th className="num">Draft Amt</th>
          <th></th>
        </tr>
      </thead>

      <tbody>
        {analysisRows_New.map((r, i) => {
          const isExpanded = drillOpen && drillParentIndex === i;

          // (1) compute parent draft amt from drill rows when expanded
          const drillBillSum = isExpanded
            ? (drillRows || []).reduce(
                (sum, row) => sum + Number(row?.BillInClientCur ?? 0),
                0
              )
            : null;

          const parentDisplay = isExpanded
            ? formatMoneyInput(drillBillSum)
            : (r._draftAmtDisplay ?? "");

          return (
            <React.Fragment key={i}>
              {/* parent row */}
              <tr>
                <td className="edtray__delete-center">
                  <button
                    type="button"
                    className="edtray__drill-btn"
                    title={isExpanded ? "Collapse" : "Drill down"}
                    aria-expanded={isExpanded}
                    onClick={async () => {
                      // toggle if clicking the same row, otherwise open the new row
                      if (isExpanded) {
                        // (3) close drilldown + refresh analysis rows from server
                        closeDrillDown();
                        try {
                          const fresh = await getDraftFeeAnalysis(draftIdx);
                          const rows = (fresh ?? []).map((rr) => {
                            const base =
                              rr.BillInClientCur ?? rr.BillAmount ?? rr.BalInClientCur ?? 0;
                            return {
                              ...rr,
                              BillInClientCur: Number(base) || 0,
                              _draftAmtDisplay: formatMoneyInput(base),
                            };
                          });
                          setanalysisRows_New(rows);
                        } catch (e) {
                          console.error("Failed to refresh analysis after closing drilldown", e);
                        }
                      } else {
                        openDrillDown(i);
                      }
                    }}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </button>
                </td>

                <td>{r.ClientName ?? ""}</td>
                <td>{r.WipService ?? ""}</td>
                <td>{r.JobTitle ?? ""}</td>
                <td>{r.WipType ?? ""}</td>
                <td className="num">{currency(Number(r.WIPInClientCur ?? 0))}</td>
                <td className="num">{currency(Number(r.OOSAmount ?? 0))}</td>

                <td className="num">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="ed-input ed-input--num"
                    disabled={isExpanded} // (1) disable when expanded
                    value={parentDisplay}
                    onChange={(e) => {
                      if (isExpanded) return; // safety

                      const val = e.target.value;
                      const num = parseMoneyInput(val);

                      // 1) Immediate UI update
                      setanalysisRows_New((rows) =>
                        rows.map((row, idx) =>
                          idx === i
                            ? { ...row, _draftAmtDisplay: val, BillInClientCur: num }
                            : row
                        )
                      );

                      // 2) Debounced backend update
                      const key = String(i);
                      if (updateTimersRef.current[key]) clearTimeout(updateTimersRef.current[key]);
                      updateTimersRef.current[key] = setTimeout(() => {
                        updateAnalysis(i, num);
                      }, 1000);
                    }}
                    onBlur={() => {
                      if (isExpanded) return; // safety

                      setanalysisRows_New((rows) =>
                        rows.map((row, idx) => {
                          if (idx !== i) return row;
                          const num = parseMoneyInput(row._draftAmtDisplay);
                          return {
                            ...row,
                            BillInClientCur: num,
                            _draftAmtDisplay: formatMoneyInput(num),
                          };
                        })
                      );
                    }}
                    onFocus={(e) => {
                      if (!isExpanded) e.target.select();
                    }}
                  />
                </td>

                <td className="edtray__delete-center">
                  <button
                    type="button"
                    className="edtray__delete-btn"
                    onClick={() => deleteAnalysisRow(i)}
                    title="Delete line"
                  >
                    ×
                  </button>
                </td>
              </tr>

              {/* drill row directly under parent row */}
              {isExpanded && (
                <tr className="edtray__drill-row">
                  <td colSpan={9}>
                    <div className="edtray__drill-wrap">
                      <div className="edtray__drill-head">
                        <div className="edtray__drill-title">
                          WIP Detail — {r.JobTitle ?? ""}
                        </div>
                      </div>

                      <div className="edtray__drill-body">
                        {/* left selector */}
                        <div className="edtray__drill-left">
                          {DRILL_OPTIONS.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              className={
                                "edtray__drill-tab " + (drillSelected === opt ? "is-active" : "")
                              }
                              onClick={() => setDrillSelected(opt)}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>

                        {/* right table */}
                        <div className="edtray__drill-right">
                          <div className="edtray__table-wrap">
                            <table className="mini-table2">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th className="num">Hours</th>
                                  <th className="num">WIP</th>
                                  <th className="num">OOS</th>
                                  <th className="num">Bill</th>
                                  <th className="num">W/Off</th>
                                  <th className="num">C/F</th>
                                  <th></th>
                                </tr>
                              </thead>

                              <tbody>
                                {drillRows.map((d, idx) => (
                                  <tr key={idx}>
                                    <td>
                                      {d.StaffName ??
                                        d.ChargeName ??
                                        d.Task_Subject ??
                                        d.RoleName ??
                                        ""}
                                    </td>
                                    <td className="num">{d.WIPHours ?? ""}</td>
                                    <td className="num">
                                      {currency(Number(d.WIPInClientCur ?? 0))}
                                    </td>
                                    <td className="num">
                                      {currency(Number(d.OOSAmount ?? 0))}
                                    </td>

                                    {/* editable Bill */}
                                    <td className="num">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        className="ed-input ed-input--num"
                                        value={d._billDisplay ?? formatMoneyInput(Number(d.BillInClientCur ?? 0))}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const num = parseMoneyInput(val);

                                          setDrillRows((rows) =>
                                            rows.map((row, rIdx) =>
                                              rIdx === idx
                                                ? { ...row, _billDisplay: val, BillInClientCur: num }
                                                : row
                                            )
                                          );
                                        }}
                                        onBlur={() => {
                                          setDrillRows((rows) => {
                                            // finalize the edited row first
                                            const next = rows.map((row, rIdx) => {
                                              if (rIdx !== idx) return row;
                                              const billNum = parseMoneyInput(row._billDisplay ?? "");
                                              return {
                                                ...row,
                                                BillInClientCur: billNum,
                                                _billDisplay: formatMoneyInput(billNum),
                                              };
                                            });

                                            // build payload from UPDATED row values
                                            const updated = next[idx];

                                            const parentAllocIdx =
                                              analysisRows_New?.[drillParentIndex]?.AllocIdx ??
                                              analysisRows_New?.[drillParentIndex]?.AllocIndex ??
                                              null;

                                            const wipos = Number(updated?.WIPInClientCur ?? 0); // <-- "WIPOS" source
                                            const billAmount = Number(updated?.BillInClientCur ?? 0);
                                            const woffAmount = wipos - billAmount;

                                            const payload = {
                                              DebtTranIndex: draftIdx,
                                              AllocIdx: parentAllocIdx,
                                              WIPOS: wipos,
                                              BillAmount: billAmount,
                                              WoffAmount: woffAmount,
                                              StaffIndex: updated?.StaffIndex ?? updated?.StaffIdx ?? updated?.StaffId ?? null,
                                            };

                                            try {
                                              recalculateWIPAllocFromSummary(payload);
                                            } catch (e) {
                                              console.error("recalculateWIPAllocFromSummary failed", e, payload);
                                            }

                                            return next;
                                          });
                                        }}
                                        onFocus={(e) => e.target.select()}
                                      />

                                    </td>

                                    <td className="num">
                                      {currency(Number(d.WoffInClientCur ?? 0))}
                                    </td>
                                    <td className="num">
                                      {currency(Number(d.BalInClientCur ?? 0))}
                                    </td>

                                    <td className="edtray__delete-center">
                                      <button
                                        type="button"
                                        className="edtray__delete-btn"
                                        onClick={() => deleteDrillRow(idx, d.WIPIds)}
                                        title="Delete line"
                                      >
                                        ×
                                      </button>
                                    </td>
                                  </tr>
                                ))}

                                {drillRows.length === 0 && (
                                  <tr>
                                    <td colSpan={8} className="muted">
                                      No drill-down rows.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}

        {analysisRows_New.length === 0 && (
          <tr>
            <td colSpan={9} className="muted">
              No analysis rows returned from Practice Engine.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</div>


      {/* -------- right: narrative table -------- */}
      <div className="edtray__col edtray__col--narr">
        <div className="edtray__subhead-row">
          <div className="edtray__subhead">Narrative Lines</div>
          <button
            type="button"
            className="edtray__add-btn"
            onClick={addNarrRow}
          >
            + Add Line
          </button>
        </div>

        <div className="edtray__table-wrap">
          <table className="mini-table mini-table--tight">
            <thead>
              <tr>
                <th>Narrative Text</th>
                <th>Service</th>
                <th className="num">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {narrRows_New.map((r, i) =>
                r._deleted ? null : (
                  <tr key={r.DebtNarrIndex ?? `narr-${i}`}>
                    <td>
                      <textarea
                        className="ed-input ed-input--textarea"
                        value={r.FeeNarrative || ""}
                        onChange={(e) => {
                          const val = e.target.value;

                          setnarrRows_New((rows) => {
                            const next = rows.map((row, idx) =>
                              idx === i ? { ...row, FeeNarrative: val } : row
                            );
                            scheduleNarrativeUpdate(next[i], i);
                            return next;
                          });
                        }}
                        rows={2}
                      />
                    </td>

                    <td>
                      <select
                        className="ed-input ed-input--svc"
                        value={r.ServIndex || ""}
                        onChange={(e) => {
                          const val = e.target.value;

                          setnarrRows_New((rows) => {
                            const next = rows.map((row, idx) =>
                              idx === i ? { ...row, ServIndex: val } : row
                            );
                            scheduleNarrativeUpdate(next[i], i);
                            return next;
                          });
                        }}
                      >
                        <option value="">Select service...</option>
                        {serviceOptions.map((svc) => (
                          <option key={svc} value={svc}>
                            {svc}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="num">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="ed-input ed-input--num"
                        value={r._amountDisplay ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const num = parseMoneyInput(val);

                          setnarrRows_New((rows) => {
                            const next = rows.map((row, idx) =>
                              idx === i
                                ? { ...row, _amountDisplay: val, Amount: num }
                                : row
                            );
                            scheduleNarrativeUpdate(next[i], i);
                            return next;
                          });
                        }}
                        onBlur={() => {
                          setnarrRows_New((rows) =>
                            rows.map((row, idx) => {
                              if (idx !== i) return row;
                              const num = parseMoneyInput(row._amountDisplay);
                              return {
                                ...row,
                                Amount: num,
                                _amountDisplay: formatMoneyInput(num),
                              };
                            })
                          );
                        }}
                        onFocus={(e) => e.target.select()}
                      />
                    </td>

                    <td className="edtray__delete-center">
                      <button
                        type="button"
                        className="edtray__delete-btn"
                        onClick={() => deleteNarrRow(i)}
                        title="Delete line"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              )}

              {narrRows_New.filter((x) => !x._deleted).length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No narrative lines. Use “Add Line” to start a new invoice body.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )}
</div>


        <footer className="edtray__foot">
            <div className="edtray__reason-block">
              <label className="ed-label">
                Reason for change<span className="req">*</span>
              </label>
              <select
                className="ed-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Select reason…</option>
                <option value="Client preferences">
                  Client preferences
                </option>
                <option value="Incorrect Calculation">
                  Incorrect Calculation
                </option>
                <option value="Partner/Manager Preference">
                  Partner/Manager Preference
                </option>
                <option value="Other">Other</option>
              </select>

              {reason === "Other" && (
                <input
                  type="text"
                  className="ed-input ed-input--other"
                  placeholder="Describe the reason…"
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                />
              )}
            </div>

            <div className="edtray__notes-block">
              <label className="ed-label">
                Billing Notes (optional)
              </label>
              <textarea
                className="ed-input ed-input--textarea edtray__notes-textarea"
                rows={2}
                placeholder="Context for partner / reviewer…"
                value={billingNotes}
                onChange={(e) => setBillingNotes(e.target.value)}
              />
            </div>

            <div className="edtray__actions">
              {error && (
                <div className="edtray__error" role="alert">
                  {error}
                </div>
              )}

              <div className="edtray__btn-row">
                <button
                  type="button"
                  className="ed-btn ed-btn--ghost"
                  disabled={saving}
                  onClick={() => handleCancel(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ed-btn ed-btn--primary"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? "Saving…" : "Save & Close"}
                </button>
              </div>
            </div>
          </footer>
                      
                      {clientModalOpen && (
  <div style={styles.backdrop} onMouseDown={() => setClientModalOpen(false)}>
    <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
      <div style={styles.header}>
        <div style={{ fontWeight: 700 }}>Search Clients</div>
        <button onClick={() => setClientModalOpen(false)} style={styles.closeBtn}>✕</button>
      </div>

      <div style={styles.section}>
        <div style={styles.row}>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search clients (min 3 chars)..."
            style={styles.input}
          />
          {clientsLoading && <span style={styles.muted}>Loading…</span>}
        </div>

        {clientsError && <div style={styles.error}>{clientsError}</div>}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>ClientCode</th>
                <th>ClientName</th>
                <th>ClientPartner</th>
                <th>ClientManager</th>
                <th>ClientOffice</th>
                <th style={{ width: 90 }}>Select</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.ClientCode ?? `${c.ContIndex}-${c.ClientName}`}>
                  <td>{c.ClientCode}</td>
                  <td>{c.ClientName}</td>
                  <td>{c.ClientPartner}</td>
                  <td>{c.ClientManager}</td>
                  <td>{c.ClientOffice}</td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      onClick={() => onSelectClient(Number(c.ContIndex), c.ClientCode, c.ClientName)}
                      style={styles.primaryBtn}
                    >
                      Select
                    </button>
                  </td>
                </tr>
              ))}

              {!clientsLoading && searchText.trim().length >= 3 && clients.length === 0 && (
                <tr>
                  <td colSpan={6} style={styles.empty}>No results</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={styles.footer}>
        <button onClick={() => setClientModalOpen(false)} style={styles.secondaryBtn}>
          Close
        </button>
      </div>
    </div>
  </div>
)}

{wipModalOpen && (
  <div style={styles.backdrop} onMouseDown={() => setWipModalOpen(false)}>
    <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
      <div style={styles.header}>
        <div style={{ fontWeight: 700 }}>
          Select WIP - ({selectedClientCode}) {selectedClientName}
        </div>
        <button onClick={() => setWipModalOpen(false)} style={styles.closeBtn}>✕</button>
      </div>

      <div style={styles.section}>
        <div style={styles.rowBetween}>
          <div style={{ fontWeight: 700 }}>WIP Results</div>

          <button
            onClick={onAddWip}
            disabled={!canAdd}
            style={{
              ...styles.primaryBtn,
              opacity: canAdd ? 1 : 0.5,
              cursor: canAdd ? "pointer" : "not-allowed",
            }}
          >
            {addLoading ? "Adding…" : "Add WIP"}
          </button>
        </div>

        {wipLoading && <div style={styles.muted}>Loading WIP…</div>}
        {wipError && <div style={styles.error}>{wipError}</div>}
        {addError && <div style={styles.error}>{addError}</div>}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 42 }}></th>
                <th>Service</th>
                <th>Job Name</th>
                <th>Type</th>
                <th>Hours</th>
                <th style={{ width: 120, textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {wipRows.map((r, i) => (
                <tr key={rowKey(r, i)}>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!checkedMap[rowKey(r, i)]}
                      onChange={() => toggleRow(r, i)}
                    />
                  </td>
                  <td>{r.ServiceTitle}</td>
                  <td>{r.JobName}</td>
                  <td>{r.WIPType}</td>
                  <td style={{ textAlign: "right" }}>
                    {typeof r.WIPHours === "number" ? r.WIPHours.toFixed(2) : (r.WIPHours ?? "-")}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {typeof r.WIPValue === "number" ? r.WIPValue.toFixed(2) : (r.WIPValue ?? "-")}
                  </td>
                </tr>
              ))}

              {!wipLoading && wipRows.length === 0 && (
                <tr>
                  <td colSpan={4} style={styles.empty}>
                    No WIP rows returned for this client
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={styles.footer}>
        <button onClick={() => setWipModalOpen(false)} style={styles.secondaryBtn}>
          Close
        </button>
      </div>
    </div>
  </div>
)}

        </section>
      </div>
    </PopoverPortal>
  );
}