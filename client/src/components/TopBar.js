import React, { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import './TopBar.css';
import UserAvatar from './UserAvatar';
import { useAuth } from '../auth/AuthContext';
import { useLocation } from 'react-router-dom';
import NotificationCenter from '../pages/NotificationCenter';
import { getUnreadMentions, markMentionsRead } from '../services/ExistingDraftsService';

function TopBar({ onOpenDraftReview }, ref) {
  const { ready } = useAuth();
  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);
  const [page, setPage] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const CHEAT_SHEET_URL = "https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/Botfield Billing App Cheat Sheet.docx";

  const downloadCheatSheet = () => {
    const a = document.createElement("a");
    a.href = CHEAT_SHEET_URL;
    a.download = "Botfield_Billing_Cheat_Sheet.docx";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Fetch unread @mention count on mount + every 60s
  const refreshCount = useCallback(() => {
    getUnreadMentions()
      .then(data => setNotifCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 60000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  // Expose refreshCount so parent can trigger immediate badge update
  useImperativeHandle(ref, () => ({ refreshCount }), [refreshCount]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="app-name"></span>
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="cheat-sheet-btn"
          onClick={downloadCheatSheet}
          title="Download Botfield Billing Cheat Sheet"
        >
          Botfield Billing Cheat Sheet
        </button>

        <button
          type="button"
          className="topbar-bell"
          onClick={() => setNotifOpen(true)}
          title="Notifications"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {notifCount > 0 && (
            <span className="topbar-bell__badge">{notifCount}</span>
          )}
        </button>

        <div className="user-profile" title="User Profile">
          {ready ? <UserAvatar size={40} /> : null}
        </div>
      </div>

      <NotificationCenter
        open={notifOpen}
        onClose={() => { setNotifOpen(false); refreshCount(); }}
        onOpenDraft={(feeIdx) => {
          setNotifOpen(false);
          onOpenDraftReview?.(feeIdx);
        }}
      />
    </header>
  );
}

export default forwardRef(TopBar);