export async function probeManifest() {
  try {
    const res = await fetch('/manifest.json', { cache: 'no-store' });
    const text = await res.text().catch(() => '(binary)');
    console.groupCollapsed('%cMANIFEST probe', 'color:#0af');
    console.log('status      :', res.status, res.statusText);
    console.log('redirected  :', res.redirected);
    console.log('responseURL :', res.url);
    console.log('contentType :', res.headers.get('content-type'));
    console.log('body head   :', text.slice(0, 200));
    console.groupEnd();
  } catch (err) {
    console.groupCollapsed('%cMANIFEST probe ERROR', 'color:#f33');
    console.error(err);
    console.groupEnd();
  }
}