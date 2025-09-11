// api/billingDate/index.js
// Simplified: NO server-side super-user enforcement.
// GET  -> returns { billThroughDate, updatedBy, updatedTimestamp } or default (EOM-1).
// POST -> writes the same shape; only checks YYYY-MM-DD format.
//
// Requires: npm i @azure/storage-blob
//
// Env it uses (already set in local.settings.json above):
//   AZURE_STORAGE_CONNECTION_STRING  (falls back to AzureWebJobsStorage if unset)
//   BILLING_BLOB_CONTAINER
//   BILLING_BLOB_NAME

const { BlobServiceClient } = require('@azure/storage-blob');

const CONTAINER = process.env.BILLING_BLOB_CONTAINER || 'container-bmssprod001';
const BLOB_NAME = process.env.BILLING_BLOB_NAME || 'config/billing/bill-through.json';

function endOfPrevMonthISO() {
  const now = new Date();
  const eop = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
  const y = eop.getFullYear();
  const m = String(eop.getMonth() + 1).padStart(2, '0');
  const d = String(eop.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function getBlobClient() {
  const conn =
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    process.env.AzureWebJobsStorage;
  if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING or AzureWebJobsStorage must be set');

  const svc = BlobServiceClient.fromConnectionString(conn);
  const container = svc.getContainerClient(CONTAINER);
  await container.createIfNotExists();
  return container.getBlockBlobClient(BLOB_NAME);
}

function readPrincipal(req) {
  // Azure Static Web Apps / EasyAuth user header (base64 JSON)
  const hdr = req.headers['x-ms-client-principal'] || req.headers['X-MS-CLIENT-PRINCIPAL'];
  if (!hdr || typeof hdr !== 'string') return null;
  try {
    const json = Buffer.from(hdr, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

module.exports = async function (context, req) {
  try {
    const blob = await getBlobClient();

    // ---------- GET ----------
    if (req.method === 'GET') {
      const exists = await blob.exists();
      if (!exists) {
        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            billThroughDate: endOfPrevMonthISO(),
            updatedBy: null,
            updatedTimestamp: null,
            source: 'default'
          }
        };
        return;
      }

      const buffer = await blob.downloadToBuffer();
      let parsed;
      try {
        parsed = JSON.parse(buffer.toString('utf8'));
      } catch {
        parsed = {
          billThroughDate: endOfPrevMonthISO(),
          updatedBy: null,
          updatedTimestamp: null,
          source: 'reset-default'
        };
      }
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: parsed };
      return;
    }

    // ---------- POST ----------
    if (req.method === 'POST') {
      const { billThroughDate } = req.body || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(billThroughDate || '')) {
        context.res = { status: 400, body: 'billThroughDate must be YYYY-MM-DD' };
        return;
      }

      const principal = readPrincipal(req);
      const updatedBy =
        (principal && (principal.userDetails || principal.userId || principal.email)) || null;

      const payload = {
        billThroughDate,
        updatedBy,
        updatedTimestamp: new Date().toISOString()
      };

      const bodyStr = JSON.stringify(payload);
      await blob.upload(bodyStr, Buffer.byteLength(bodyStr), {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });

      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: payload };
      return;
    }

    // ---------- OTHER METHODS ----------
    context.res = { status: 405, body: 'Method not allowed' };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: String(err && err.message ? err.message : err) };
  }
};