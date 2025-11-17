module.exports = async function (context, req) {
  const token = req.body.token;
  console.log('Token - ', token);
console.log(context);
const DebtTranIndex = context.bindingData.debtTranIndex;
console.log(DebtTranIndex);
const User = context.bindingData.user || "";
console.log("User - ", User);
const currentTime = new Date().toISOString();
console.log(currentTime);

  // POST to the real token endpoint
  const res = await fetch(
    "https://bmss.pehosted.com/PE/api/Billing/DraftFeeUpdateHeaderFields",
    {
      method:  'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    }, 
      body:    JSON.stringify({ "DraftIdx": DebtTranIndex,
                                "Fields": [
                                    {
                                    "FieldName": "DraftInUse", 
                                    "Value": User
                                    },
                                    {
                                    "FieldName": "DraftInUseSince", 
                                    "Value": currentTime
                                    }
                                ] 
                        })
    }
  );

  console.log(res);

  if (!res.ok) {
    const text = await res.text();
    context.res = {
      status: res.status,
      body:   `Token request failed: ${text}`
    };
    return;
  }

    context.res = {
    status: 200
  };
  return;
};