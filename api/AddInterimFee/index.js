module.exports = async function (context, req) {
  const token = req.headers['x-pe-token'] || req.body?.token;
  const payload = req.body?.payload || req.body;
  console.log('Adding interim fee with payload:');
  console.log(payload);

  const apiRes = await fetch(
    'https://bmss.pehosted.com/pe/api/Billing/DraftFeeAddInterimFee/',
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }
  );

  const _text = await apiRes.text();
  let result;
  try { result = _text ? JSON.parse(_text) : null; } catch { result = _text; }
  console.log(result);

  if (!apiRes.ok) {
    context.res = {
      status: apiRes.status,
      body:   `Error adding interim fee: ${apiRes.status} ${result || ''}`
    };
    return;
  }

  context.res = { status: 200, body: result };
  return;
};
