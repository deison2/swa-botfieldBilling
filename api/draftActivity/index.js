// api/draftActivity/index.js
// Returns a unified activity feed for a draft: billing.workflow_actions + audit blob summaries
const { sql, query } = require('../shared/db');
const { BlobServiceClient } = require('@azure/storage-blob');

const CONTAINER = 'container-bmssprod001';
const AUDIT_PREFIX = 'htmlData/automatedBilling/drafts/changes/';

module.exports = async function (context, req) {
  try {
    const draftFeeIdx = Number(context.bindingData.draftFeeIdx);
    if (!Number.isFinite(draftFeeIdx)) {
      context.res = { status: 400, body: 'draftFeeIdx is required' };
      return;
    }

    const events = [];

    // ── 1) Workflow actions from SQL ──────────────────────────
    try {
      const result = await query(
        `SELECT wa.action_id, wa.action_type, wa.action_by, wa.comments,
                wa.reassigned_to, wa.action_at,
                wsd.stage_code, wsd.stage_name
         FROM billing.workflow_actions wa
         JOIN billing.workflow_stage_definitions wsd ON wa.stage_id = wsd.stage_id
         JOIN billing.workflow_instances wi ON wa.instance_id = wi.instance_id
         WHERE wi.draft_fee_idx = @feeIdx
         ORDER BY wa.action_at DESC`,
        { feeIdx: { type: sql.Int, value: draftFeeIdx } }
      );

      for (const r of result.recordset) {
        events.push({
          source: 'workflow',
          id: `wa-${r.action_id}`,
          type: r.action_type,
          user: r.action_by,
          timestamp: r.action_at,
          stageCode: r.stage_code,
          stageName: r.stage_name,
          message: r.comments || null,
          reassignedTo: r.reassigned_to || null,
        });
      }
    } catch (sqlErr) {
      context.log.warn('draftActivity: SQL query failed (non-blocking):', sqlErr.message);
    }

    // ── 2) Audit blobs from Blob Storage ─────────────────────
    // Build a timeline of stage transitions so we can infer what stage a draft
    // was in at any point in time (for blobs that don't have stageCode stored).
    const stageTimeline = events
      .filter(e => e.type === 'APPROVED' || e.type === 'FORCE_APPROVED')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    function inferStage(timestamp) {
      if (!timestamp || !stageTimeline.length) return { code: null, name: null };
      const ts = new Date(timestamp).getTime();
      // Walk backwards through approvals to find the last approval before this timestamp
      let lastStage = { code: 'BR', name: 'Billing Team Review' }; // default = first stage
      for (const evt of stageTimeline) {
        if (new Date(evt.timestamp).getTime() <= ts) {
          // After this approval, the draft moved to the NEXT stage
          const NEXT = { BR: { code: 'MR', name: 'Manager Review' },
                         MR: { code: 'PR', name: 'Partner Review' },
                         PR: { code: 'OR', name: 'Originator Review' },
                         OR: { code: 'POST', name: 'Steering Review' } };
          lastStage = NEXT[evt.stageCode] || { code: evt.stageCode, name: evt.stageName };
        } else break;
      }
      return lastStage;
    }

    try {
      const conn =
        process.env.AZURE_STORAGE_CONNECTION_STRING ||
        process.env.AzureWebJobsStorage;

      if (conn) {
        const svc = BlobServiceClient.fromConnectionString(conn);
        const container = svc.getContainerClient(CONTAINER);

        // List all blobs under the audit prefix that contain this draftFeeIdx
        const draftSuffix = `_draft_${draftFeeIdx}.json`;

        for await (const blob of container.listBlobsFlat({ prefix: AUDIT_PREFIX })) {
          if (!blob.name.endsWith(draftSuffix)) continue;

          try {
            const blobClient = container.getBlockBlobClient(blob.name);
            const buffer = await blobClient.downloadToBuffer();
            const doc = JSON.parse(buffer.toString('utf8'));

            // Build a detailed summary of what changed
            const changeParts = [];

            // ── Analysis row changes ──
            const beforeAnalysis = doc.before?.analysisRows || [];
            const afterAnalysis = doc.after?.analysisRows || [];

            const beforeMap = new Map();
            for (const r of beforeAnalysis) {
              const key = r.AllocIdx ?? r.AllocIndex;
              if (key != null) beforeMap.set(Number(key), r);
            }
            const afterMap = new Map();
            for (const r of afterAnalysis) {
              const key = r.AllocIdx ?? r.AllocIndex;
              if (key != null) afterMap.set(Number(key), r);
            }

            const fmtJob = (r) => {
              const title = r.JobTitle || r.jobTitle || r.JOBTITLE || 'Unknown Job';
              const wipType = r.WipType || r.wipType || r.WIPTYPE || r.WIPType || '';
              return wipType ? `${title} (${wipType})` : title;
            };
            const fmt = v => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

            for (const [key, after] of afterMap) {
              const before = beforeMap.get(key);
              const afterAmt = Number(after.BillInClientCur ?? after.BillAmount ?? 0);
              if (before) {
                const beforeAmt = Number(before.BillInClientCur ?? before.BillAmount ?? 0);
                if (beforeAmt !== afterAmt) {
                  changeParts.push(`${fmtJob(after)} bill amount changed from ${fmt(beforeAmt)} → ${fmt(afterAmt)}`);
                }
              } else {
                changeParts.push(`${fmtJob(after)} added (${fmt(afterAmt)})`);
              }
            }
            for (const [key, before] of beforeMap) {
              if (!afterMap.has(key)) {
                changeParts.push(`${fmtJob(before)} removed`);
              }
            }

            // ── Narrative changes (detailed) ──
            const narrChanges = Array.isArray(doc.narratives) ? doc.narratives : [];
            const truncate = (s, max = 60) => s && s.length > max ? s.slice(0, max) + '...' : s;

            for (const n of narrChanges) {
              if (n.type === 'added') {
                changeParts.push(`Narrative added: "${truncate(n.narrativeAfter)}"`);
              } else if (n.type === 'modified') {
                changeParts.push(`Narrative changed: "${truncate(n.narrativeBefore)}" → "${truncate(n.narrativeAfter)}"`);
              } else if (n.type === 'removed') {
                changeParts.push(`Narrative removed: "${truncate(n.narrativeBefore)}"`);
              }
            }

            // If no narratives array with text (old blobs), fall back to comparing before/after narrative rows
            if (narrChanges.length === 0) {
              const beforeNarr = doc.before?.narrativeRows || [];
              const afterNarr = doc.after?.narrativeRows || [];
              if (beforeNarr.length !== afterNarr.length) {
                const diff = afterNarr.length - beforeNarr.length;
                if (diff > 0) changeParts.push(`${diff} narrative(s) added`);
                else changeParts.push(`${Math.abs(diff)} narrative(s) removed`);
              }
            }

            const changeSummary = changeParts.length ? changeParts.join('\n') : (doc.reason || 'Draft edited');

            // Determine stage: prefer stored stageCode, fall back to inference
            let evtStageCode = doc.stageCode || null;
            let evtStageName = doc.stageName || null;
            if (!evtStageCode) {
              const inferred = inferStage(doc.whenUtc || blob.properties?.lastModified?.toISOString());
              evtStageCode = inferred.code;
              evtStageName = inferred.name;
            }

            events.push({
              source: 'audit',
              id: `audit-${blob.name}`,
              type: 'DRAFT_CHANGE',
              user: doc.user || 'unknown',
              timestamp: doc.whenUtc || blob.properties?.lastModified?.toISOString(),
              stageCode: evtStageCode,
              stageName: evtStageName,
              message: changeSummary,
              reason: doc.reason || null,
              billingNotes: doc.billingNotes || null,
              blobName: blob.name,
            });
          } catch (parseErr) {
            context.log.warn('draftActivity: Failed to parse audit blob:', blob.name, parseErr.message);
          }
        }
      }
    } catch (blobErr) {
      context.log.warn('draftActivity: Blob scan failed (non-blocking):', blobErr.message);
    }

    // Sort all events by timestamp descending
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: events,
    };
  } catch (err) {
    context.log.error('draftActivity error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
