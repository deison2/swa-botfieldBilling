// src/auth/AuthContext.js
import {
  createContext,
  useContext,
  useEffect,
  useState
} from 'react';

import { DEBUG } from '../debugFlag';
import { attachGlobalErrorLogging } from '../debugGlobal';
import { probeManifest } from '../debugNetwork';
import { logAuthMe } from './logAuth';

const SUPER_USERS = [
  'hstaggs@bmss.com',
  'tcrawford@bmss.com',
  'deison@bmss.com',
  'chenriksen@bmss.com',
  'lambrose@bmss.com',
  'bbrown@bmss.com',
  'ahouston@bmss.com',
  'ccassidy@bmss.com',
  'kfluker@bmss.com',
  'ahunt@bmss.com',
  'dbrown@bmss.com'
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
    // One-time debug hooks
    if (DEBUG) {
      attachGlobalErrorLogging();
      probeManifest();   // proves whether /manifest.json is being redirected by SWA
      logAuthMe();       // separate trace of /.auth/me for comparison
    }

    const url = '/.auth/me';
    console.groupCollapsed('%cAUTH fetch', 'color:#0af', url);

    fetch(url, { credentials: 'include', cache: 'no-store' })
      .then(async r => {
        // more granular signals than before
        console.debug('status     ', r.status, r.statusText);
        console.debug('redirected ', r.redirected);
        console.debug('responseURL', r.url);
        console.debug('contentType', r.headers.get('content-type'));

        const json = await r.json().catch(() => ({}));
        console.debug('body       ', json);
        return json;
      })
      .then(({ clientPrincipal }) => {
        const email   = clientPrincipal?.userDetails?.toLowerCase() || '';
        const isSuper = SUPER_USERS.includes(email);

        if (DEBUG) {
          console.debug('principal  ', {
            email,
            identityProvider: clientPrincipal?.identityProvider,
            userId: clientPrincipal?.userId,
            userRoles: clientPrincipal?.userRoles
          });
          // If email is empty, SWA likely thinks you’re anonymous in prod.
          if (!email) {
            console.warn('[AUTH] Empty email from /.auth/me — likely anonymous session.');
          }
        }

        setState({
          ready       : true,
          principal   : clientPrincipal,
          isSuperUser : isSuper,
          email
        });
      })
      .catch(err => {
        console.error('AUTH error', err);
        setState({ ready: true, principal: null, isSuperUser: false, email: '' });
      })
      .finally(() => console.groupEnd());
  }, []);

  return (
    <AuthCtx.Provider value={state}>
      {children}
    </AuthCtx.Provider>
  );
}
