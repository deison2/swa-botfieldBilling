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
const { sql, query: sqlQuery } = require('../shared/db');

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
      // Try SQL billing.billing_cycles first — if an active cycle exists, use it
      try {
        const cycleResult = await sqlQuery(
          `SELECT cycle_id, cycle_name, period_month, period_year, cycle_start,
                  br_due, mr_due, pr_due, or_due, post_due
           FROM billing.billing_cycles WHERE is_active = 1`
        );
        if (cycleResult.recordset.length) {
          const c = cycleResult.recordset[0];
          // Derive billThroughDate from cycle: last day of the cycle's period month/year
          const lastDay = new Date(c.period_year, c.period_month, 0);
          const billThroughDate = lastDay.toISOString().slice(0, 10);
          context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: {
              billThroughDate,
              updatedBy: null,
              updatedTimestamp: c.cycle_start,
              source: 'billing_cycle',
              cycle_id: c.cycle_id,
              cycle_name: c.cycle_name,
            }
          };
          return;
        }
      } catch (sqlErr) {
        // SQL unavailable — fall through to blob storage
        context.log.warn('billingDate: SQL fallback failed (non-blocking):', sqlErr.message);
      }

      // Fall back to blob storage
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
      if (!parsed.source) parsed.source = 'blob';
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