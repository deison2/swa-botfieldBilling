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

const BILLING_SUPER_USERS = [
  'deison@bmss.com',
  'chenriksen@bmss.com',
];

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
  'tzablan@bmss.com',
  'dbrown@bmss.com',
  'cbrien@bmss.com',
  'eriles@bmss.com',
  'micahmurphy@bmss.com',
  'kphillips@bmss.com',
  'svonhagel@bmss.com',
  'jbechert@bmss.com',
  'mmurphy@bmss.com',
  'jkeohane@bmss.com',
  'jfair@bmss.com'
];

/* ---------- context + helper hook ---------- */

const AuthCtx = createContext({
  ready            : false,
  principal        : null,
  isSuperUser      : false,
  billingSuperUser : false,
  email            : undefined
});

export const useAuth = () => useContext(AuthCtx);

/* ---------- provider ---------- */

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    ready            : false,
    principal        : null,
    isSuperUser      : false,
    billingSuperUser : false,
    email            : undefined,
    blocked          : false
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
        const email          = clientPrincipal?.userDetails?.toLowerCase() || '';

        // // Block non-BMSS domain users (also block empty/null principal)
        // if (!email || !email.endsWith('@bmss.com')) {
        //   console.warn('[AUTH] Unauthorized or missing domain:', email || '(empty)');
        //   setState({
        //     ready: true, principal: null, isSuperUser: false,
        //     billingSuperUser: false, email: '', blocked: true
        //   });
        //   return;
        // }

        const isSuper        = SUPER_USERS.includes(email);
        const isBillingSuper = BILLING_SUPER_USERS.includes(email);

        if (DEBUG) {
          console.debug('principal  ', {
            email,
            identityProvider: clientPrincipal?.identityProvider,
            userId: clientPrincipal?.userId,
            userRoles: clientPrincipal?.userRoles
          });
          if (!email) {
            console.warn('[AUTH] Empty email from /.auth/me - likely anonymous session.');
          }
        }

        setState({
          ready            : true,
          principal        : clientPrincipal,
          isSuperUser      : isSuper,
          billingSuperUser : isBillingSuper,
          email
        });
      })
      .catch(err => {
        console.error('AUTH error', err);
        setState({ ready: true, principal: null, isSuperUser: false, billingSuperUser: false, email: '' });
      })
      .finally(() => console.groupEnd());
  }, []);

  if (state.blocked) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#f9fafb', fontFamily: "'Segoe UI', sans-serif"
      }}>
        <div style={{
          textAlign: 'center', padding: '48px', background: '#fff',
          borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', maxWidth: '440px'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>&#128274;</div>
          <h1 style={{ fontSize: '1.4rem', color: '#063941', margin: '0 0 8px' }}>
            Unauthorized Access
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 20px' }}>
            This application is restricted to BMSS users only.
            Please sign in with your @bmss.com account.
          </p>
          <a
            href="/.auth/logout?post_logout_redirect_uri=/login"
            style={{
              display: 'inline-block', padding: '10px 24px', background: '#063941',
              color: '#fff', borderRadius: '8px', textDecoration: 'none',
              fontSize: '0.9rem', fontWeight: 600
            }}
          >
            Sign in with a different account
          </a>
        </div>
      </div>
    );
  }

  return (
    <AuthCtx.Provider value={state}>
      {children}
    </AuthCtx.Provider>
  );
}
