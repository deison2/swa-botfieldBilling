module.exports = async function (context, req) {
  const token = req.body.token;
  const payload = req.body.payload;
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

                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error getting draft analysis data: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
};