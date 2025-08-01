// /api/DownloadBulkList/index.js
// const fetch = require('node-fetch');

module.exports = async function (context, req) {
  const listId = req.params.listId;
  const token = req.body.token;
  console.log(listId);
  if (!listId) {
    context.res = { status: 400, body: 'Missing listId parameter' };
    return;
  }
  
  const apiRes = await fetch(
    `https://bmss.pehosted.com/PE/api/Reports/ProcessBulkList/${listId}`,
    {
      method:  'GET',
      headers: {
        'Authorization': `Bearer ${token}`
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
  const arrayBuf = await apiRes.arrayBuffer();
  // wrap them in a Node Buffer
  const buffer   = Buffer.from(arrayBuf);

   context.res = {
    headers : {
      'Content-Type':        'application/pdf'
    },
    status: 200,
    isRaw:  true, 
    body: buffer

  };
  return;
};
