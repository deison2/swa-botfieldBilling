// api/workflowEnsure/index.js
// POST /api/workflowEnsure
// Returns the workflow instance for a draft, creating one if it doesn't exist.
// Body: { draftFeeIdx, contIndex?, clientCode?, clientName?, clientOffice?,
//         wipAmount?, billedAmount?, writeOffUp?, draftHyperlink?,
//         managerEmail?, partnerEmail?, originatorEmail? }
const { sql, query } = require('../shared/db');
const { getEmail, BILLING_SUPER_USERS } = require('../shared/auth');

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    const {
      draftFeeIdx, contIndex, clientCode, clientName, clientOffice,
      wipAmount, billedAmount, writeOffUp, draftHyperlink,
      managerEmail, partnerEmail, originatorEmail,
    } = req.body || {};

    if (!draftFeeIdx) {
      context.res = { status: 400, body: 'draftFeeIdx is required' };
      return;
    }

    const feeIdx = Number(draftFeeIdx);

    // 1) Check if an instance already exists for this draft in the active cycle
    const existing = await query(
      `SELECT wi.*, wsd.stage_code, wsd.stage_name
       FROM billing.workflow_instances wi
       JOIN billing.billing_cycles bc ON wi.cycle_id = bc.cycle_id
       JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
       WHERE wi.draft_fee_idx = @feeIdx AND bc.is_active = 1`,
      { feeIdx: { type: sql.Int, value: feeIdx } }
    );

    if (existing.recordset.length) {
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: existing.recordset[0],
      };
      return;
    }

    // 2) No instance — get the active cycle
    const cycleResult = await query(
      'SELECT cycle_id FROM billing.billing_cycles WHERE is_active = 1'
    );

    if (!cycleResult.recordset.length) {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      await query(
        `INSERT INTO billing.billing_cycles (period_month, period_year, is_active)
         VALUES (@month, @year, 1)`,
        {
          month: { type: sql.TinyInt, value: month },
          year: { type: sql.SmallInt, value: year },
        }
      );
    }

    const cycle = await query(
      'SELECT cycle_id FROM billing.billing_cycles WHERE is_active = 1'
    );
    const cycleId = cycle.recordset[0].cycle_id;

    // 3) Ensure draft_invoices row exists (race-safe: ignore duplicate key)
    await query(
      `IF NOT EXISTS (SELECT 1 FROM billing.draft_invoices WHERE cycle_id = @cycleId AND draft_fee_idx = @feeIdx)
       INSERT INTO billing.draft_invoices (cycle_id, draft_fee_idx, cont_index, client_code, client_name, client_office, wip_amount, billed_amount, write_off_up, draft_hyperlink)
       VALUES (@cycleId, @feeIdx, @contIndex, @code, @name, @office, @wip, @billed, @woff, @link);`,
      {
        cycleId: { type: sql.Int, value: cycleId },
        feeIdx: { type: sql.Int, value: feeIdx },
        contIndex: { type: sql.Int, value: Number(contIndex) || 0 },
        code: clientCode || '',
        name: clientName || '',
        office: clientOffice || '',
        wip: { type: sql.Decimal(18, 2), value: Number(wipAmount) || 0 },
        billed: { type: sql.Decimal(18, 2), value: Number(billedAmount) || 0 },
        woff: { type: sql.Decimal(18, 2), value: Number(writeOffUp) || 0 },
        link: draftHyperlink || null,
      }
    ).catch(() => {
      // Swallow duplicate key — row already exists, which is fine
    });

    // 4) Create workflow_instance
    const defaultBillingReviewer = BILLING_SUPER_USERS[0] || email || null;
    const manager = (managerEmail || '').toLowerCase().trim() || null;
    const partner = (partnerEmail || '').toLowerCase().trim() || null;
    const originator = (originatorEmail || '').toLowerCase().trim() || null;

    await query(
      `IF NOT EXISTS (SELECT 1 FROM billing.workflow_instances WHERE draft_fee_idx = @feeIdx AND cycle_id = @cycleId)
       INSERT INTO billing.workflow_instances
         (draft_fee_idx, cycle_id, billing_reviewer, manager_reviewer, partner_reviewer, originator_reviewer, current_stage_id, current_status)
       VALUES
         (@feeIdx, @cycleId, @billing, @manager, @partner, @originator, 1, 'PENDING')`,
      {
        feeIdx: { type: sql.Int, value: feeIdx },
        cycleId: { type: sql.Int, value: cycleId },
        billing: defaultBillingReviewer,
        manager,
        partner,
        originator,
      }
    );

    // 5) Return the new instance
    const created = await query(
      `SELECT wi.*, wsd.stage_code, wsd.stage_name
       FROM billing.workflow_instances wi
       JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
       WHERE wi.draft_fee_idx = @feeIdx AND wi.cycle_id = @cycleId`,
      {
        feeIdx: { type: sql.Int, value: feeIdx },
        cycleId: { type: sql.Int, value: cycleId },
      }
    );

    context.res = {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: created.recordset[0] || null,
    };
  } catch (err) {
    context.log.error('workflowEnsure error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
