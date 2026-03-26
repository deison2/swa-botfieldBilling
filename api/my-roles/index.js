/**
 * GET /api/my-roles
 *
 * Returns { isSuperUser, billingSuperUser } for the authenticated user.
 * The actual email lists live server-side in environment variables,
 * so they are never shipped to the browser.
 */
module.exports = async function (context, req) {
  // Parse SWA client principal
  const header = req?.headers?.['x-ms-client-principal'];
  context.log('[my-roles] x-ms-client-principal header present:', !!header);

  if (!header) {
    context.res = {
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Not authenticated.' }),
    };
    return;
  }

  let email = '';
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const principal = JSON.parse(decoded);
    email = (principal?.userDetails || '').toString().trim().toLowerCase();
    context.log('[my-roles] email:', email);
  } catch {
    context.res = {
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid principal.' }),
    };
    return;
  }

  if (!email || !email.endsWith('@bmss.com')) {
    context.res = {
      status: 403,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Access restricted to BMSS accounts.' }),
    };
    return;
  }

  const parseList = (envVar) =>
    (process.env[envVar] || '')
      .split(/[;,\s]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

  const superUsers        = parseList('SUPER_USERS');
  const billingSuperUsers = parseList('BILLING_SUPER_USERS');

  context.log('[my-roles] SUPER_USERS env var set:', !!process.env.SUPER_USERS);
  context.log('[my-roles] parsed superUsers count:', superUsers.length);
  context.log('[my-roles] match:', superUsers.includes(email));

  context.res = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      isSuperUser: superUsers.includes(email),
      billingSuperUser: billingSuperUsers.includes(email),
    }),
  };
};
