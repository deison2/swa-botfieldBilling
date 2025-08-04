import React from 'react';
import './Loader.css';

export default function Loader() {
  return (
    <div className="global-loader-overlay">
      {/* two matching animations side-by-side */}
      <div className="loader-boxes">
        <div className="push-pop loader">
          <div></div>
          <div></div>
        </div>
        <div className="push-out loader">
          <div></div>
          <div></div>
        </div>
      </div>
    </div>
  );
}
