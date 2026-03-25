// api/shared/auth.js — server-side auth helpers
// Mirrors the client-side BILLING_SUPER_USERS / SUPER_USERS lists from AuthContext.js

const BILLING_SUPER_USERS = [
  'deison@bmss.com',
  'chenriksen@bmss.com',
];

const BILLING_TEAM = [
  'deison@bmss.com',
  'chenriksen@bmss.com',
  'lambrose@bmss.com',
];

const SUPER_USERS = [
  'hstaggs@bmss.com',
  'tcrawford@bmss.com',
  'deison@bmss.com',
  'chenriksen@bmss.com',
  'lambrose@bmss.com',
  'bbrown@bmss.com',
  'ahouston@bmss.com',
  'ccassidy@bmss.com',
  'kfluker@bmss.com',
  'ahunt@bmss.com',
  'tzablan@bmss.com',
  'dbrown@bmss.com',
  'cbrien@bmss.com',
  'eriles@bmss.com',
  'micahmurphy@bmss.com',
  'kphillips@bmss.com',
  'svonhagel@bmss.com',
  'jbechert@bmss.com',
  'mmurphy@bmss.com',
];

function readPrincipal(req) {
  const hdr =
    req.headers['x-ms-client-principal'] ||
    req.headers['X-MS-CLIENT-PRINCIPAL'];
  if (!hdr || typeof hdr !== 'string') return null;
  try {
    const json = Buffer.from(hdr, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getEmail(req) {
  const p = readPrincipal(req);
  if (!p) return null;
  const raw = p.userDetails || p.userId || p.email || '';
  return raw.toLowerCase().trim() || null;
}

function isSuperUser(email) {
  return SUPER_USERS.includes((email || '').toLowerCase().trim());
}

function isBillingSuperUser(email) {
  return BILLING_SUPER_USERS.includes((email || '').toLowerCase().trim());
}

function isBillingTeam(email) {
  return BILLING_TEAM.includes((email || '').toLowerCase().trim());
}

function requireBillingSuperUser(context, req) {
  const email = getEmail(req);
  if (!email || !isBillingSuperUser(email)) {
    context.res = {
      status: 403,
      body: 'Forbidden — billing super-user access required.',
    };
    return null;
  }
  return email;
}

module.exports = {
  BILLING_SUPER_USERS,
  BILLING_TEAM,
  SUPER_USERS,
  readPrincipal,
  getEmail,
  isSuperUser,
  isBillingSuperUser,
  isBillingTeam,
  requireBillingSuperUser,
};
