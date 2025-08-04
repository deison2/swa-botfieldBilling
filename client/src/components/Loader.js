import React from 'react';
import './Loader.css';

export default function Loader() {
  return (
    <div className="global-loader-overlay">
      <div className="push-pop loader">
        <div></div>
        <div></div>
      </div>
    </div>
  );
}
