/*************************************************************************
 * AutoApproveSettings.js
 * Modal for managing reviewer auto-approval relationships.
 * Partners can auto-approve managers (PR_SKIP).
 * Originators can auto-approve partners (OR_SKIP).
 *************************************************************************/
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  getAutoApprovals,
  createAutoApproval,
  revokeAutoApproval,
} from '../services/ExistingDraftsService';
import './AutoApproveSettings.css';

/* ── Profile photo avatar ──────────────────────────────────── */
const aasPhotoCache = new Map();

function AasAvatar({ email, size = 24 }) {
  const [state, setState] = React.useState(() => aasPhotoCache.get(email) || { url: null, checked: false });

  React.useEffect(() => {
    if (state.checked) return;
    let cancelled = false;
    const img = new Image();
    const src = `/api/userPhoto?email=${encodeURIComponent(email)}&size=64x64`;
    img.onload = () => {
      if (cancelled) return;
      const entry = { url: src, checked: true };
      aasPhotoCache.set(email, entry);
      setState(entry);
    };
    img.onerror = () => {
      if (cancelled) return;
      const entry = { url: null, checked: true };
      aasPhotoCache.set(email, entry);
      setState(entry);
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [email, state.checked]);

  const initial = (email || '?').split('@')[0].charAt(0).toUpperCase();

  return (
    <span className="aas-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {state.url
        ? <img src={state.url} alt="" className="aas-avatar__img" />
        : <span className="aas-avatar__init">{initial}</span>
      }
    </span>
  );
}

/* ── Searchable email combobox ─────────────────────────────── */
function EmailCombobox({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = (options || []).filter(e =>
    e.toLowerCase().includes((search || value || '').toLowerCase())
  );

  const handleInputChange = (e) => {
    setSearch(e.target.value);
    onChange(e.target.value);
    if (!open) setOpen(true);
  };

  const handleSelect = (email) => {
    onChange(email);
    setSearch('');
    setOpen(false);
  };

  return (
    <div className="aas-combo" ref={wrapRef}>
      <input
        className="aas-add-form__input"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && filtered.length > 0 && (
        <div className="aas-combo__list">
          {filtered.map(email => (
            <div
              key={email}
              className={`aas-combo__option ${email === value ? 'aas-combo__option--selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(email); }}
            >
              {email}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const RELATIONSHIP_INFO = {
  PR_SKIP: {
    title: 'Partner → Manager',
    description: 'When you are the Partner reviewer, automatically approve drafts where one of these Managers has already approved.',
    approverRole: 'Partner',
    revieweeRole: 'Manager',
    placeholder: 'manager@bmss.com',
  },
  OR_SKIP: {
    title: 'Originator → Partner',
    description: 'When you are the Originator reviewer, automatically approve drafts where one of these Partners has already approved.',
    approverRole: 'Originator',
    revieweeRole: 'Partner',
    placeholder: 'partner@bmss.com',
  },
};

export default function AutoApproveSettings({ open, onClose, availableEmails = [] }) {
  const { email, isSuperUser, billingSuperUser } = useAuth();
  const isAdmin = isSuperUser || billingSuperUser;

  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // New-relationship form state
  const [newType, setNewType] = useState('PR_SKIP');
  const [newEmail, setNewEmail] = useState('');
  // Admin-only: override the approver email
  const [newApproverEmail, setNewApproverEmail] = useState('');

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAutoApprovals();
      setApprovals(data || []);
    } catch (err) {
      setError('Failed to load auto-approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchApprovals();
      setNewEmail('');
      setNewApproverEmail('');
      setNewType('PR_SKIP');
    }
  }, [open, fetchApprovals]);

  const handleAdd = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) return;

    const approver = isAdmin && newApproverEmail.trim()
      ? newApproverEmail.trim().toLowerCase()
      : email;

    setSaving(true);
    setError('');
    try {
      await createAutoApproval({
        relationshipType: newType,
        approverEmail: approver,
        revieweeEmail: trimmed,
      });
      setNewEmail('');
      setNewApproverEmail('');
      await fetchApprovals();
    } catch (err) {
      setError(err.message || 'Failed to create auto-approval');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm('Revoke this auto-approval?')) return;
    setError('');
    try {
      await revokeAutoApproval(id);
      await fetchApprovals();
    } catch (err) {
      setError(err.message || 'Failed to revoke');
    }
  };

  if (!open) return null;

  const emailName = (e) => {
    if (!e) return '—';
    const at = e.indexOf('@');
    return at > 0 ? e.substring(0, at) : e;
  };

  // Group approvals by type
  const prSkip = approvals.filter(a => a.relationship_type === 'PR_SKIP');
  const orSkip = approvals.filter(a => a.relationship_type === 'OR_SKIP');

  // For non-admin users, only their own approvals are returned by the API,
  // but let's also group by approver for admin view
  const renderSection = (type, items) => {
    const info = RELATIONSHIP_INFO[type];
    // Group by approver for admin view
    const grouped = {};
    items.forEach(a => {
      const key = a.approver_email?.toLowerCase() || 'unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    });

    return (
      <div className="aas-section" key={type}>
        <div className="aas-section__header">
          <span className={`aas-section__badge aas-section__badge--${type}`}>
            {info.title}
          </span>
          <span className="aas-section__desc">{info.description}</span>
        </div>

        {items.length === 0 ? (
          <div className="aas-empty">No auto-approvals configured</div>
        ) : isAdmin ? (
          // Admin: show grouped by approver
          Object.entries(grouped).map(([approver, list]) => (
            <div key={approver} className="aas-group">
              <div className="aas-group__label">
                <AasAvatar email={approver} size={20} />
                {approver}
              </div>
              <div className="aas-list">
                {list.map(a => (
                  <div key={a.id} className="aas-item">
                    <AasAvatar email={a.reviewee_email} size={24} />
                    <span className="aas-item__email">
                      {a.reviewee_email}
                    </span>
                    <span className="aas-item__meta">
                      added {new Date(a.created_at).toLocaleDateString()}
                    </span>
                    <button
                      className="aas-item__revoke"
                      onClick={() => handleRevoke(a.id)}
                      title="Revoke"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          // Regular user: flat list
          <div className="aas-list">
            {items.map(a => (
              <div key={a.id} className="aas-item">
                <AasAvatar email={a.reviewee_email} size={24} />
                <span className="aas-item__email">
                  {a.reviewee_email}
                </span>
                <span className="aas-item__meta">
                  added {new Date(a.created_at).toLocaleDateString()}
                </span>
                <button
                  className="aas-item__revoke"
                  onClick={() => handleRevoke(a.id)}
                  title="Revoke"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="aas-backdrop" onClick={onClose}>
      <div className="aas-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="aas-header">
          <span className="aas-title">Auto-Approve Settings</span>
          <button className="aas-close" onClick={onClose}>×</button>
        </div>

        {/* Error banner */}
        {error && <div className="aas-error">{error}</div>}

        {/* Body */}
        <div className="aas-body">
          {loading ? (
            <div className="aas-loading">Loading...</div>
          ) : (
            <>
              {renderSection('PR_SKIP', prSkip)}
              {renderSection('OR_SKIP', orSkip)}
            </>
          )}
        </div>

        {/* Add form */}
        <div className="aas-add-form">
          <span className="aas-add-form__label">Add auto-approval</span>
          <div className="aas-add-form__row">
            <select
              className="aas-add-form__select"
              value={newType}
              onChange={e => setNewType(e.target.value)}
            >
              <option value="PR_SKIP">Partner → Manager</option>
              <option value="OR_SKIP">Originator → Partner</option>
            </select>

            {isAdmin && (
              <EmailCombobox
                value={newApproverEmail}
                onChange={setNewApproverEmail}
                options={availableEmails}
                placeholder="Approver email (admin)"
              />
            )}

            <EmailCombobox
              value={newEmail}
              onChange={setNewEmail}
              options={availableEmails}
              placeholder={RELATIONSHIP_INFO[newType].placeholder}
            />

            <button
              className="aas-add-form__btn"
              onClick={handleAdd}
              disabled={saving || !newEmail.trim()}
            >
              {saving ? 'Adding...' : 'Add'}
            </button>
          </div>

          <span className="aas-add-form__hint">
            {newType === 'PR_SKIP'
              ? 'The email above should be a Manager you trust to review on your behalf.'
              : 'The email above should be a Partner you trust to review on your behalf.'}
          </span>
        </div>
      </div>
    </div>
  );
}
