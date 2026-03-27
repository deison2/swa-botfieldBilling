/*************************************************************************
 * GlobalReviewalTracker.js
 * Modal showing a user's full reviewal workflow dashboard:
 * donut chart, progress bars by partner/manager, and a filterable draft list.
 *************************************************************************/
import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import './GlobalReviewalTracker.css';

const BILLING_TEAM_VISIBLE = ['chenriksen@bmss.com', 'lambrose@bmss.com'];

/* ── ReviewerAvatar — profile photo with email tooltip ─────── */
const photoCache = new Map();

function ReviewerAvatar({ email, size = 26 }) {
  const [state, setState] = React.useState(() => {
    const cached = photoCache.get(email);
    if (cached) return cached;
    return { url: null, checked: false };
  });

  React.useEffect(() => {
    if (state.checked) return;
    let cancelled = false;
    const img = new Image();
    const src = `/api/userPhoto?email=${encodeURIComponent(email)}&size=64x64`;
    img.onload = () => {
      if (cancelled) return;
      const entry = { url: src, checked: true };
      photoCache.set(email, entry);
      setState(entry);
    };
    img.onerror = () => {
      if (cancelled) return;
      const entry = { url: null, checked: true };
      photoCache.set(email, entry);
      setState(entry);
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [email, state.checked]);

  const initial = (email || '?').split('@')[0].charAt(0).toUpperCase();

  return (
    <span className="grt-avatar" title={email} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {state.url
        ? <img src={state.url} alt="" className="grt-avatar__img" />
        : <span className="grt-avatar__init">{initial}</span>
      }
    </span>
  );
}

/* ── Resolve reviewer emails for a given instance ──────────── */
function getReviewerEmails(inst) {
  const stage = inst.stage_code;
  if (stage === 'BR' || stage === 'POST') return BILLING_TEAM_VISIBLE;
  const map = { MR: 'manager_reviewer', PR: 'partner_reviewer', OR: 'originator_reviewer' };
  const col = map[stage];
  const val = col ? (inst[col] || '').toLowerCase().trim() : '';
  return val ? [val] : [];
}

const TABS = [
  { key: 'my-reviews',    label: 'My Reviews' },
  { key: 'as-originator', label: 'As Originator' },
  { key: 'as-partner',    label: 'As Partner' },
  { key: 'as-manager',    label: 'As Manager' },
  { key: 'all',           label: 'All' },
];

/* ── Donut Chart (SVG ring) ──────────────────────────────────── */
function DonutChart({ actionable, waiting, completed }) {
  const total = actionable + waiting + completed;
  if (!total) return null;

  const r = 54;
  const circ = 2 * Math.PI * r;
  // Draw order: completed (back), waiting, actionable (front) so actionable is never hidden
  const segments = [
    { value: completed,  color: '#22c55e' },  // green — completed
    { value: waiting,    color: '#ef4444' },  // red — waiting/blocked
    { value: actionable, color: '#f59e0b' },  // amber/yellow — actionable
  ];

  // Compute offsets based on the visual order: actionable, waiting, completed (clockwise)
  // But draw order is reversed for z-index. Calculate positions in visual order first.
  const visualOrder = [
    { value: actionable, color: '#f59e0b' },
    { value: waiting,    color: '#ef4444' },
    { value: completed,  color: '#22c55e' },
  ];
  const positions = [];
  let off = 0;
  for (const seg of visualOrder) {
    const dash = (seg.value / total) * circ;
    positions.push({ ...seg, dash, offset: off });
    off += dash;
  }

  // Render in back-to-front order: completed, waiting, actionable
  const drawOrder = [positions[2], positions[1], positions[0]];

  return (
    <div className="grt-donut">
      <svg viewBox="0 0 140 140" width="140" height="140">
        {drawOrder.map((seg, i) => (
          <circle
            key={i}
            cx="70" cy="70" r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="12"
            strokeDasharray={`${seg.dash} ${circ - seg.dash}`}
            strokeDashoffset={-seg.offset}
          />
        ))}
      </svg>
      <div className="grt-donut__center">
        {total}
        <small>Total</small>
      </div>
    </div>
  );
}

/* ── Progress Bar Row ────────────────────────────────────────── */
function ProgressRow({ label, completed, total, variant }) {
  const pct = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="grt-progress-row">
      <span className="grt-progress-label" title={label}>{label}</span>
      <div className="grt-progress-bar">
        <div
          className={`grt-progress-fill grt-progress-fill--${variant}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="grt-progress-pct">{pct}%</span>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
export default function GlobalReviewalTracker({
  open,
  onClose,
  data,        // { summary, progressByPartner, progressByManager, instances }
  loading,
  onReviewDraft, // callback(draftFeeIdx, instance) — opens ReviewalWorkflowModal
  onOpenSettings, // callback — opens AutoApproveSettings modal
  behind,      // true when review modal is open on top — lowers z-index
}) {
  const { email: currentUserEmail } = useAuth();
  const [activeTab, setActiveTab] = useState('my-reviews');
  const [search, setSearch] = useState('');
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('my-reviews');
      setSearch('');
      setPage(1);
    }
  }, [open]);

  // Filter instances by tab
  const filteredInstances = useMemo(() => {
    if (!data?.instances) return [];
    let list = data.instances;

    // Tab filter
    switch (activeTab) {
      case 'my-reviews':
        list = list.filter(i => i.isCurrentReviewer && i.actionability !== 'completed');
        break;
      case 'as-originator':
        list = list.filter(i => i.roles.includes('originator'));
        break;
      case 'as-partner':
        list = list.filter(i => i.roles.includes('partner'));
        break;
      case 'as-manager':
        list = list.filter(i => i.roles.includes('manager'));
        break;
      default: // 'all'
        break;
    }

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        (i.client_code || '').toLowerCase().includes(q) ||
        (i.client_name || '').toLowerCase().includes(q) ||
        (i.partner_name || '').toLowerCase().includes(q) ||
        (i.manager_name || '').toLowerCase().includes(q) ||
        (i.stage_name || '').toLowerCase().includes(q) ||
        (i.current_reviewer || '').toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => (a.client_code || '').localeCompare(b.client_code || ''));
  }, [data, activeTab, search]);

  // Tab counts
  const tabCounts = useMemo(() => {
    if (!data?.instances) return {};
    const inst = data.instances;
    return {
      'my-reviews': inst.filter(i => i.isCurrentReviewer && i.actionability !== 'completed').length,
      'as-originator': inst.filter(i => i.roles.includes('originator')).length,
      'as-partner': inst.filter(i => i.roles.includes('partner')).length,
      'as-manager': inst.filter(i => i.roles.includes('manager')).length,
      'all': inst.length,
    };
  }, [data]);

  // Compute upstream-only progress sections from instances.
  // Partner progress: only for drafts where the user is originator or partner (upstream view)
  // Manager progress: only for drafts where the user is originator, partner, or manager (upstream view)
  // If the user is ONLY a manager on a draft, partner progress for that draft is downstream → excluded.
  const { upstreamPartner, upstreamManager } = useMemo(() => {
    if (!data?.instances) return { upstreamPartner: [], upstreamManager: [] };

    const me = (currentUserEmail || '').toLowerCase();
    const partnerMap = {};
    const managerMap = {};

    for (const inst of data.instances) {
      const isOriginator = inst.roles.includes('originator');
      const isPartner = inst.roles.includes('partner');
      const isManager = inst.roles.includes('manager');

      // Manager progress is upstream for originators, partners, and managers themselves
      if (isOriginator || isPartner || isManager) {
        const key = inst.manager_reviewer || inst.manager_name;
        // Exclude self from progress bars
        if (key && key.toLowerCase() !== me) {
          if (!managerMap[key]) managerMap[key] = { total: 0, completed: 0, displayName: inst.manager_name || '' };
          managerMap[key].total++;
          if (inst.mr_completed_at || inst.current_stage_id > 2) managerMap[key].completed++;
        }
      }

      // Partner progress is upstream for originators and partners, but NOT for manager-only
      if (isOriginator || isPartner) {
        const key = inst.partner_reviewer || inst.partner_name;
        // Exclude self from progress bars
        if (key && key.toLowerCase() !== me) {
          if (!partnerMap[key]) partnerMap[key] = { total: 0, completed: 0, displayName: inst.partner_name || '' };
          partnerMap[key].total++;
          if (inst.pr_completed_at || inst.current_stage_id > 3) partnerMap[key].completed++;
        }
      }
    }

    const toArr = (map) => Object.entries(map)
      .map(([key, d]) => ({ email: key, displayName: d.displayName, total: d.total, completed: d.completed, pct: d.total ? Math.round((d.completed / d.total) * 100) : 0 }))
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));

    return { upstreamPartner: toArr(partnerMap), upstreamManager: toArr(managerMap) };
  }, [data, currentUserEmail]);

  if (!open) return null;

  const summary = data?.summary || { actionable: 0, waiting: 0, completed: 0 };

  // Extract email name for display (before @)
  const emailName = (e) => {
    if (!e) return '—';
    const at = e.indexOf('@');
    return at > 0 ? e.substring(0, at) : e;
  };

  return (
    <div className={`grt-backdrop${behind ? ' grt-backdrop--behind' : ''}`} onClick={onClose}>
      <div className="grt-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="grt-header">
          <span className="grt-title">Reviewal Tracker</span>
          <div className="grt-header__actions">
            {onOpenSettings && (
              <button className="grt-settings-btn" onClick={onOpenSettings} title="Auto-Approve Settings">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Update Auto-Approve Settings
              </button>
            )}
            <button className="grt-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="grt-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`grt-tab ${activeTab === t.key ? 'grt-tab--active' : ''}`}
              onClick={() => { setActiveTab(t.key); setPage(1); }}
            >
              {t.label}
              {tabCounts[t.key] > 0 && (
                <span className="grt-tab__badge">{tabCounts[t.key]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="grt-body">
          {loading ? (
            <div className="grt-loading">Loading tracker data...</div>
          ) : (
            <>
              {/* Summary: donut + progress bars */}
              <div className="grt-summary">
                <div className="grt-donut-wrap">
                  <DonutChart
                    actionable={summary.actionable}
                    waiting={summary.waiting}
                    completed={summary.completed}
                  />
                  <div className="grt-legend">
                    <div className="grt-legend-item">
                      <span className="grt-legend-dot" style={{ background: '#f59e0b' }} />
                      Actionable ({summary.actionable})
                    </div>
                    <div className="grt-legend-item">
                      <span className="grt-legend-dot" style={{ background: '#ef4444' }} />
                      Waiting / Blocked ({summary.waiting})
                    </div>
                    <div className="grt-legend-item">
                      <span className="grt-legend-dot" style={{ background: '#22c55e' }} />
                      Completed ({summary.completed})
                    </div>
                  </div>
                </div>

                <div className="grt-progress-section">
                  {upstreamPartner.length > 0 && (
                    <div className="grt-progress-group">
                      <button
                        type="button"
                        className="grt-progress-group__toggle"
                        onClick={() => setPartnerOpen(v => !v)}
                      >
                        <span className={`grt-toggle-arrow ${partnerOpen ? 'grt-toggle-arrow--open' : ''}`}>&#9654;</span>
                        Progress by Partner
                        <span className="grt-progress-group__count">({upstreamPartner.length})</span>
                      </button>
                      {partnerOpen && upstreamPartner.map(p => (
                        <ProgressRow
                          key={p.email}
                          label={p.displayName || emailName(p.email)}
                          completed={p.completed}
                          total={p.total}
                          variant="partner"
                        />
                      ))}
                    </div>
                  )}

                  {upstreamManager.length > 0 && (
                    <div className="grt-progress-group">
                      <button
                        type="button"
                        className="grt-progress-group__toggle"
                        onClick={() => setManagerOpen(v => !v)}
                      >
                        <span className={`grt-toggle-arrow ${managerOpen ? 'grt-toggle-arrow--open' : ''}`}>&#9654;</span>
                        Progress by Manager
                        <span className="grt-progress-group__count">({upstreamManager.length})</span>
                      </button>
                      {managerOpen && upstreamManager.map(m => (
                        <ProgressRow
                          key={m.email}
                          label={m.displayName || emailName(m.email)}
                          completed={m.completed}
                          total={m.total}
                          variant="manager"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Search */}
              <div className="grt-search">
                <input
                  type="text"
                  placeholder="Search by client, partner, manager, stage, or reviewer..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
              </div>

              {/* Draft list */}
              {(() => {
                const totalPages = Math.max(1, Math.ceil(filteredInstances.length / pageSize));
                const start = (page - 1) * pageSize;
                const pageItems = filteredInstances.slice(start, start + pageSize);

                return (
                  <>
                    <div className="grt-table-wrap">
                      <table className="grt-table">
                        <thead>
                          <tr>
                            <th>Client</th>
                            <th>Partner</th>
                            <th>Manager</th>
                            <th>Stage</th>
                            <th>Status</th>
                            <th>Reviewer</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageItems.length === 0 ? (
                            <tr>
                              <td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>
                                No drafts found
                              </td>
                            </tr>
                          ) : (
                            pageItems.map(inst => (
                              <tr key={inst.instance_id}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{inst.client_code || '—'}</div>
                                  <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{inst.client_name || ''}</div>
                                </td>
                                <td>{inst.partner_name || emailName(inst.partner_reviewer)}</td>
                                <td>{inst.manager_name || emailName(inst.manager_reviewer)}</td>
                                <td>
                                  <span className={`grt-stage-badge grt-stage-badge--${inst.stage_code}`}>
                                    {inst.stage_name}
                                  </span>
                                </td>
                                <td>
                                  <span className={`grt-status-badge grt-status-badge--${inst.actionability}`}>
                                    {inst.actionability === 'actionable' ? 'Actionable' :
                                     inst.actionability === 'waiting' ? 'Waiting' : 'Completed'}
                                  </span>
                                </td>
                                <td>
                                  <div className="grt-reviewer-avatars">
                                    {getReviewerEmails(inst).map(e => (
                                      <ReviewerAvatar key={e} email={e} size={28} />
                                    ))}
                                  </div>
                                </td>
                                <td>
                                  {inst.actionability === 'actionable' ? (
                                    <button
                                      className="grt-review-btn"
                                      onClick={() => onReviewDraft?.(inst.draft_fee_idx, inst)}
                                    >
                                      Review →
                                    </button>
                                  ) : inst.actionability === 'waiting' ? (
                                    <span style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Waiting</span>
                                  ) : (
                                    <span style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Done</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {totalPages > 1 && (
                      <div className="grt-pagination">
                        <button
                          className="grt-page-btn"
                          disabled={page <= 1}
                          onClick={() => setPage(p => p - 1)}
                        >
                          ‹ Prev
                        </button>
                        <span className="grt-page-info">
                          Page {page} of {totalPages}
                          <span className="grt-page-total"> ({filteredInstances.length} drafts)</span>
                        </span>
                        <button
                          className="grt-page-btn"
                          disabled={page >= totalPages}
                          onClick={() => setPage(p => p + 1)}
                        >
                          Next ›
                        </button>
                        <select
                          className="grt-page-size"
                          value={pageSize}
                          onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                        >
                          <option value={10}>10 / page</option>
                          <option value={25}>25 / page</option>
                          <option value={50}>50 / page</option>
                          <option value={100}>100 / page</option>
                        </select>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
