// src/contexts/ApiContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { getToken } from '../services/PE-GetToken';

/**
 * ApiContext provides a configured axios instance once token is fetched.
 */
const ApiContext = createContext({ client: null, loading: true, error: null });

export function ApiProvider({ children }) {
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        // 1) fetch token
        const token = await getToken();
        // 2) create axios instance with baseURL + token
        const instance = axios.create({
          baseURL: process.env.REACT_APP_PE_API_URL,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        // 3) Optionally set interceptors
        instance.interceptors.response.use(
          res => res,
          err => {
            // global error handling
            return Promise.reject(err);
          }
        );
        if (isMounted) {
          setClient(instance);
        }
      } catch (e) {
        console.error('API init failed', e);
        if (isMounted) setError(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => { isMounted = false; };
  }, []);

  return (
    <ApiContext.Provider value={{ client, loading, error }}>
      {children}
    </ApiContext.Provider>
  );
}

/**
 * Hook to get the axios client once ready
 */
export function useApi() {
  const ctx = useContext(ApiContext);
  if (ctx === undefined) {
    throw new Error('useApi must be used within ApiProvider');
  }
  return ctx;
}

// Usage in index.js
// import { ApiProvider } from './contexts/ApiContext';
// ReactDOM.createRoot(rootEl).render(
//   <ApiProvider>
//     <App />
//   </ApiProvider>
// );

// In any component:
// import { useApi } from '../contexts/ApiContext';
// const { client, loading } = useApi();
// useEffect(() => {
//   if (!loading) client.get('/endpoint').then(r => console.log(r.data));
// }, [client, loading]);
