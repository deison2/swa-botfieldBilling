import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { getToken } from './services/PE - GetToken';
import { setAuthToken } from './services/runtimeConfig';

import { AuthProvider } from './auth/AuthContext';   // ← NEW import

console.log(
  'Available env vars:',
  Object.entries(process.env)
);

async function bootstrap() {
  try {
        const token = await getToken();
    setAuthToken(token);
  } catch (err) {
    console.error('Failed to get auth token:', err);
    // decide whether to render a fallback UI or still boot the app
  }

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>                                   {/* ← NEW wrapper */}
      <App />
    </AuthProvider>
  </React.StrictMode>
);
}

// CRA performance helper – keep as-is
reportWebVitals();
bootstrap();