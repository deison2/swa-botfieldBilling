export function attachGlobalErrorLogging() {
  // Window errors
  window.addEventListener('error', (e) => {
    console.groupCollapsed('%cWINDOW ERROR', 'color:#f33');
    console.log('message:', e.message);
    console.log('filename:', e.filename);
    console.log('lineno:', e.lineno, 'colno:', e.colno);
    console.log('error:', e.error);
    console.groupEnd();
  });

  // Unhandled promise rejections (lots of network/CORS land here)
  window.addEventListener('unhandledrejection', (e) => {
    console.groupCollapsed('%cUNHANDLED PROMISE', 'color:#f93');
    console.log('reason:', e.reason);
    console.groupEnd();
  });
}