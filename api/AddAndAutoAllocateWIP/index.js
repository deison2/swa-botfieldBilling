module.exports = async function (context, req) {
  const token = req.headers['x-pe-token'] || req.body?.token;
  const payload = req.body?.payload || req.body;
  console.log('Adding and auto-allocating WIP with payload:');
  console.log(payload);

                const apiRes = await fetch(
                'https://bmss.pehosted.com/PE/api/Billing/DraftFeeAddInterimFeeAutoAllocate/',
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
                    body:   `Error getting draft analysis data: ${apiRes.status} ${result || ''}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
};