/*************************************************************************
 * BulkReviewalUpdateModal.js
 * Two-step modal for bulk-advancing selected drafts:
 *   1. If drafts span multiple stages → pick which stage to advance
 *   2. Confirm & submit (advances eligible drafts by one step)
 *************************************************************************/
import React, { useState, useMemo } from 'react';
import './BulkReviewalUpdateModal.css';

const STAGE_META = {
  1: { code: 'BR', label: 'Billing Team Review', next: { id: 2, label: 'Manager Review' } },
  2: { code: 'MR', label: 'Manager Review',      next: { id: 3, label: 'Partner Review' } },
  3: { code: 'PR', label: 'Partner Review',       next: { id: 4, label: 'Originator Review' } },
  4: { code: 'OR', label: 'Originator Review',    next: { id: 5, label: 'Post' } },
  5: { code: 'POST', label: 'Post',               next: null },
};

export default function BulkReviewalUpdateModal({
  open,
  onClose,
  actionableDrafts = [],  // [{id, stageCode, stageId}]
  notActionableCount = 0,
  onSubmit,     // (targetStageId, eligibleIds) => Promise
  submitting,
}) {
  const [selectedStageId, setSelectedStageId] = useState(null);

  // Group actionable drafts by their current stage
  const stageGroups = useMemo(() => {
    const groups = {};
    for (const d of actionableDrafts) {
      const sid = d.stageId;
      if (!STAGE_META[sid]?.next) continue; // skip POST — can't advance further
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push(d.id);
    }
    return groups;
  }, [actionableDrafts]);

  const stageIds = Object.keys(stageGroups).map(Number).sort((a, b) => a - b);
  const multipleStages = stageIds.length > 1;

  // Auto-select if only one stage present
  const activeStageId = multipleStages ? selectedStageId : stageIds[0] || null;
  const eligibleIds = activeStageId ? (stageGroups[activeStageId] || []) : [];
  const meta = activeStageId ? STAGE_META[activeStageId] : null;

  // Count drafts at POST that can't advance
  const postCount = actionableDrafts.filter(d => d.stageId === 5).length;

  if (!open) return null;

  const handleSubmit = () => {
    if (!meta?.next || !eligibleIds.length) return;
    onSubmit(meta.next.id, eligibleIds);
  };

  const handleClose = () => {
    setSelectedStageId(null);
    onClose();
  };

  return (
    <div className="bru-backdrop" onClick={handleClose}>
      <div className="bru-modal" onClick={e => e.stopPropagation()}>
        <div className="bru-header">
          <span className="bru-title">Bulk Reviewal Update</span>
          <button className="bru-close" onClick={handleClose}>×</button>
        </div>

        <div className="bru-body">
          {/* Exclusion notices */}
          {(notActionableCount > 0 || postCount > 0) && (
            <p className="bru-desc bru-desc--muted">
              {notActionableCount > 0 && (
                <><strong>{notActionableCount}</strong> draft{notActionableCount !== 1 ? 's' : ''} excluded — not currently actionable for you.</>
              )}
              {notActionableCount > 0 && postCount > 0 && ' '}
              {postCount > 0 && (
                <><strong>{postCount}</strong> draft{postCount !== 1 ? 's' : ''} excluded — already at Post.</>
              )}
            </p>
          )}

          {stageIds.length === 0 ? (
            <p className="bru-desc">No selected drafts are eligible for advancement.</p>
          ) : multipleStages && !selectedStageId ? (
            /* ── Step 1: Pick a stage ── */
            <>
              <p className="bru-desc">
                Your selection contains drafts across multiple reviewal stages. Select which stage to advance:
              </p>
              <div className="bru-stage-list">
                {stageIds.map(sid => {
                  const m = STAGE_META[sid];
                  const count = stageGroups[sid].length;
                  return (
                    <button
                      key={sid}
                      className="bru-stage-option"
                      onClick={() => setSelectedStageId(sid)}
                    >
                      <span className="bru-stage-option__label">{m.label}</span>
                      <span className="bru-stage-option__count">{count} draft{count !== 1 ? 's' : ''}</span>
                      <span className="bru-stage-option__arrow">&rarr; {m.next.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* ── Step 2 (or only step): Confirm ── */
            <>
              {multipleStages && (
                <button className="bru-back" onClick={() => setSelectedStageId(null)}>&larr; Back</button>
              )}
              <p className="bru-desc">
                Advance <strong>{eligibleIds.length}</strong> draft{eligibleIds.length !== 1 ? 's' : ''} from <strong>{meta?.label}</strong> to <strong>{meta?.next?.label}</strong>.
              </p>
            </>
          )}
        </div>

        <div className="bru-footer">
          <button className="bru-cancel" onClick={handleClose}>Cancel</button>
          <button
            className="bru-submit"
            disabled={!activeStageId || submitting || eligibleIds.length === 0 || (multipleStages && !selectedStageId)}
            onClick={handleSubmit}
          >
            {submitting ? 'Updating...' : `Submit (${eligibleIds.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
