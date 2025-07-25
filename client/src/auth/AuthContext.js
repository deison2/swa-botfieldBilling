// src/auth/AuthContext.js
import {
  createContext,
  useContext,
  useEffect,
  useState
} from 'react';

const SUPER_USERS = [
  'tcrawford@bmss.com',
  'deison@bmss.com',
  'chenriksen@bmss.com'
];

/* ---------- context + helper hook ---------- */

const AuthCtx = createContext({
  ready       : false,
  principal   : null,
  isSuperUser : false,
  email       : undefined
});

export const useAuth = () => useContext(AuthCtx);

/* ---------- provider ---------- */

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    ready       : false,
    principal   : null,
    isSuperUser : false,
    email       : undefined
  });

  useEffect(() => {
    const url = '/.auth/me';
    console.groupCollapsed('%cAUTH fetch', 'color:#0af', url);

    fetch(url, { credentials: 'include' })
      .then(async r => {
        console.debug('status', r.status, r.statusText);
        const json = await r.json().catch(() => ({}));
        console.debug('body  ', json);
        return json;
      })
      .then(({ clientPrincipal }) => {
        const email   = clientPrincipal?.userDetails?.toLowerCase() || '';
        const isSuper = SUPER_USERS.includes(email);
        setState({
          ready       : true,
          principal   : clientPrincipal,
          isSuperUser : isSuper,
          email
        });
      })
      .catch(err => {
        console.error('AUTH error', err);
        setState({ ready: true, principal: null, isSuperUser: false });
      })
      .finally(() => console.groupEnd());
  }, []);

  return (
    <AuthCtx.Provider value={state}>
      {children}
    </AuthCtx.Provider>
  );
}
