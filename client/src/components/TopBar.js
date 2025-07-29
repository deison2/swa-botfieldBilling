// components/TopBar.js
import React from 'react';
import './TopBar.css';

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="app-name"></span>
      </div>

      <div className="topbar-right">
        <button className="icon-button" title="Notifications">
          <i className="fas fa-bell"></i>
        </button>
        <button className="icon-button" title="Help">
          <i className="fas fa-question-circle"></i>
        </button>
        <div className="user-profile" title="User Profile">
          <span className="user-initials">DE</span>
        </div>
      </div>
    </header>
  );
}