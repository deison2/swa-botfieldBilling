// api/workflowInstances/index.js
const { sql, query } = require('../shared/db');
const { getEmail, isSuperUser } = require('../shared/auth');

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    const instanceId = context.bindingData.instanceId
      ? Number(context.bindingData.instanceId)
      : null;

    // ---------- Single instance ----------
    if (instanceId) {
      const result = await query(
        `SELECT wi.*, wsd.stage_code, wsd.stage_name
         FROM billing.workflow_instances wi
         JOIN billing.draft_invoices di ON wi.draft_id = di.draft_id
         JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
         WHERE wi.instance_id = @id`,
        { id: { type: sql.Int, value: instanceId } }
      );

      if (!result.recordset.length) {
        context.res = { status: 404, body: 'Instance not found' };
        return;
      }

      const row = result.recordset[0];

      // Access check: must be assigned reviewer or super user
      if (email && !isSuperUser(email)) {
        const reviewers = [
          row.billing_reviewer, row.manager_reviewer,
          row.partner_reviewer, row.originator_reviewer,
        ].map(r => (r || '').toLowerCase());
        if (!reviewers.includes(email)) {
          context.res = { status: 403, body: 'Not authorized for this instance' };
          return;
        }
      }

      // Fetch action history
      const actions = await query(
        `SELECT wa.*, wsd.stage_code, wsd.stage_name
         FROM billing.workflow_actions wa
         JOIN billing.workflow_stage_definitions wsd ON wa.stage_id = wsd.stage_id
         WHERE wa.instance_id = @id
         ORDER BY wa.action_at DESC`,
        { id: { type: sql.Int, value: instanceId } }
      );

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { ...row, actions: actions.recordset },
      };
      return;
    }

    // ---------- List ----------
    const conditions = [];
    const params = {};

    if (req.query.cycleId) {
      conditions.push('wi.cycle_id = @cycleId');
      params.cycleId = { type: sql.Int, value: Number(req.query.cycleId) };
    }
    if (req.query.stage) {
      conditions.push('wsd.stage_code = @stage');
      params.stage = req.query.stage;
    }
    if (req.query.status) {
      conditions.push('wi.current_status = @status');
      params.status = req.query.status;
    }
    if (req.query.draftFeeIdx) {
      conditions.push('wi.draft_fee_idx = @draftFeeIdx');
      params.draftFeeIdx = { type: sql.Int, value: Number(req.query.draftFeeIdx) };
    }

    // Role-filter for non-super users
    if (email && !isSuperUser(email)) {
      conditions.push(
        `(wi.billing_reviewer = @email OR wi.manager_reviewer = @email
          OR wi.partner_reviewer = @email OR wi.originator_reviewer = @email)`
      );
      params.email = email;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(
      `SELECT wi.*, di.draft_fee_idx, di.client_code, di.client_name,
              wsd.stage_code, wsd.stage_name
       FROM billing.workflow_instances wi
       JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
       ${where}
       ORDER BY wi.updated_at DESC`,
      params
    );

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result.recordset,
    };
  } catch (err) {
    context.log.error('workflowInstances error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
