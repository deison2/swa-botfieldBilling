// api/userPhoto/index.js
// Fetches a user's profile photo from Microsoft Graph by email.
// Usage: GET /api/userPhoto?email=user@bmss.com&size=64x64

// Token cache — reuse across invocations within the same Function host process
let cachedToken = null;
let tokenExpiresAt = 0;

async function getGraphToken(context) {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const tenant = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenant || !clientId || !clientSecret) return null;

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    context.log('[userPhoto] token error', res.status);
    return null;
  }

  const json = await res.json();
  cachedToken = json.access_token;
  // Expire 5 minutes early to be safe
  tokenExpiresAt = Date.now() + (json.expires_in - 300) * 1000;
  return cachedToken;
}

module.exports = async function (context, req) {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) {
    context.res = { status: 400, body: 'email query parameter is required' };
    return;
  }

  const token = await getGraphToken(context);
  if (!token) {
    context.res = {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    };
    return;
  }

  const allowed = new Set(['48x48', '64x64', '96x96', '120x120', '240x240']);
  const s = (req.query.size || '').trim();
  const sizeParam = allowed.has(s) ? s : '';
  const path = sizeParam ? `photos/${sizeParam}/$value` : 'photo/$value';
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/${path}`;

  try {
    const g = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!g.ok) {
      // No photo — return 204 so client knows to show initials
      context.res = {
        status: 204,
        headers: { 'Cache-Control': 'public, max-age=600' },
      };
      return;
    }

    const buf = Buffer.from(await g.arrayBuffer());
    context.res = {
      status: 200,
      isRaw: true,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=1800',
      },
      body: buf,
    };
  } catch (err) {
    context.log('[userPhoto] error', err.message);
    context.res = { status: 204, headers: { 'Cache-Control': 'no-store' } };
  }
};
