// /api/CreateBulkPrintList/index.js

module.exports = async function (context, req) {
  const draftIndexes = req.body.indexArray;
  const token = req.body.token;
  console.log(draftIndexes);
console.log('Type of each element:', draftIndexes.map(x => typeof x));

  if (!Array.isArray(draftIndexes)) {
    context.res = {
      status: 400,
      body: 'Request body must be an array of draft indexes'
    };
    return;
  }

  // 2) Call the external CreateBulkPrintList endpoint
  const apiRes = await fetch(
    'https://bmss.pehosted.com/PE/api/Reports/CreateBulkPrintList/BulkDraftPrint',
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(draftIndexes)
    }
  );

  const result = await apiRes.text();
  console.log(result);

  if (!apiRes.ok) {
    context.res = {
      status: apiRes.status,
      body:   `Error creating bulk print list: ${apiRes.status} ${result}`
    };
    return;
  }

  // 3) Proxy the text response back to the client
context.res = { status: 200, body: result };
return;
};
