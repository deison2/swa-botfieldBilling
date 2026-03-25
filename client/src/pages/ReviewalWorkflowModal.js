/*************************************************************************
 * ReviewalWorkflowModal.js
 * Modal for per-draft reviewal workflow: progress graph, draft data
 * comparison, and "Mark Reviewed" action.
 *************************************************************************/
import React, { useState, useMemo, useEffect, useRef } from 'react';
import './ReviewalWorkflowModal.css';

/* ── Stage definitions (left → right on the graph) ───────────── */
const STAGES = [
  { key: 'API',   code: 'API',  label: 'API Creation',          order: 0 },
  { key: 'BR',    code: 'BR',   label: 'Billing Team Review',   order: 1 },
  { key: 'MR',    code: 'MR',   label: 'Manager Review',        order: 2 },
  { key: 'PR',    code: 'PR',   label: 'Partner Review',        order: 3 },
  { key: 'OR',    code: 'OR',   label: 'Originator Review',     order: 4 },
  { key: 'POST',  code: 'POST', label: 'Steering Review',       order: 5 },
];

/* Map stage code → completion timestamp field on workflow instance */
const STAGE_TS = {
  API:  'ingested_at',
  BR:   'br_completed_at',
  MR:   'mr_completed_at',
  PR:   'pr_completed_at',
  OR:   'or_completed_at',
  POST: 'posted_at',
};

/* Map stage code → reviewer field */
const STAGE_REVIEWER = {
  BR: 'billing_reviewer',
  MR: 'manager_reviewer',
  PR: 'partner_reviewer',
  OR: 'originator_reviewer',
};

/* Map stage code → accent color for activity feed events */
const STAGE_COLORS = {
  BR:   '#2fb3a5',  // teal
  MR:   '#4F46E5',  // indigo
  PR:   '#7C3AED',  // purple
  OR:   '#0891B2',  // cyan
  POST: '#063941',  // dark teal
};

/* ── Helpers ─────────────────────────────────────────────────── */
const currency = n =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    .format(Number(n) || 0);

function stageIndex(stageCode) {
  return STAGES.findIndex(s => s.code === stageCode);
}

/** Which stages are in the past relative to the current stage? */
function isPast(pointCode, currentStageCode) {
  const cur = stageIndex(currentStageCode);
  const pt  = stageIndex(pointCode);
  return pt < cur;
}

function isCurrent(pointCode, currentStageCode) {
  return stageIndex(pointCode) === stageIndex(currentStageCode);
}

/* ── Permission check for "Mark Reviewed" ────────────────────── */
function canMarkReviewed(stageCode, email, isBillingSuperUser, workflow, isBillingTeam) {
  if (!email || !workflow) return false;
  const e = email.toLowerCase();

  // API Creation is not a reviewable stage
  if (stageCode === 'API') return false;

  // Billing Team Review — billing team members or billing super users
  if (stageCode === 'BR') return isBillingTeam || isBillingSuperUser;

  // Manager / Partner / Originator Review — assigned reviewer OR billingSuperUsers
  if (stageCode === 'MR' || stageCode === 'PR' || stageCode === 'OR') {
    if (isBillingSuperUser) return true;
    const reviewerCol = STAGE_REVIEWER[stageCode];
    const assigned = (workflow[reviewerCol] || '').toLowerCase();
    return assigned === e;
  }

  // Steering Review — only billingSuperUsers
  if (stageCode === 'POST') return isBillingSuperUser;

  return false;
}

/* ── Format client display: code + name if both present ──────── */
function formatClient(r) {
  const code = r.ClientCode || r.CLIENTCODE || r.clientCode || '';
  const name = r.ClientName || r.CLIENTNAME || r.clientName || '';
  if (code && name) return `(${code}) ${name}`;
  return name || code || '—';
}

/* ── Narrative HTML → plain text ─────────────────────────────── */
function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function ReviewalWorkflowModal({
  open,
  onClose,
  draftFeeIdx,
  workflow,          // workflow instance object (from getDraftPopulation enrichment or API)
  analysisItems,     // current draft analysis rows
  narrativeItems,    // current draft narrative rows
  email,
  isBillingSuperUser,
  isBillingTeam,
  onMarkReviewed,    // callback(instanceId) — parent handles the API call
  activityFeed,      // array of event objects from getDraftActivityFeed
  onPostComment,     // callback(comment) — parent posts to API and refreshes feed
  feedLoading,       // boolean — is the feed loading?
  onEditDraft,       // callback() — opens the edit tray for this draft
  draftVersions,     // array of version objects from getDraftVersions
  dataLoading,       // boolean — are analysis/narrative still loading?
  clientCode,        // client code for header display
  clientName,        // client name for header display
  elevated,          // boolean — render at higher z-index (above edit tray)
  lockInfo,          // { lockedBy } or null — draft locked by another user
  onRevertToVersion, // callback(versionData) — reverts the draft to a prior version snapshot
}) {
  /* ── Selected point on the progress graph ───────────────────── */
  const [selectedPoint, setSelectedPoint] = useState(null);

  /* ── Comment input state ────────────────────────────────────── */
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [reverting, setReverting] = useState(false);
  const feedEndRef = useRef(null);

  /* Reset all local state whenever the modal opens */
  useEffect(() => {
    if (open) {
      setSelectedPoint(null);
      setCommentText('');
      setPostingComment(false);
      setReverting(false);
    }
  }, [open]);

  /* Determine current stage from workflow data */
  const currentStageCode = useMemo(() => {
    if (!workflow) return 'BR'; // default
    // Map stage_id or stage_code
    return workflow.stage_code || 'BR';
  }, [workflow]);

  const currentStageIdx = stageIndex(currentStageCode);

  /* Build stage metadata (who/when) from workflow object */
  const stageInfo = useMemo(() => {
    const info = {};
    for (const s of STAGES) {
      const tsField = STAGE_TS[s.code];
      const ts = workflow?.[tsField] || null;
      const reviewerField = STAGE_REVIEWER[s.code];
      const reviewer = workflow?.[reviewerField] || null;
      info[s.code] = { completedAt: ts, reviewer };
    }
    // API Creation uses ingested_at
    if (workflow?.ingested_at) {
      info.API = { completedAt: workflow.ingested_at, reviewer: 'System' };
    } else {
      // Default — creation is always "done"
      info.API = { completedAt: workflow?.created_at || null, reviewer: 'System' };
    }
    return info;
  }, [workflow]);

  /* Whether we're showing a comparison (past point selected) */
  const showingComparison = selectedPoint && isPast(selectedPoint, currentStageCode);

  /* Find the version snapshot that was current when the selected stage completed */
  const selectedVersion = useMemo(() => {
    if (!showingComparison || !draftVersions?.length) return null;

    const tsField = STAGE_TS[selectedPoint];
    const stageCompletedAt = workflow?.[tsField];

    if (stageCompletedAt) {
      // Find the latest version created at or before the stage completion time
      const stageTs = new Date(stageCompletedAt).getTime();
      const candidates = draftVersions
        .filter(v => new Date(v.created_at).getTime() <= stageTs)
        .sort((a, b) => b.version_number - a.version_number);
      if (candidates.length) return candidates[0];
    }

    // Fallback: use the version whose order matches the stage order
    // API=0, BR=1, MR=2, etc. → version_number maps roughly to stage order
    const stageOrder = stageIndex(selectedPoint);
    const byOrder = draftVersions
      .filter(v => v.version_number <= stageOrder)
      .sort((a, b) => b.version_number - a.version_number);
    if (byOrder.length) return byOrder[0];

    // Last resort: return the oldest version (version 0)
    return draftVersions[0] || null;
  }, [showingComparison, selectedPoint, draftVersions, workflow]);

  /* Parse JSON strings from the version row */
  const versionAnalysis = useMemo(() => {
    if (!selectedVersion) return [];
    const raw = selectedVersion.analysis_data;
    if (!raw) return [];
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return []; }
  }, [selectedVersion]);

  const versionNarrative = useMemo(() => {
    if (!selectedVersion) return [];
    const raw = selectedVersion.narrative_data;
    if (!raw) return [];
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return []; }
  }, [selectedVersion]);

  /* Can the current user mark the current stage as reviewed? */
  const canReview = canMarkReviewed(currentStageCode, email, isBillingSuperUser, workflow, isBillingTeam);

  if (!open) return null;

  /* ── Handlers ─────────────────────────────────────────────── */
  const handlePointClick = (code) => {
    // Only past points are clickable for comparison
    if (isPast(code, currentStageCode)) {
      setSelectedPoint(prev => prev === code ? null : code);
    }
  };

  const handleMarkReviewed = () => {
    if (workflow?.instance_id && onMarkReviewed) {
      onMarkReviewed(workflow.instance_id);
    }
  };

  const handlePostComment = async () => {
    if (!commentText.trim() || !onPostComment) return;
    setPostingComment(true);
    try {
      await onPostComment(commentText.trim());
      setCommentText('');
      // Scroll feed to bottom after posting
      setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setPostingComment(false);
    }
  };

  const handleRevert = async () => {
    if (!selectedVersion || !onRevertToVersion || reverting) return;
    const label = STAGES.find(s => s.code === selectedPoint)?.label || selectedPoint;
    if (!window.confirm(`Revert this draft to the "${label} (v${selectedVersion.version_number})" version? This will overwrite the current analysis and narrative data.`)) return;
    setReverting(true);
    try {
      await onRevertToVersion({
        analysisData: versionAnalysis,
        narrativeData: versionNarrative,
        version: selectedVersion,
        stageLabel: label,
      });
      setSelectedPoint(null);
    } catch (err) {
      console.error('Revert failed:', err);
      alert('Sorry, something went wrong reverting to that version.');
    } finally {
      setReverting(false);
    }
  };

  const handleClose = () => {
    setSelectedPoint(null);
    setCommentText('');
    onClose();
  };

  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */
  return (
    <div className={`rwm-backdrop ${elevated ? 'rwm-backdrop--elevated' : ''}`} onClick={handleClose}>
      <div className="rwm-layout" onClick={e => e.stopPropagation()}>

        {/* ── MAIN MODAL (left) ──────────────────────────── */}
        <div className="rwm-modal">

          {/* ── HEADER ──────────────────────────────────── */}
          <div className="rwm-header">
            <h2 className="rwm-title">Reviewal Workflow</h2>
            <span className="rwm-subtitle">
              {clientCode && clientName
                ? `${clientCode} - ${clientName}`
                : `Draft #${draftFeeIdx}`}
            </span>
            {lockInfo?.lockedBy && (
              <span className="rwm-lock-banner">
                Draft currently locked by {lockInfo.lockedBy}
              </span>
            )}
          </div>

          {/* ── PROGRESS GRAPH (top section) ──────────────── */}
          <div className="rwm-progress">
            <div className="rwm-progress-line" />
            <div className="rwm-progress-fill"
              style={{ width: `${(currentStageIdx / (STAGES.length - 1)) * 100}%` }}
            />
            {STAGES.map((s, i) => {
              const past    = isPast(s.code, currentStageCode);
              const current = isCurrent(s.code, currentStageCode);
              const active  = selectedPoint === s.code;
              const info    = stageInfo[s.code];

              return (
                <div
                  key={s.key}
                  className={[
                    'rwm-point',
                    past    ? 'rwm-point--past'    : '',
                    current ? 'rwm-point--current' : '',
                    active  ? 'rwm-point--active'  : '',
                    past    ? 'rwm-point--clickable': '',
                  ].join(' ')}
                  style={{ left: `${(i / (STAGES.length - 1)) * 100}%` }}
                  onClick={() => handlePointClick(s.code)}
                >
                  <div className="rwm-dot" />
                  <div className="rwm-point-label">{s.label}</div>
                  {(past || current) && info?.completedAt && (
                    <div className="rwm-point-meta">
                      {info.reviewer && <span className="rwm-point-who">{info.reviewer}</span>}
                      <span className="rwm-point-when">
                        {new Date(info.completedAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── DRAFT DATA ────────────────────────────────── */}
          <div className={`rwm-body ${showingComparison ? 'rwm-body--compare' : ''}`}>
            {showingComparison ? (
              <>
                <div className="rwm-version rwm-version--old">
                  <sup className="rwm-version-label">
                    {STAGES.find(s => s.code === selectedPoint)?.label || selectedPoint} Version
                    {selectedVersion && ` (v${selectedVersion.version_number})`}
                  </sup>
                  <div className="rwm-draft-grid">
                    {selectedVersion ? (
                      <>
                        <AnalysisPanel items={versionAnalysis} />
                        <NarrativePanel items={versionNarrative} />
                      </>
                    ) : (
                      <>
                        <div className="rwm-analysis">
                          <h4 className="rwm-section-title">Analysis</h4>
                          <div className="rwm-placeholder">No saved version for this stage.</div>
                        </div>
                        <div className="rwm-narrative">
                          <h4 className="rwm-section-title">Narrative</h4>
                          <div className="rwm-placeholder">No saved version for this stage.</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="rwm-version rwm-version--current">
                  <sup className="rwm-version-label">Current Draft Version</sup>
                  <div className="rwm-draft-grid">
                    <AnalysisPanel items={analysisItems} loading={dataLoading} />
                    <NarrativePanel items={narrativeItems} loading={dataLoading} />
                  </div>
                </div>
              </>
            ) : (
              <div className="rwm-version rwm-version--single">
                <sup className="rwm-version-label">Current Draft Version</sup>
                <div className="rwm-draft-grid">
                  <AnalysisPanel items={analysisItems} loading={dataLoading} />
                  <NarrativePanel items={narrativeItems} loading={dataLoading} />
                </div>
              </div>
            )}
          </div>

          {/* ── FOOTER (buttons) ──────────────────────────── */}
          <div className="rwm-footer">
            <div className="rwm-footer-left">
              <button className="rwm-btn rwm-btn--close" onClick={handleClose}>
                Close
              </button>
              {canReview && (
                <button
                  className="rwm-btn rwm-btn--review"
                  title="Advance draft to next review stage"
                  onClick={handleMarkReviewed}
                >
                  Mark Reviewed
                </button>
              )}
            </div>
            <div className="rwm-footer-right">
              {showingComparison && selectedVersion && onRevertToVersion && (
                <button
                  className="rwm-btn rwm-btn--revert"
                  onClick={handleRevert}
                  disabled={reverting}
                >
                  {reverting ? 'Reverting...' : `Revert to ${STAGES.find(s => s.code === selectedPoint)?.label || selectedPoint} Version`}
                </button>
              )}
              <button
                className="rwm-btn rwm-btn--edit"
                onClick={onEditDraft}
              >
                Edit Draft
              </button>
            </div>
          </div>
        </div>

        {/* ── ACTIVITY FEED (floating right panel) ───────── */}
        <div className="rwm-feed">
          <h4 className="rwm-feed-title">Activity</h4>

          <div className="rwm-feed-list">
            {feedLoading && (
              <div className="rwm-feed-loading">Loading activity...</div>
            )}

            {!feedLoading && (!activityFeed || activityFeed.length === 0) && (
              <div className="rwm-feed-empty">No activity yet.</div>
            )}

            {(activityFeed || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map(evt => {
              const stageColor = STAGE_COLORS[evt.stageCode] || '#8aa0a3';
              return (
                <div key={evt.id} className={`rwm-evt rwm-evt--${evt.type?.toLowerCase()}`}>
                  <EventAvatar email={evt.user} />
                  <div className="rwm-evt-content">
                    <div className="rwm-evt-header">
                      <span className="rwm-evt-user">{evt.user}</span>
                      {evt.stageCode && (
                        <span className="rwm-evt-stage" style={{ background: `${stageColor}18`, color: stageColor, borderColor: stageColor }}>
                          {evt.stageName || evt.stageCode}
                        </span>
                      )}
                    </div>
                    <div className="rwm-evt-bubble" style={{ borderLeft: `3px solid ${stageColor}` }}>
                      {formatEventMessage(evt)}
                    </div>
                    <div className="rwm-evt-time">
                      {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : ''}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={feedEndRef} />
          </div>

          {/* Comment input */}
          <div className="rwm-comment-input">
            <textarea
              className="rwm-comment-textarea"
              placeholder="Add a comment..."
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              rows={2}
              disabled={postingComment}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handlePostComment();
                }
              }}
            />
            <button
              className="rwm-comment-send"
              disabled={!commentText.trim() || postingComment}
              onClick={handlePostComment}
            >
              {postingComment ? '...' : 'Send'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS — Analysis & Narrative panels
   (Replicates the ExistingDraftsEditTray layout in read-only form)
   ═══════════════════════════════════════════════════════════════ */

function AnalysisPanel({ items, loading }) {
  const rows = Array.isArray(items) ? items : [];

  return (
    <div className="rwm-analysis">
      <h4 className="rwm-section-title">Analysis</h4>
      {loading ? (
        <div className="rwm-loading-panel">
          <div className="rwm-spinner" />
          <span>Loading analysis...</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rwm-placeholder">No analysis data available.</div>
      ) : (
        <div className="rwm-table-wrap">
          <table className="rwm-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Service</th>
                <th>Job</th>
                <th>Type</th>
                <th className="num">WIP</th>
                <th className="num">Draft Amt</th>
                <th className="num">W/Off</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.AllocIdx ?? r.AllocIndex ?? i}>
                  <td>{formatClient(r)}</td>
                  <td>{r.WipService || r.ServIndex || r.SERVINDEX || '—'}</td>
                  <td>{r.JobTitle || r.JOBTITLE || '—'}</td>
                  <td>{r.WipType || r.WIPTYPE || '—'}</td>
                  <td className="num">{currency(r.WIPInClientCur ?? r.WIP ?? r.DRAFTWIP ?? 0)}</td>
                  <td className="num">{currency(r.BillInClientCur ?? r.BillAmount ?? r.DRAFTAMOUNT ?? 0)}</td>
                  <td className="num">{currency(r.WoffInClientCur ?? r.BillWoff ?? r.WRITE_OFF_UP ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NarrativePanel({ items, loading }) {
  const rows = Array.isArray(items) ? items : [];

  return (
    <div className="rwm-narrative">
      <h4 className="rwm-section-title">Narrative</h4>
      {loading ? (
        <div className="rwm-loading-panel">
          <div className="rwm-spinner" />
          <span>Loading narrative...</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rwm-placeholder">No narrative data available.</div>
      ) : (
        <div className="rwm-table-wrap">
          <table className="rwm-table">
            <thead>
              <tr>
                <th>Narrative Text</th>
                <th>Type</th>
                <th>Service</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="rwm-narr-text">
                    {stripHtml(r.FEENARRATIVE || r.FeeNarrative || r.feeNarrative || '')}
                  </td>
                  <td>{r.WIPType || r.WIPTYPE || r.WipType || '—'}</td>
                  <td>{r.SERVINDEX || r.ServIndex || r.ServPeriod || '—'}</td>
                  <td className="num">{currency(r.AMOUNT || r.Amount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS — Activity Feed helpers
   ═══════════════════════════════════════════════════════════════ */

/** Initials-based avatar for any email address */
function EventAvatar({ email }) {
  const initials = useMemo(() => {
    if (!email) return '?';
    const name = email.split('@')[0];
    const parts = name.split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [email]);

  // Deterministic color from email
  const bg = useMemo(() => {
    if (!email) return '#8aa0a3';
    let hash = 0;
    for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['#063941', '#0d5b56', '#2fb3a5', '#4F46E5', '#7C3AED', '#0891B2', '#059669'];
    return colors[Math.abs(hash) % colors.length];
  }, [email]);

  return (
    <div className="rwm-avatar" style={{ background: bg }} title={email}>
      {initials}
    </div>
  );
}

/** Format event message for different event types */
function formatEventMessage(evt) {
  if (!evt) return '';
  switch (evt.type) {
    case 'COMMENT':
      return evt.message || 'Left a comment';
    case 'APPROVED':
      return `Approved at ${evt.stageName || evt.stageCode || 'unknown'} stage`;
    case 'FORCE_APPROVED':
      return `Force-approved at ${evt.stageName || evt.stageCode || 'unknown'} stage`;
    case 'REJECTED':
      return `Rejected at ${evt.stageName || evt.stageCode || 'unknown'} stage${evt.message ? ': ' + evt.message : ''}`;
    case 'REASSIGNED':
      return `Reassigned to ${evt.reassignedTo || 'unknown'}${evt.message ? ' — ' + evt.message : ''}`;
    case 'ON_HOLD':
      return `Placed on hold${evt.message ? ': ' + evt.message : ''}`;
    case 'RELEASED':
      return 'Released from hold';
    case 'VIEWED':
      return 'Viewed the draft';
    case 'DRAFT_CHANGE': {
      const reason = evt.reason || 'Draft edited';
      const notes = evt.billingNotes || '';
      const changes = evt.message || '';
      return (
        <span>
          <strong>{reason}</strong>
          {notes ? ` — ${notes}` : ''}
          {changes ? (
            <span className="rwm-evt-changes">
              {changes.split('\n').map((line, i) => (
                <span key={i}>{i > 0 && <br />}{line}</span>
              ))}
            </span>
          ) : ''}
        </span>
      );
    }
    default:
      return evt.message || evt.type || '';
  }
}
