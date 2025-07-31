// const dbBase      = 'https://bmss.pehosted.com';
const clientId     = process.env.REACT_APP_PE_CLIENT_ID;
const clientSecret = process.env.REACT_APP_PE_CLIENT_SECRET;

export async function getToken() {
  // 1) Build URL-encoded form body
  const params = new URLSearchParams();
  params.append('grant_type',    'client_credentials');
  params.append('client_id',     clientId);
  params.append('client_secret', clientSecret);

  // 2) Send POST via fetch

  const url = '/token';

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  // 3) Throw on HTTP errors
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed: ${res.status} ${text}`);
  }

  // 4) Parse JSON and return the token
  const json = await res.json();
  return json.access_token;
}
