import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

import { AuthProvider } from './auth/AuthContext';   // ← NEW import

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>                                   {/* ← NEW wrapper */}
      <App />
    </AuthProvider>
  </React.StrictMode>
);

// CRA performance helper – keep as-is
reportWebVitals();

