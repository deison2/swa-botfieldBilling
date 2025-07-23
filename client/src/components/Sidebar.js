// Sidebar.js
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar() {
  const [wipOpen, setWipOpen] = useState(false);

  const linkClass = ({ isActive }) =>
    isActive ? 'sidebar-link active' : 'sidebar-link';

  return (
    <aside className="sidebar">
      {/* Left-aligned bot + logo container */}
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
        {/* Collapsible WIP-Based-Billing */}
        <div
          className="wip-toggle"
          onClick={() => setWipOpen(open => !open)}
        >
          {wipOpen ? '▼' : '▶'} WIP-Based-Billing
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

        {/* Top-level pages */}
        <ul className="main-menu">
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
            <NavLink to="/Existing-Drafts" className={linkClass}>
              Existing Drafts
            </NavLink>
          </li>
          <li>
            <NavLink to="/Misc-Reports" className={linkClass}>
              Misc Reports
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="footer">© 2025 BMSS, LLC</div>
    </aside>
  );
}
