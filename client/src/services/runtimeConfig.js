// src/services/runtimeConfig.js
// Centralized PE token manager — fetches once, caches, and silently
// refreshes every 55 minutes (token lifetime is 60 min).

let cachedToken = null;
let tokenPromise = null;   // de-dupe concurrent fetches
let refreshTimer = null;

const REFRESH_MS = 55 * 60 * 1000; // 55 minutes

async function fetchToken() {
  const res = await fetch('/api/getToken', { method: 'POST' });
  const text = await res.text();
  if (!res.ok) throw new Error(`getToken failed: ${res.status} ${text}`);
  return text;
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      cachedToken = await fetchToken();
      console.log('PE token silently refreshed');
      scheduleRefresh();
    } catch (err) {
      console.warn('PE token silent refresh failed, will retry on next call:', err.message);
      // Clear cached so next getAuthToken() forces a fresh fetch
      cachedToken = null;
      tokenPromise = null;
    }
  }, REFRESH_MS);
}

/**
 * Returns a valid PE token. On first call it fetches from the API,
 * then returns the cached value on subsequent calls. Concurrent
 * callers share the same in-flight request (no duplicate fetches).
 */
export async function getAuthToken() {
  if (cachedToken) return cachedToken;

  // If a fetch is already in flight, wait for it
  if (tokenPromise) return tokenPromise;

  tokenPromise = fetchToken().then(token => {
    cachedToken = token;
    tokenPromise = null;
    scheduleRefresh();
    return token;
  }).catch(err => {
    tokenPromise = null;
    throw err;
  });

  return tokenPromise;
}

/** Manually set a token (e.g. if obtained elsewhere) */
export function setAuthToken(token) {
  cachedToken = token;
  scheduleRefresh();
}

/** Bootstrap — call once at app startup to eagerly fetch the token */
export function initToken() {
  getAuthToken().catch(err => {
    console.warn('Initial PE token fetch failed:', err.message);
  });
}
