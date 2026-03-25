// api/draftEditAudit/index.js
// POST /api/draftEditAudit
//
// Writes an audit record of draft edits to Blob Storage:
// htmlData/automatedBilling/drafts/billed/<billThroughDate>/<user>_<UTC>_draft_<draftIdx>.json

const { BlobServiceClient } = require('@azure/storage-blob');
const { sql: mssql, query: sqlQuery } = require('../shared/db');

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

    // Also write a COMMENT action to billing.workflow_actions (non-blocking)
    try {
      const wiResult = await sqlQuery(
        `SELECT wi.instance_id, wi.cycle_id, wi.current_stage_id,
                wsd.stage_code, wsd.stage_name
         FROM billing.workflow_instances wi
         JOIN billing.billing_cycles bc ON wi.cycle_id = bc.cycle_id
         JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
         WHERE wi.draft_fee_idx = @feeIdx AND bc.is_active = 1`,
        { feeIdx: { type: mssql.Int, value: Number(draftIdx) } }
      );

      if (wiResult.recordset.length) {
        const wi = wiResult.recordset[0];

        // Update the blob with stage info so draftActivity can read it later
        try {
          doc.stageCode = wi.stage_code || null;
          doc.stageName = wi.stage_name || null;
          const updatedText = JSON.stringify(doc, null, 2);
          await blob.upload(updatedText, Buffer.byteLength(updatedText), {
            blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' },
          });
        } catch (_) { /* best-effort */ }

        await sqlQuery(
          `INSERT INTO billing.workflow_actions (instance_id, cycle_id, stage_id, action_type, action_by, comments)
           VALUES (@instId, @cycleId, @stageId, 'COMMENT', @by, @comments)`,
          {
            instId: { type: mssql.Int, value: wi.instance_id },
            cycleId: { type: mssql.Int, value: wi.cycle_id },
            stageId: { type: mssql.TinyInt, value: wi.current_stage_id },
            by: user || 'unknown',
            comments: `Draft edit audit: ${reason || 'edit'}`,
          }
        );
        log('Wrote billing.workflow_actions COMMENT for instance', wi.instance_id);
      }
    } catch (sqlErr) {
      // Non-blocking: blob audit already succeeded
      log('WARN: billing.workflow_actions write failed (non-blocking):', sqlErr.message);
    }

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