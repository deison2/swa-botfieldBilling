// api/workflowAction/index.js
const { sql, query } = require('../shared/db');
const { getEmail, isSuperUser, isBillingSuperUser, isBillingTeam } = require('../shared/auth');

const VALID_ACTIONS = ['APPROVED', 'REJECTED', 'COMMENT', 'REASSIGNED', 'ON_HOLD', 'RELEASED', 'FORCE_APPROVED', 'VIEWED'];

// Map stage_id → completion timestamp column
const STAGE_COMPLETE_COL = { 1: 'br_completed_at', 2: 'mr_completed_at', 3: 'pr_completed_at', 4: 'or_completed_at', 5: 'posted_at' };

// Map stage_id → reviewer column
const STAGE_REVIEWER_COL = { 1: 'billing_reviewer', 2: 'manager_reviewer', 3: 'partner_reviewer', 4: 'originator_reviewer' };

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    if (!email) {
      context.res = { status: 401, body: 'Authentication required' };
      return;
    }

    const instanceId = Number(context.bindingData.instanceId);
    const { action_type, comments, reassigned_to } = req.body || {};

    if (!VALID_ACTIONS.includes(action_type)) {
      context.res = { status: 400, body: `Invalid action_type. Must be one of: ${VALID_ACTIONS.join(', ')}` };
      return;
    }

    // FORCE_APPROVED restricted to billing super users
    if (action_type === 'FORCE_APPROVED' && !isBillingSuperUser(email)) {
      context.res = { status: 403, body: 'Only billing super users can force-approve' };
      return;
    }

    // Fetch instance
    const instResult = await query(
      `SELECT wi.*, wsd.stage_code, wsd.stage_order
       FROM billing.workflow_instances wi
       JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
       WHERE wi.instance_id = @id`,
      { id: { type: sql.Int, value: instanceId } }
    );

    if (!instResult.recordset.length) {
      context.res = { status: 404, body: 'Instance not found' };
      return;
    }

    const inst = instResult.recordset[0];

    // Auth: must be assigned reviewer for current stage (or super user)
    if (!isSuperUser(email)) {
      // BR (stage 1) and POST (stage 5) are handled by billing team
      if (inst.current_stage_id === 1 || inst.current_stage_id === 5) {
        if (!isBillingTeam(email) && !isBillingSuperUser(email)) {
          context.res = { status: 403, body: 'Not authorized to act on this stage' };
          return;
        }
      } else {
        const reviewerCol = STAGE_REVIEWER_COL[inst.current_stage_id];
        const assignedReviewer = (inst[reviewerCol] || '').toLowerCase();
        if (assignedReviewer !== email) {
          context.res = { status: 403, body: 'Not authorized to act on this stage' };
          return;
        }
      }
    }

    // VIEWED is a read event — don't record in workflow_actions, but track last-viewed time
    if (action_type === 'VIEWED') {
      // Upsert last_viewed_at for this user + draft
      const draftResult = await query(
        `SELECT draft_fee_idx FROM billing.workflow_instances WHERE instance_id = @id`,
        { id: { type: sql.Int, value: instanceId } }
      );
      if (draftResult.recordset.length) {
        const draftFeeIdx = draftResult.recordset[0].draft_fee_idx;
        await query(
          `MERGE billing.draft_views AS tgt
           USING (SELECT @feeIdx AS draft_fee_idx, @email AS user_email) AS src
           ON tgt.draft_fee_idx = src.draft_fee_idx AND tgt.user_email = src.user_email
           WHEN MATCHED THEN UPDATE SET last_viewed_at = SYSUTCDATETIME()
           WHEN NOT MATCHED THEN INSERT (draft_fee_idx, user_email, last_viewed_at)
             VALUES (src.draft_fee_idx, src.user_email, SYSUTCDATETIME());`,
          {
            feeIdx: { type: sql.Int, value: draftFeeIdx },
            email: { type: sql.VarChar, value: email },
          }
        );
      }

      const updated = await query(
        `SELECT wi.*, wsd.stage_code, wsd.stage_name
         FROM billing.workflow_instances wi
         JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
         WHERE wi.instance_id = @id`,
        { id: { type: sql.Int, value: instanceId } }
      );
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: updated.recordset[0],
      };
      return;
    }

    // Map FORCE_APPROVED → APPROVED with a note in comments
    const dbActionType = action_type === 'FORCE_APPROVED' ? 'APPROVED' : action_type;
    const dbComments = action_type === 'FORCE_APPROVED'
      ? `[Force-approved] ${comments || ''}`.trim()
      : (comments || null);

    // Record the action
    await query(
      `INSERT INTO billing.workflow_actions (instance_id, cycle_id, stage_id, action_type, action_by, comments, reassigned_to)
       VALUES (@instId, @cycleId, @stageId, @action, @by, @comments, @reassign)`,
      {
        instId: { type: sql.Int, value: instanceId },
        cycleId: { type: sql.Int, value: inst.cycle_id },
        stageId: { type: sql.TinyInt, value: inst.current_stage_id },
        action: dbActionType,
        by: email,
        comments: dbComments,
        reassign: reassigned_to || null,
      }
    );

    // Process action effects
    if (action_type === 'APPROVED' || action_type === 'FORCE_APPROVED') {
      await advanceStage(instanceId, inst, email);
    } else if (action_type === 'REJECTED') {
      await query(
        `UPDATE billing.workflow_instances SET current_status = 'REJECTED', updated_at = GETUTCDATE()
         WHERE instance_id = @id`,
        { id: { type: sql.Int, value: instanceId } }
      );
    } else if (action_type === 'REASSIGNED') {
      if (!reassigned_to) {
        context.res = { status: 400, body: 'reassigned_to is required for REASSIGNED action' };
        return;
      }
      const col = STAGE_REVIEWER_COL[inst.current_stage_id];
      if (col) {
        await query(
          `UPDATE billing.workflow_instances SET ${col} = @to, updated_at = GETUTCDATE()
           WHERE instance_id = @id`,
          { id: { type: sql.Int, value: instanceId }, to: reassigned_to.toLowerCase().trim() }
        );
      }
    } else if (action_type === 'ON_HOLD') {
      await query(
        `UPDATE billing.workflow_instances SET current_status = 'ON_HOLD', updated_at = GETUTCDATE()
         WHERE instance_id = @id`,
        { id: { type: sql.Int, value: instanceId } }
      );
    } else if (action_type === 'RELEASED') {
      await query(
        `UPDATE billing.workflow_instances SET current_status = 'PENDING', updated_at = GETUTCDATE()
         WHERE instance_id = @id`,
        { id: { type: sql.Int, value: instanceId } }
      );
    }
    // COMMENT: no status change, action already recorded above

    // Return updated instance
    const updated = await query(
      `SELECT wi.*, wsd.stage_code, wsd.stage_name
       FROM billing.workflow_instances wi
       JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
       WHERE wi.instance_id = @id`,
      { id: { type: sql.Int, value: instanceId } }
    );

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: updated.recordset[0],
    };
  } catch (err) {
    context.log.error('workflowAction error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};

async function advanceStage(instanceId, inst, approverEmail) {
  const currentStageId = inst.current_stage_id;
  const completionCol = STAGE_COMPLETE_COL[currentStageId];

  // Mark current stage completed
  if (completionCol) {
    await query(
      `UPDATE billing.workflow_instances SET ${completionCol} = GETUTCDATE(), updated_at = GETUTCDATE()
       WHERE instance_id = @id`,
      { id: { type: sql.Int, value: instanceId } }
    );
  }

  // Find next stage
  const nextStage = await query(
    `SELECT TOP 1 stage_id, stage_order FROM billing.workflow_stage_definitions
     WHERE stage_order > @order ORDER BY stage_order ASC`,
    { order: { type: sql.TinyInt, value: inst.stage_order } }
  );

  if (!nextStage.recordset.length) {
    // No more stages — mark as COMPLETED
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
