/*************************************************************************
 * NotificationCenter.js
 * Modal showing unread @mentions across all drafts for the current user.
 *************************************************************************/
import React, { useState, useEffect, useCallback } from 'react';
import { getUnreadMentions, markMentionsRead } from '../services/ExistingDraftsService';
import './NotificationCenter.css';

export default function NotificationCenter({ open, onClose, onOpenDraft }) {
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchMentions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUnreadMentions();
      setMentions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load mentions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchMentions();
  }, [open, fetchMentions]);

  const handleOpenDraft = async (draftFeeIdx) => {
    // Mark mentions for this draft as read
    try {
      await markMentionsRead(draftFeeIdx);
      setMentions(prev => prev.filter(m => m.draft_fee_idx !== draftFeeIdx));
    } catch (err) {
      console.warn('Failed to mark mentions read:', err);
    }
    onClose();
    onOpenDraft?.(draftFeeIdx);
  };

  const handleMarkAllRead = async () => {
    try {
      // Mark each unique draft's mentions as read
      const drafts = [...new Set(mentions.map(m => m.draft_fee_idx))];
      await Promise.all(drafts.map(feeIdx => markMentionsRead(feeIdx)));
      setMentions([]);
    } catch (err) {
      console.warn('Failed to mark all as read:', err);
    }
  };

  if (!open) return null;

  // Group mentions by draft_fee_idx
  const grouped = {};
  for (const m of mentions) {
    if (!grouped[m.draft_fee_idx]) grouped[m.draft_fee_idx] = [];
    grouped[m.draft_fee_idx].push(m);
  }

  const emailName = (e) => {
    if (!e) return '—';
    const at = e.indexOf('@');
    return at > 0 ? e.substring(0, at) : e;
  };

  return (
    <div className="nc-backdrop" onClick={onClose}>
      <div className="nc-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="nc-header">
          <span className="nc-title">Notifications</span>
          <div className="nc-header__actions">
            {mentions.length > 0 && (
              <button className="nc-mark-all" onClick={handleMarkAllRead}>
                Mark all as read
              </button>
            )}
            <button className="nc-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Body */}
        <div className="nc-body">
          {loading ? (
            <div className="nc-loading">Loading notifications...</div>
          ) : mentions.length === 0 ? (
            <div className="nc-empty">No unread mentions</div>
          ) : (
            Object.entries(grouped).map(([feeIdx, items]) => (
              <div key={feeIdx} className="nc-draft-group">
                <button
                  className="nc-draft-header"
                  onClick={() => handleOpenDraft(Number(feeIdx))}
                >
                  <span className="nc-draft-idx">Draft #{feeIdx}</span>
                  <span className="nc-draft-count">{items.length} mention{items.length > 1 ? 's' : ''}</span>
                  <span className="nc-draft-arrow">→</span>
                </button>
                <div className="nc-mention-list">
                  {items.map(m => (
                    <div key={m.mention_id} className="nc-mention-item">
                      <div className="nc-mention-from">
                        <strong>{emailName(m.mentioned_by)}</strong>
                        {m.stage_name && (
                          <span className="nc-mention-stage">{m.stage_name}</span>
                        )}
                      </div>
                      <div className="nc-mention-comment">
                        {(m.comments || '').length > 120
                          ? m.comments.slice(0, 120) + '...'
                          : m.comments || 'Mentioned you'}
                      </div>
                      <div className="nc-mention-time">
                        {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
