export async function logAuthMe() {
  try {
    const r = await fetch('/.auth/me', { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    console.groupCollapsed('%cAUTH /.auth/me (side probe)', 'color:#0af');
    console.log('status     :', r.status);
    console.log('redirected :', r.redirected);
    console.log('url        :', r.url);
    console.log('body       :', j);
    console.groupEnd();
  } catch (e) {
    console.groupCollapsed('%cAUTH /.auth/me ERROR (side probe)', 'color:#f33');
    console.error(e);
    console.groupEnd();
  }
}
