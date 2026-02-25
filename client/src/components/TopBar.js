import React, { useState } from 'react';
import './TopBar.css';
import UserAvatar from './UserAvatar';
import { useAuth } from '../auth/AuthContext';
import { useLocation } from 'react-router-dom';

export default function TopBar() {
  const { ready } = useAuth();
  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);
  const [page, setPage] = useState(0);

  const CHEAT_SHEET_URL = "https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/Botfield Billing App Cheat Sheet.docx";

  const downloadCheatSheet = () => {
    const a = document.createElement("a");
    a.href = CHEAT_SHEET_URL;
    a.download = "Botfield_Billing_Cheat_Sheet.docx";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

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

        <div className="user-profile" title="User Profile">
          {ready ? <UserAvatar size={40} /> : null}
        </div>
      </div>
    </header>
  );
}