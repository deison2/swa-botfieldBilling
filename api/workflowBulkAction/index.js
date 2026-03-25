// api/workflowBulkAction/index.js
// Bulk-advances workflow instances to a target stage using set-based SQL.
const { sql, query } = require('../shared/db');
const { getEmail, isSuperUser, isBillingSuperUser, isBillingTeam } = require('../shared/auth');

const STAGE_COMPLETE_COL = { 1: 'br_completed_at', 2: 'mr_completed_at', 3: 'pr_completed_at', 4: 'or_completed_at', 5: 'posted_at' };

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    if (!email) {
      context.res = { status: 401, body: 'Authentication required' };
      return;
    }

    const { instance_ids, draft_fee_idxs, action_type, target_stage_id, comments } = req.body || {};

    // ── Resolve instance IDs ──
    let resolvedInstanceIds = [];

    if (Array.isArray(instance_ids) && instance_ids.length) {
      resolvedInstanceIds = instance_ids.map(Number);
    } else if (Array.isArray(draft_fee_idxs) && draft_fee_idxs.length) {
      const idxList = draft_fee_idxs.map(Number).join(',');
      const result = await query(
        `SELECT wi.instance_id FROM billing.workflow_instances wi
         JOIN billing.billing_cycles bc ON wi.cycle_id = bc.cycle_id AND bc.is_active = 1
         WHERE wi.draft_fee_idx IN (${idxList})`
      );
      resolvedInstanceIds = result.recordset.map(r => r.instance_id);
    }

    if (!resolvedInstanceIds.length) {
      context.res = { status: 400, body: 'instance_ids or draft_fee_idxs array is required' };
      return;
    }

    const validBulk = ['APPROVED', 'FORCE_APPROVED'];
    if (!validBulk.includes(action_type)) {
      context.res = { status: 400, body: `Bulk action must be one of: ${validBulk.join(', ')}` };
      return;
    }

    const isAdmin = isSuperUser(email) || isBillingSuperUser(email);
    const isBT = isBillingTeam(email);

    if (action_type === 'FORCE_APPROVED' && !isAdmin) {
      context.res = { status: 403, body: 'Only super users can force-approve' };
      return;
    }

    if (!target_stage_id) {
      context.res = { status: 400, body: 'target_stage_id is required' };
      return;
    }

    // ── Fetch target stage order (once) ──
    const targetResult = await query(
      `SELECT stage_id, stage_order FROM billing.workflow_stage_definitions WHERE stage_id = @id`,
      { id: { type: sql.TinyInt, value: target_stage_id } }
    );
    if (!targetResult.recordset.length) {
      context.res = { status: 400, body: 'Invalid target_stage_id' };
      return;
    }
    const targetOrder = targetResult.recordset[0].stage_order;

    // ── Fetch all stages (once) for the advancement loop ──
    const stagesResult = await query(
      `SELECT stage_id, stage_code, stage_order FROM billing.workflow_stage_definitions ORDER BY stage_order ASC`
    );
    const allStages = stagesResult.recordset;

    // ── Fetch all affected instances in one query ──
    const idList = resolvedInstanceIds.join(',');
    const instResult = await query(
      `SELECT wi.instance_id, wi.cycle_id, wi.current_stage_id, wi.current_status,
              wi.billing_reviewer, wi.manager_reviewer, wi.partner_reviewer, wi.originator_reviewer,
              wsd.stage_code, wsd.stage_order
       FROM billing.workflow_instances wi
       JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
       WHERE wi.instance_id IN (${idList})`
    );

    const succeeded = [];
    const failed = [];
    const errors = [];

    // ── Categorize: eligible vs ineligible ──
    const eligible = [];
    const STAGE_REVIEWER_COL = { 1: 'billing_reviewer', 2: 'manager_reviewer', 3: 'partner_reviewer', 4: 'originator_reviewer' };

    for (const inst of instResult.recordset) {
      // Already at or past target
      if (inst.stage_order >= targetOrder) {
        failed.push(inst.instance_id);
        errors.push({ id: inst.instance_id, error: 'Already at or past target stage' });
        continue;
      }

      // Auth check (skip for admins / force)
      if (!isAdmin && action_type !== 'FORCE_APPROVED') {
        const reviewerCol = STAGE_REVIEWER_COL[inst.current_stage_id];
        const assignedReviewer = (inst[reviewerCol] || '').toLowerCase();
        const authorized = assignedReviewer === email ||
          (inst.current_stage_id === 1 && (isBT || isAdmin));
        if (!authorized) {
          failed.push(inst.instance_id);
          errors.push({ id: inst.instance_id, error: 'Not authorized' });
          continue;
        }
      }

      eligible.push(inst);
    }

    // Mark any IDs not found in the DB
    const foundIds = new Set(instResult.recordset.map(r => r.instance_id));
    for (const id of resolvedInstanceIds) {
      if (!foundIds.has(id)) {
        failed.push(id);
        errors.push({ id, error: 'Not found' });
      }
    }

    if (!eligible.length) {
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { succeeded, failed, errors },
      };
      return;
    }

    // ── Build bulk SQL for all eligible instances ──
    // For each eligible instance, we need to:
    //   1) INSERT workflow_action rows for each intermediate stage
    //   2) SET completion timestamps for each intermediate stage
    //   3) UPDATE current_stage_id to target

    const esc = (s) => s ? `N'${s.replace(/'/g, "''")}'` : 'NULL';
    const actionInsertRows = [];
    const updateCases = { br_completed_at: [], mr_completed_at: [], pr_completed_at: [], or_completed_at: [], posted_at: [] };
    const eligibleIds = [];

    for (const inst of eligible) {
      eligibleIds.push(inst.instance_id);

      // Find all stages from current (inclusive) up to target (exclusive)
      const stagesToApprove = allStages.filter(
        s => s.stage_order >= inst.stage_order && s.stage_order < targetOrder
      );

      for (const stage of stagesToApprove) {
        // Action row for each stage approval
        actionInsertRows.push(
          `(${inst.instance_id}, ${inst.cycle_id}, ${stage.stage_id}, 'APPROVED', ${esc(email)}, ${esc(comments || null)})`
        );

        // Completion timestamp for each stage
        const col = STAGE_COMPLETE_COL[stage.stage_id];
        if (col && updateCases[col]) {
          updateCases[col].push(inst.instance_id);
        }
      }

      succeeded.push(inst.instance_id);
    }

    // ── Execute bulk operations ──

    // 1) Bulk INSERT workflow_actions (batches of 500 rows)
    for (let i = 0; i < actionInsertRows.length; i += 500) {
      const batch = actionInsertRows.slice(i, i + 500);
      await query(
        `INSERT INTO billing.workflow_actions (instance_id, cycle_id, stage_id, action_type, action_by, comments)
         VALUES ${batch.join(',\n')}`
      );
    }

    // 2) Bulk UPDATE completion timestamps — one UPDATE per column with all applicable IDs
    for (const [col, ids] of Object.entries(updateCases)) {
      if (!ids.length) continue;
      const idStr = ids.join(',');
      await query(
        `UPDATE billing.workflow_instances
         SET ${col} = GETUTCDATE(), updated_at = GETUTCDATE()
         WHERE instance_id IN (${idStr})`
      );
    }

    // 3) Bulk UPDATE current_stage_id and status for all eligible
    const eligibleIdStr = eligibleIds.join(',');
    // Determine if target is the last stage → COMPLETED, otherwise PENDING
    const isLastStage = !allStages.some(s => s.stage_order > targetOrder);

    if (isLastStage) {
      // Target is the final stage — mark completed and set its completion timestamp
      const finalCol = STAGE_COMPLETE_COL[target_stage_id];
      await query(
        `UPDATE billing.workflow_instances
         SET current_stage_id = @target, current_status = 'COMPLETED',
             ${finalCol ? finalCol + ' = GETUTCDATE(),' : ''} updated_at = GETUTCDATE()
         WHERE instance_id IN (${eligibleIdStr})`,
        { target: { type: sql.TinyInt, value: target_stage_id } }
      );
    } else {
      await query(
        `UPDATE billing.workflow_instances
         SET current_stage_id = @target, current_status = 'PENDING', updated_at = GETUTCDATE()
         WHERE instance_id IN (${eligibleIdStr})`,
        { target: { type: sql.TinyInt, value: target_stage_id } }
      );
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
