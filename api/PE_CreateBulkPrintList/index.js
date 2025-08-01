// /api/CreateBulkPrintList/index.js

// const fetch = require('node-fetch');

module.exports = async function (context, req) {
  console.log('Context', context);
  console.log('req', req);
  const draftIndexes = req.body;

  if (!Array.isArray(draftIndexes)) {
    context.res = {
      status: 400,
      body: 'Request body must be an array of draft indexes'
    };
    return;
  }

  // 1) Grab a token
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
    const text = await tokenRes.text();
    context.res = {
      status: tokenRes.status,
      body:   `Failed to get auth token: ${text}`
    };
    return;
  }

  const { access_token } = await tokenRes.json();

  // 2) Call the external CreateBulkPrintList endpoint
  const apiRes = await fetch(
    'https://bmss.pehosted.com/PE/api/Reports/CreateBulkPrintList/BulkDraftPrint',
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${access_token}`
      },
      body: JSON.stringify(draftIndexes)
    }
  );

  if (!apiRes.ok) {
    const text = await apiRes.text();
    context.res = {
      status: apiRes.status,
      body:   `Error creating bulk print list: ${apiRes.status} ${text}`
    };
    return;
  }

  // 3) Proxy the JSON response back to the client
  const result = await apiRes.text();
  context.res = {
    status: 200,
    body:   result
  };
};
