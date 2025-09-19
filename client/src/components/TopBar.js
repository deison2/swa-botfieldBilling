// components/TopBar.js
import React from 'react';
import './TopBar.css';
import UserAvatar from './UserAvatar';
import { useAuth } from '../auth/AuthContext';

export default function TopBar() {
  const { ready } = useAuth();

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
          {ready ? <UserAvatar size={40} /> : null}
        </div>
      </div>
    </header>
  );
}