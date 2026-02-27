// /api/combineDrafts/index.js

module.exports = async function (context, req) {
  const parentDraftIndex = req.body.parentDraftIndex;
  const childDraftIndexes = req.body.childDraftIndexes;
  const token = req.body.token;

  if (!Array.isArray(childDraftIndexes)) {
    context.res = {
      status: 400,
      body: 'Request body must be an array of draft indexes'
    };
    return;
  }

  // 2) Call the external CreateBulkPrintList endpoint
  const apiRes = await fetch(
    `https://bmss.pehosted.com/PE/api/Billing/CombineDrafts/${parentDraftIndex}`,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(childDraftIndexes)
    }
  );

  const result = await apiRes.text();
  console.log(result);

  if (!apiRes.ok) {
    context.res = {
      status: apiRes.status,
      body:   `Error combining drafts: ${apiRes.status} ${result}`
    };
    return;
  }

  // 3) Proxy the text response back to the client
context.res = { status: 200, body: result };
return;
};
