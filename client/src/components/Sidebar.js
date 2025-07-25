// src/components/Sidebar.js
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';   // 👈 NEW
import './Sidebar.css';

export default function Sidebar() {
  const { ready, isSuperUser } = useAuth();      // 👈 NEW
  const [wipOpen, setWipOpen] = useState(() => {
    const stored = window.localStorage.getItem('wipOpen');
    return stored !== null ? JSON.parse(stored) : false;
  });

  if (!ready) return null;                       // wait for /.auth/me

  const linkClass = ({ isActive }) =>
    isActive ? 'sidebar-link active' : 'sidebar-link';

  return (
    <aside className="sidebar">
      {/* ─── Logo header ─── */}
      <div className="logo-wrapper">
        <div className="botfield-container">
          <video
            className="keith-bot-icon"
            src="https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/kbWaving.mp4"
            autoPlay
            loop
            muted
            playsInline
          />
        </div>
        <div className="logo">Keith Botfield</div>
      </div>

      <nav className="nav">
        {/* ─── WIP-Based section (super-users only) ─── */}
        {isSuperUser && (
          <>
            <div
              className="wip-toggle"
              onClick={() =>
                setWipOpen(open => {
                  const next = !open;
                  window.localStorage.setItem('wipOpen', JSON.stringify(next));
                  return next;
                })
              }
            >
              {wipOpen ? '▼' : '▶'} WIP-Based Billing
            </div>

            {wipOpen && (
              <ul className="submenu">
                <li>
                  <NavLink
                    to="/WIP-Based-Billing/General-Information"
                    className={linkClass}
                  >
                    General Information
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/WIP-Based-Billing/Narrative-Standards"
                    className={linkClass}
                  >
                    Narrative Standards
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/WIP-Based-Billing/Office-Standards"
                    className={linkClass}
                  >
                    Office Standards
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/WIP-Based-Billing/Partner-Standards"
                    className={linkClass}
                  >
                    Partner Standards
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/WIP-Based-Billing/Client-Standards"
                    className={linkClass}
                  >
                    Client Standards
                  </NavLink>
                </li>
              </ul>
            )}
          </>
        )}

        {/* ─── Top-level pages ─── */}
        <ul className="main-menu">
          {isSuperUser && (
            <>
              <li>
                <NavLink to="/Recurring-Retainers" className={linkClass}>
                  Recurring Retainers
                </NavLink>
              </li>
              <li>
                <NavLink to="/Tech-Fees" className={linkClass}>
                  Tech Fees
                </NavLink>
              </li>
              <li>
                <NavLink to="/Billing-Groups" className={linkClass}>
                  Billing Groups
                </NavLink>
              </li>
              <li>
                <NavLink to="/Misc-Reports" className={linkClass}>
                  Misc Reports
                </NavLink>
              </li>
            </>
          )}

          {/* Everyone can see Existing Drafts */}
          <li>
            <NavLink to="/Existing-Drafts" className={linkClass}>
              Existing Drafts
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="footer">© 2025 BMSS, LLC</div>
    </aside>
  );
}