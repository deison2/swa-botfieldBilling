module.exports = async function (context, req) {
  const token = req.body.token;
  const DebtTranIndex = req.body.DebtTranIndex;

                const apiRes = await fetch(
                `https://bmss.pehosted.com/PE/api/Billing/AbandonDraft/${DebtTranIndex}`,
                {
                     method:  'POST',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    }
                }
                );

                const result = await apiRes.text();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error abandoning draft: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
};