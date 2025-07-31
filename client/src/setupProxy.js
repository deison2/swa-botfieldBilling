// src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // ➊ Proxy all /api/* to your local Functions host
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:7071',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '/api'    // preserves /api in the forwarded path
      },
    })
  );

  // ➋ Proxy /token to the external Auth endpoint
  app.use(
    '/token',
    createProxyMiddleware({
      target: 'https://bmss.pehosted.com',
      secure: false,
      changeOrigin: true,
      logLevel: 'debug', 
      pathRewrite: {
        '^/token': '/auth/connect/token'
      },
    })
  );
    app.use(
    '/GetDetails',
    createProxyMiddleware({
      target: 'https://bmss.pehosted.com',
      secure: false,
      changeOrigin: true,
      logLevel: 'debug',
      pathRewrite: {
        '^/GetDetails': '/PE/api/Jobs/GetDetails'
      },
    })
  );
    app.use(
    '/CreateBulkPrintList',
    createProxyMiddleware({
      target: 'https://bmss.pehosted.com',
      secure: false,
      changeOrigin: true,
      logLevel: 'debug',
      pathRewrite: {
        '^/CreateBulkPrintList': '/PE/api/Reports/CreateBulkPrintList/BulkDraftPrint'
      },
    })
  );
    app.use(
    '/DownloadBulkList',
    createProxyMiddleware({
      target: 'https://bmss.pehosted.com',
      secure: false,
      changeOrigin: true,
      logLevel: 'debug',
      pathRewrite: {
        '^/DownloadBulkList': '/PE/api/Reports/DownloadBulkList'
      },
    })
  );
};
