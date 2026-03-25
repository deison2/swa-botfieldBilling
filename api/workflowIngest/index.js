// api/workflowIngest/index.js
const { sql, query } = require('../shared/db');
const { requireBillingSuperUser, BILLING_SUPER_USERS } = require('../shared/auth');

const DRAFT_ANALYSIS_URL =
  "https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/draftAnalysis?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug";

module.exports = async function (context, req) {
  try {
    const email = requireBillingSuperUser(context, req);
    if (!email) return;

    const { cycle_id, billThroughDate } = req.body || {};
    if (!cycle_id || !billThroughDate) {
      context.res = { status: 400, body: 'cycle_id and billThroughDate are required' };
      return;
    }

    // Verify cycle exists
    const cycleCheck = await query(
      'SELECT cycle_id FROM billing.billing_cycles WHERE cycle_id = @id',
      { id: { type: sql.Int, value: cycle_id } }
    );
    if (!cycleCheck.recordset.length) {
      context.res = { status: 404, body: 'Billing cycle not found' };
      return;
    }

    // Fetch drafts from PE via Logic App
    const peRes = await fetch(DRAFT_ANALYSIS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billThroughDate }),
    });

    if (!peRes.ok) {
      context.res = { status: 502, body: `PE Logic App error: ${peRes.status} ${peRes.statusText}` };
      return;
    }

    const drafts = await peRes.json();
    if (!Array.isArray(drafts) || !drafts.length) {
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { created: 0, updated: 0, skipped: 0, total: 0 },
      };
      return;
    }

    let created = 0, updated = 0, skipped = 0;
    const defaultBillingReviewer = BILLING_SUPER_USERS[0];

    for (const d of drafts) {
      const draftFeeIdx = Number(d.DRAFTFEEIDX);
      if (!Number.isFinite(draftFeeIdx)) { skipped++; continue; }

      // MERGE billing.draft_invoices
      const diResult = await query(
        `MERGE billing.draft_invoices AS tgt
         USING (SELECT @cycleId AS cycle_id, @feeIdx AS draft_fee_idx) AS src
           ON tgt.cycle_id = src.cycle_id AND tgt.draft_fee_idx = src.draft_fee_idx
         WHEN MATCHED THEN
           UPDATE SET raw_payload = @payload,
                      client_code = @code,
                      client_name = @name
         WHEN NOT MATCHED THEN
           INSERT (cycle_id, draft_fee_idx, client_code, client_name, raw_payload)
           VALUES (@cycleId, @feeIdx, @code, @name, @payload)
         OUTPUT $action;`,
        {
          cycleId: { type: sql.Int, value: cycle_id },
          feeIdx: { type: sql.Int, value: draftFeeIdx },
          code: d.CLIENTCODE || null,
          name: d.CLIENTNAME || null,
          payload: JSON.stringify(d),
        }
      );

      const action = diResult.recordset[0]?.$action;

      if (action === 'INSERT') created++;
      else if (action === 'UPDATE') updated++;

      // Seed workflow_instance (only on new drafts)
      if (action === 'INSERT') {
        const managerEmail = (d.CMEmail || '').toLowerCase().trim() || null;
        const partnerEmail = (d.CPEmail || '').toLowerCase().trim() || null;
        const originatorEmail = (d.COEmail || '').toLowerCase().trim() || null;

        await query(
          `IF NOT EXISTS (SELECT 1 FROM billing.workflow_instances WHERE draft_fee_idx = @feeIdx AND cycle_id = @cycleId)
           INSERT INTO billing.workflow_instances
             (draft_fee_idx, cycle_id, billing_reviewer, manager_reviewer, partner_reviewer, originator_reviewer, current_stage_id, current_status)
           VALUES
             (@feeIdx, @cycleId, @billing, @manager, @partner, @originator, 1, 'PENDING')`,
          {
            feeIdx: { type: sql.Int, value: draftFeeIdx },
            cycleId: { type: sql.Int, value: cycle_id },
            billing: defaultBillingReviewer,
            manager: managerEmail,
            partner: partnerEmail,
            originator: originatorEmail,
          }
        );
      }
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { created, updated, skipped, total: drafts.length },
    };
  } catch (err) {
    context.log.error('workflowIngest error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
