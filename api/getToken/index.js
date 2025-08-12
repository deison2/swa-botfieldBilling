// /api/token/index.js

module.exports = async function (context, req) {
const clientId     = process.env.PE_CLIENT_ID;
const clientSecret = process.env.PE_CLIENT_SECRET;


  // Build URL-encoded form body
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret
  });

  // POST to the real token endpoint
  const tokenRes = await fetch(
    'https://bmss.pehosted.com/auth/connect/token',
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params
    }
  );

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    context.res = {
      status: tokenRes.status,
      body:   `Token request failed: ${text}`
    };
    return;
  }

  // Proxy the JSON back to the client
  const json = await tokenRes.json();
  console.log(json.access_token);
    context.res = {
    status: 200,
    body: json.access_token
  };
  return;
};
