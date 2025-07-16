// components/TopBar.js
import React from 'react';
import './TopBar.css';

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-left">
        Automated Billing Application
      </div>
      <div className="topbar-icons">
        <button className="icon-button" aria-label="Notifications">
          🔔
        </button>
        <button className="icon-button" aria-label="Help">
          ❓
        </button>
        <button className="icon-button" aria-label="User Profile">
          <div className="user-circle">DE</div>
        </button>
      </div>
    </header>
  );
}
