// /api/DownloadBulkList/index.js
const fetch = require('node-fetch');

module.exports = async function (context, req) {
  const listId = req.params.listId;
  if (!listId) {
    context.res = { status: 400, body: 'Missing listId parameter' };
    return;
  }

  // 1) Fetch an auth token
  const tokenRes = await fetch(
    'https://bmss.pehosted.com/auth/connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     process.env.PE_CLIENT_ID,
        client_secret: process.env.PE_CLIENT_SECRET
      })
    }
  );

  if (!tokenRes.ok) {
    const errTxt = await tokenRes.text();
    context.res = {
      status: tokenRes.status,
      body:   `Token fetch failed: ${errTxt}`
    };
    return;
  }
  const { access_token } = await tokenRes.json();

  // 2) Call the downstream DownloadBulkList endpoint
  const apiRes = await fetch(
    `https://bmss.pehosted.com/PE/api/Reports/DownloadBulkList/${encodeURIComponent(listId)}`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    }
  );

  if (!apiRes.ok) {
    const txt = await apiRes.text();
    context.res = {
      status: apiRes.status,
      body:   `Downstream API error: ${apiRes.status} ${txt}`
    };
    return;
  }

  // 3) Stream the binary back to the client
  const buffer      = await apiRes.buffer();
  const contentType = apiRes.headers.get('content-type') || 'application/octet-stream';
  context.res = {
    status: 200,
    isRaw:  true,
    headers: {
      'Content-Type': contentType
    },
    body: buffer
  };
};
