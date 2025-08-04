// existingDraftsHelper.js – heavy-logging debug build
// -----------------------------------------------------------------------------
// Targets React-Data-Table rows with id="row-<DRAFTFEEIDX>" and opens a bottom
// drawer showing time-entry detail (sampleTimeEntry.json).
// -----------------------------------------------------------------------------
// Dependencies: jquery, datatables.net, datatables.net-dt
// Install:  npm i -D jquery datatables.net datatables.net-dt
// -----------------------------------------------------------------------------

import $ from 'jquery';
import 'datatables.net';
import 'datatables.net-dt';
import 'datatables.net-dt/css/dataTables.dataTables.css';

import sampleTimeEntry from '../devSampleData/sampleTimeEntry.json';

/*──────────────────────  tiny logger ──────────────────────*/
const log = (title, ...args) =>
  console.log(`%c[Helper] ${title}`, 'color:#0b7;font-weight:600', ...args);

log('Loaded – sample rows:', sampleTimeEntry.length);

(() => {
  /*──────────────────────  State  ──────────────────────*/
  const timeCache      = sampleTimeEntry;
  let   activeFeeIdx   = null;
  let   tableInstance  = null;

  /*──────────────────────  Formatters  ──────────────────────*/
  const money  = v => '$' + Number(v || 0).toLocaleString();
  const fmtMDY = iso => {
    const d = new Date(iso);
    return isNaN(d)
      ? ''
      : `${String(d.getMonth() + 1).padStart(2, '0')}/` +
        `${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  };

    // ──── ▼ AUTO-DETECT bad ancestor ▼ ────
    function findTransformAncestor(el) {
    let n = el.parentElement;
    while (n && n !== document) {
        const cs = getComputedStyle(n);
        if (cs.transform !== 'none' ||
            cs.perspective !== 'none' ||
            cs.filter !== 'none' ||
            cs.contain.startsWith('paint')) return n;
        n = n.parentElement;
    }
    return null;
    }
    // ──── ▲ AUTO-DETECT bad ancestor ▲ ────
  /*──────────────────────  Drawer helpers  ──────────────────────*/
  function getDrawer() {
  let d = document.getElementById('helperDrawer');
  if (d) return d;

  d = document.createElement('div');
  d.id = 'helperDrawer';
  d.className = `fixed bottom-0 left-0 right-0 translate-y-full transition-transform
                 duration-300 ease-in-out bg-white shadow-2xl border-t z-50 text-sm`;
  d.innerHTML = `
    <div class="flex items-center justify-between px-4 py-2 bg-gray-100 border-b">
      <h3 class="font-semibold text-gray-700 text-xs sm:text-sm">Time-Entry Detail</h3>
      <button id="helperClose" class="text-gray-500 hover:text-gray-700" title="Hide">✕</button>
    </div>
    <div class="p-4 overflow-y-auto max-h-[60vh]">
      <table id="helperTable" class="display nowrap w-full"></table>
    </div>`;

  document.body.appendChild(d);
  d.querySelector('#helperClose').addEventListener('click', hideDrawer);
  return d;
}

    // helper: is element inside the current viewport?
    const inViewport = r =>
        r.top    >= 0 &&
        r.left   >= 0 &&
        r.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        r.right  <= (window.innerWidth  || document.documentElement.clientWidth);

    const dumpRect = () => {
        const rect = getDrawer().getBoundingClientRect();
        log('Drawer rect', JSON.stringify(rect));
        log('→ inViewport?', inViewport(rect));
    };


  
  function showDrawer() {
  const d = getDrawer();
  log('showDrawer() – before', d.className);
  d.classList.remove('translate-y-full');
  d.classList.add('translate-y-0');
  log('showDrawer() –  after', d.className);

  /* ------------------------------------------------------------------
     Scroll the *nearest* scroll-container so the drawer is visible.
     If nothing scrollable is found, fall back to window.scrollTo().
  ------------------------------------------------------------------ */
  requestAnimationFrame(() => {
    let scroller = d.parentElement;
    while (scroller && scroller !== document && scroller !== document.body) {
      const  style = getComputedStyle(scroller);
      const canScroll = /(auto|scroll)/.test(style.overflowY + style.overflow);
      if (canScroll && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    if (!scroller || scroller === document || scroller === document.body) {
      /* default: scroll the window */
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      log('Scrolled window to bottom');
    } else {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
      log('Scrolled container', scroller, 'to bottom');
    }
  });
}

  function hideDrawer() {
  const d = getDrawer();
  d.classList.remove('translate-y-0');
  d.classList.add('translate-y-full');
  activeFeeIdx = null;
}

  /*──────────────────────  DataTable renderer  ──────────────────────*/
  function renderTable(rows) {
    log('renderTable() rows:', rows.length);

    if (tableInstance) {
      log('Destroying previous DataTable');
      tableInstance.destroy(true);  // true → remove() the <table> children
      $('#helperTable').empty();
      tableInstance = null;
    }

    tableInstance = $('#helperTable').DataTable({
      data: rows,
      columns: [
        { title: 'Job',        data: 'JOBTITLE'      },
        { title: 'Individual', data: 'STAFFNAME'     },
        { title: 'Task',       data: 'TASK_SUBJECT'  },
        { title: 'WIP Date',   data: 'WIPDATE',   render: fmtMDY },
        { title: 'Hours',      data: 'WIPHOURS'      },
        { title: 'WIP $',      data: 'WIPAMOUNT', render: money },
        { title: 'Bill $',     data: 'BILLAMOUNT', render: money }
      ],
      paging:    false,
      searching: false,
      info:      false,
      order:     [[0, 'asc'], [1, 'asc'], [3, 'asc']],
      autoWidth: false,
      initComplete: () => log('DataTable initComplete – rows rendered:', rows.length)
    });
  }

  /*──────────────────────  Row click handler  ──────────────────────*/
    function handleRow(rowEl) {
  if (!rowEl) return;

  const feeIdx = rowEl.id?.replace('row-', '');
  if (!feeIdx) {
    log('Row id missing or malformed', rowEl.id);
    return;
  }

  log('handleRow() – feeIdx:', feeIdx, 'activeFeeIdx:', activeFeeIdx);

  // toggle off if the same row is clicked again
  if (activeFeeIdx === feeIdx) {
    log('Row was already active → toggling off');
    hideDrawer();
    return;
  }

  activeFeeIdx = feeIdx;

  const rows = timeCache.filter(r => String(r.DRAFTFEEIDX) === feeIdx);
  log('Matched rows for feeIdx', feeIdx, ':', rows.length);

  if (!rows.length) {
    log('⚠️  No time-entry rows for feeIdx', feeIdx);
    hideDrawer();
    return;
  }

  /* deterministic sort for nicer grouping */
  rows.sort((a, b) => {
    if (a.JOBTITLE  !== b.JOBTITLE)  return a.JOBTITLE.localeCompare(b.JOBTITLE);
    if (a.STAFFNAME !== b.STAFFNAME) return a.STAFFNAME.localeCompare(b.STAFFNAME);
    return new Date(a.WIPDATE) - new Date(b.WIPDATE);
  });

  /* ─── Drawer & table sequencing ─── */
  showDrawer();          // ① slide in + autoscroll
  renderTable(rows);     // ② build DataTable
  setTimeout(() => {     // ③ adjust widths after CSS transition
    const api = $('#helperTable').DataTable();
    if (api) {
      api.columns.adjust().draw(false);
      log('DataTable columns adjusted after transition');
    }
  }, 310);               // a hair longer than the 300 ms transition
}


  /*──────────────────────  Delegated listener  ──────────────────────*/
  document.addEventListener('DOMContentLoaded', () => {
    log('DOMContentLoaded – listener attached (capture)');

    document.body.addEventListener(
      'click',
      e => {
        log('body click', e.target);
        const rowEl = e.target.closest('.rdt_TableRow[id^="row-"]');
        if (rowEl) {
          log('Matched row element:', rowEl.id);
          handleRow(rowEl);
        }
      },
      true // capture!
    );
  });
// ──── ▼ NEW GLOBAL LISTENERS ▼ ────
  // in case scroll/resize is the culprit
  ['scroll', 'resize'].forEach(evt =>
    window.addEventListener(evt, () => {
      const r = getDrawer().getBoundingClientRect();
      log(`on${evt} → rect`, JSON.stringify(r), 'inViewport?', inViewport(r));
    })
  );
// ──── ▲ NEW GLOBAL LISTENERS ▲ ────  
})();
