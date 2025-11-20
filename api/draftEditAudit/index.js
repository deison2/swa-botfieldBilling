// api/draftEditAudit/index.js
// POST /api/draftEditAudit
//
// Writes an audit record of draft edits to Blob Storage:
// htmlData/automatedBilling/drafts/billed/<billThroughDate>/<user>_<UTC>_draft_<draftIdx>.json

const { BlobServiceClient } = require('@azure/storage-blob');

const CONTAINER = 'container-bmssprod001';
const AUDIT_PREFIX = 'htmlData/automatedBilling/drafts/changes/';

const STORAGE_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;

const blobServiceClient = BlobServiceClient.fromConnectionString(STORAGE_CONN);

function safeDateKey(raw) {
  const s = String(raw || '').slice(0, 10);
  // expect YYYY-MM-DD
  return s || 'unknown-date';
}

function safeUserKey(raw) {
  return String(raw || 'unknown-user')
    .toLowerCase()
    .replace(/[^0-9a-z@._-]/gi, '-');
}

function safeTimestamp(raw) {
  const iso = raw || new Date().toISOString();
  // remove chars not allowed in blob path segments
  return iso.replace(/[:.]/g, '-');
}

module.exports = async function (context, req) {
  const log = (...args) => context.log('draftEditAudit:', ...args);

  if (!STORAGE_CONN) {
    context.res = {
      status: 500,
      body: 'AZURE_STORAGE_CONNECTION_STRING not configured',
    };
    return;
  }

  let body = req.body;
  if (!body) {
    context.res = {
      status: 400,
      body: 'Missing JSON body',
    };
    return;
  }

  // If body came in as text, try to parse
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      context.res = {
        status: 400,
        body: 'Invalid JSON body',
      };
      return;
    }
  }

  const {
    version = 1,
    draftIdx,
    clientCode,
    clientName,
    billThroughDate,
    user,
    when,
    reason,
    billingNotes,
    totals,
    narratives,           // 👈 NEW: summary array from client
    before,
    after,
  } = body;

  if (!draftIdx || !billThroughDate || !user) {
    context.res = {
      status: 400,
      body:
        'draftIdx, billThroughDate, and user are required in the audit payload.',
    };
    return;
  }

  const dateKey = safeDateKey(billThroughDate);
  const userKey = safeUserKey(user);
  const tsKey = safeTimestamp(when);

  const blobName = `${AUDIT_PREFIX}${dateKey}/${userKey}_${tsKey}_draft_${draftIdx}.json`;

  const container = blobServiceClient.getContainerClient(CONTAINER);
  const blob = container.getBlockBlobClient(blobName);

  const doc = {
    version,
    draftIdx,
    clientCode,
    clientName,
    billThroughDate: dateKey,
    user,
    whenUtc: when || new Date().toISOString(),
    reason: reason || null,
    billingNotes: billingNotes || null,
    totals: totals || null,
    narratives: Array.isArray(narratives) ? narratives : [], // 👈 NEW: persist summary
    before: before || { analysisRows: [], narrativeRows: [] },
    after: after || { analysisRows: [], narrativeRows: [] },
  };

  const text = JSON.stringify(doc, null, 2);

  try {
    await blob.upload(text, Buffer.byteLength(text), {
      blobHTTPHeaders: {
        blobContentType: 'application/json; charset=utf-8',
      },
    });

    log('Saved draft edit audit', { blobName });

    context.res = {
      status: 204,
    };
  } catch (err) {
    log('ERROR writing audit blob', err?.message || err);
    context.res = {
      status: 500,
      body: `draftEditAudit failed: ${err.message || String(err)}`,
    };
  }
};