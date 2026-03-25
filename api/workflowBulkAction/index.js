// api/workflowBulkAction/index.js
const { sql, query } = require('../shared/db');
const { getEmail, isSuperUser, isBillingSuperUser } = require('../shared/auth');

const STAGE_COMPLETE_COL = { 1: 'br_completed_at', 2: 'mr_completed_at', 3: 'pr_completed_at', 4: 'or_completed_at', 5: 'posted_at' };
const STAGE_REVIEWER_COL = { 1: 'billing_reviewer', 2: 'manager_reviewer', 3: 'partner_reviewer', 4: 'originator_reviewer' };

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    if (!email) {
      context.res = { status: 401, body: 'Authentication required' };
      return;
    }

    const { instance_ids, action_type, comments, force } = req.body || {};

    if (!Array.isArray(instance_ids) || !instance_ids.length) {
      context.res = { status: 400, body: 'instance_ids array is required' };
      return;
    }

    const validBulk = ['APPROVED', 'FORCE_APPROVED'];
    if (!validBulk.includes(action_type)) {
      context.res = { status: 400, body: `Bulk action must be one of: ${validBulk.join(', ')}` };
      return;
    }

    if (action_type === 'FORCE_APPROVED' && !isBillingSuperUser(email)) {
      context.res = { status: 403, body: 'Only billing super users can force-approve' };
      return;
    }

    const succeeded = [];
    const failed = [];
    const errors = [];

    for (const instId of instance_ids) {
      try {
        const instResult = await query(
          `SELECT wi.*, wsd.stage_code, wsd.stage_order
           FROM billing.workflow_instances wi
           JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
           WHERE wi.instance_id = @id`,
          { id: { type: sql.Int, value: Number(instId) } }
        );

        if (!instResult.recordset.length) {
          failed.push(instId);
          errors.push({ id: instId, error: 'Not found' });
          continue;
        }

        const inst = instResult.recordset[0];

        // Auth check per instance
        if (!isSuperUser(email) && action_type !== 'FORCE_APPROVED') {
          const reviewerCol = STAGE_REVIEWER_COL[inst.current_stage_id];
          const assignedReviewer = (inst[reviewerCol] || '').toLowerCase();
          if (assignedReviewer !== email) {
            failed.push(instId);
            errors.push({ id: instId, error: 'Not authorized' });
            continue;
          }
        }

        // Record the action
        await query(
          `INSERT INTO billing.workflow_actions (instance_id, cycle_id, stage_id, action_type, action_by, comments)
           VALUES (@instId, @cycleId, @stageId, @action, @by, @comments)`,
          {
            instId: { type: sql.Int, value: Number(instId) },
            cycleId: { type: sql.Int, value: inst.cycle_id },
            stageId: { type: sql.TinyInt, value: inst.current_stage_id },
            action: action_type,
            by: email,
            comments: comments || null,
          }
        );

        // Advance stage
        await advanceStage(Number(instId), inst, email);
        succeeded.push(instId);
      } catch (innerErr) {
        failed.push(instId);
        errors.push({ id: instId, error: innerErr.message });
      }
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { succeeded, failed, errors },
    };
  } catch (err) {
    context.log.error('workflowBulkAction error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};

async function advanceStage(instanceId, inst, approverEmail) {
  const currentStageId = inst.current_stage_id;
  const completionCol = STAGE_COMPLETE_COL[currentStageId];

  if (completionCol) {
    await query(
      `UPDATE billing.workflow_instances SET ${completionCol} = GETUTCDATE(), updated_at = GETUTCDATE()
       WHERE instance_id = @id`,
      { id: { type: sql.Int, value: instanceId } }
    );
  }

  const nextStage = await query(
    `SELECT TOP 1 stage_id, stage_order FROM billing.workflow_stage_definitions
     WHERE stage_order > @order ORDER BY stage_order ASC`,
    { order: { type: sql.TinyInt, value: inst.stage_order } }
  );

  if (!nextStage.recordset.length) {
    await query(
      `UPDATE billing.workflow_instances SET current_status = 'COMPLETED', updated_at = GETUTCDATE()
       WHERE instance_id = @id`,
      { id: { type: sql.Int, value: instanceId } }
    );
    return;
  }

  const nextStageId = nextStage.recordset[0].stage_id;

  // Advance to next stage (always exactly one step)
  await query(
    `UPDATE billing.workflow_instances SET current_stage_id = @nextStage, current_status = 'PENDING', updated_at = GETUTCDATE()
     WHERE instance_id = @id`,
    { id: { type: sql.Int, value: instanceId }, nextStage: { type: sql.TinyInt, value: nextStageId } }
  );
}
