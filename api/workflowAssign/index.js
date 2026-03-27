// api/workflowAssign/index.js
// POST /api/workflowAssign         — create a new assignment
// PUT  /api/workflowAssign/:id     — assignee responds (REVIEWED / DECLINED)
const { sql, query } = require('../shared/db');
const { getEmail, isBillingSuperUser, isBillingTeam } = require('../shared/auth');

// Map stage_id → reviewer column
const STAGE_REVIEWER_COL = { 1: 'billing_reviewer', 2: 'manager_reviewer', 3: 'partner_reviewer', 4: 'originator_reviewer' };

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    if (!email) {
      context.res = { status: 401, body: 'Authentication required' };
      return;
    }

    const assignmentId = context.bindingData.assignmentId
      ? Number(context.bindingData.assignmentId)
      : null;

    // ── PUT: assignee responds ──────────────────────────────────
    if (req.method === 'PUT') {
      if (!assignmentId) {
        context.res = { status: 400, body: 'Assignment ID required' };
        return;
      }

      const { status: newStatus, comments } = req.body || {};
      if (!['REVIEWED', 'DECLINED'].includes(newStatus)) {
        context.res = { status: 400, body: 'status must be REVIEWED or DECLINED' };
        return;
      }

      // Fetch the assignment
      const asgResult = await query(
        `SELECT * FROM billing.draft_assignments WHERE id = @id`,
        { id: { type: sql.Int, value: assignmentId } }
      );
      if (!asgResult.recordset.length) {
        context.res = { status: 404, body: 'Assignment not found' };
        return;
      }

      const asg = asgResult.recordset[0];

      // Only the assigned user (or billing super) can respond
      if (asg.assigned_to.toLowerCase() !== email && !isBillingSuperUser(email)) {
        context.res = { status: 403, body: 'Not authorized to respond to this assignment' };
        return;
      }

      if (asg.status !== 'PENDING') {
        context.res = { status: 400, body: `Assignment already ${asg.status.toLowerCase()}` };
        return;
      }

      // Update the assignment
      await query(
        `UPDATE billing.draft_assignments
         SET status = @status, completed_at = GETUTCDATE(), comments = @comments
         WHERE id = @id`,
        {
          id: { type: sql.Int, value: assignmentId },
          status: newStatus,
          comments: comments || null,
        }
      );

      // Record a workflow action so it shows in the activity feed
      const instResult = await query(
        `SELECT wi.*, wsd.stage_code, wsd.stage_name
         FROM billing.workflow_instances wi
         JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
         WHERE wi.instance_id = @id`,
        { id: { type: sql.Int, value: asg.instance_id } }
      );
      const inst = instResult.recordset[0];

      if (inst) {
        const actionComment = newStatus === 'REVIEWED'
          ? `Completed assigned review${comments ? ': ' + comments : ''}`
          : `Declined assigned review${comments ? ': ' + comments : ''}`;

        // Record action and create mention for the person who assigned
        const insertResult = await query(
          `INSERT INTO billing.workflow_actions (instance_id, cycle_id, stage_id, action_type, action_by, comments)
           OUTPUT INSERTED.action_id
           VALUES (@instId, @cycleId, @stageId, 'COMMENT', @by, @comments)`,
          {
            instId: { type: sql.Int, value: asg.instance_id },
            cycleId: { type: sql.Int, value: inst.cycle_id },
            stageId: { type: sql.TinyInt, value: inst.current_stage_id },
            by: email,
            comments: actionComment,
          }
        );

        // Notify the person who assigned
        const actionId = insertResult.recordset?.[0]?.action_id;
        if (actionId && asg.assigned_by.toLowerCase() !== email) {
          try {
            await query(
              `INSERT INTO billing.comment_mentions (action_id, draft_fee_idx, mentioned_email, mentioned_by)
               VALUES (@actionId, @feeIdx, @to, @by)`,
              {
                actionId: { type: sql.Int, value: actionId },
                feeIdx: { type: sql.Int, value: asg.draft_fee_idx },
                to: asg.assigned_by.toLowerCase(),
                by: email,
              }
            );
          } catch (e) {
            context.log.warn('Mention insert failed (non-blocking):', e.message);
          }
        }
      }

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: true, status: newStatus },
      };
      return;
    }

    // ── POST: create assignment ─────────────────────────────────
    const { instanceId, assignedTo, comments } = req.body || {};

    if (!instanceId || !assignedTo) {
      context.res = { status: 400, body: 'instanceId and assignedTo are required' };
      return;
    }

    const assignedToEmail = assignedTo.toLowerCase().trim();

    // Fetch instance
    const instResult = await query(
      `SELECT wi.*, wsd.stage_code, wsd.stage_name
       FROM billing.workflow_instances wi
       JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
       WHERE wi.instance_id = @id`,
      { id: { type: sql.Int, value: Number(instanceId) } }
    );

    if (!instResult.recordset.length) {
      context.res = { status: 404, body: 'Workflow instance not found' };
      return;
    }

    const inst = instResult.recordset[0];
    const stageCode = inst.stage_code;

    // Only MR and PR reviewers can assign (or billing super users)
    if (!isBillingSuperUser(email)) {
      if (stageCode !== 'MR' && stageCode !== 'PR') {
        context.res = { status: 403, body: 'Assignments can only be created during Manager or Partner Review' };
        return;
      }
      const reviewerCol = STAGE_REVIEWER_COL[inst.current_stage_id];
      const assignedReviewer = (inst[reviewerCol] || '').toLowerCase();
      if (assignedReviewer !== email) {
        context.res = { status: 403, body: 'Only the assigned reviewer can create assignments' };
        return;
      }
    }

    // Can't assign to yourself
    if (assignedToEmail === email) {
      context.res = { status: 400, body: 'Cannot assign a review to yourself' };
      return;
    }

    // Check for existing pending assignment for same user + draft
    const existing = await query(
      `SELECT id FROM billing.draft_assignments
       WHERE instance_id = @instId AND assigned_to = @to AND status = 'PENDING'`,
      {
        instId: { type: sql.Int, value: Number(instanceId) },
        to: { type: sql.VarChar, value: assignedToEmail },
      }
    );

    if (existing.recordset.length) {
      context.res = { status: 409, body: 'This user already has a pending assignment for this draft' };
      return;
    }

    // Create the assignment
    const insertResult = await query(
      `INSERT INTO billing.draft_assignments (instance_id, draft_fee_idx, stage_code, assigned_by, assigned_to, comments)
       OUTPUT INSERTED.id
       VALUES (@instId, @feeIdx, @stage, @by, @to, @comments)`,
      {
        instId: { type: sql.Int, value: Number(instanceId) },
        feeIdx: { type: sql.Int, value: inst.draft_fee_idx },
        stage: stageCode,
        by: email,
        to: assignedToEmail,
        comments: comments || null,
      }
    );

    const assignmentIdNew = insertResult.recordset?.[0]?.id;

    // Record an ASSIGNED action in the activity feed
    const actionComment = `Assigned review to @${assignedToEmail}${comments ? ' — ' + comments : ''}`;
    const actionResult = await query(
      `INSERT INTO billing.workflow_actions (instance_id, cycle_id, stage_id, action_type, action_by, comments)
       OUTPUT INSERTED.action_id
       VALUES (@instId, @cycleId, @stageId, 'COMMENT', @by, @comments)`,
      {
        instId: { type: sql.Int, value: Number(instanceId) },
        cycleId: { type: sql.Int, value: inst.cycle_id },
        stageId: { type: sql.TinyInt, value: inst.current_stage_id },
        by: email,
        comments: actionComment,
      }
    );

    // Create mention for the assignee
    const actionId = actionResult.recordset?.[0]?.action_id;
    if (actionId) {
      try {
        await query(
          `INSERT INTO billing.comment_mentions (action_id, draft_fee_idx, mentioned_email, mentioned_by)
           VALUES (@actionId, @feeIdx, @to, @by)`,
          {
            actionId: { type: sql.Int, value: actionId },
            feeIdx: { type: sql.Int, value: inst.draft_fee_idx },
            to: assignedToEmail,
            by: email,
          }
        );
      } catch (e) {
        context.log.warn('Mention insert failed (non-blocking):', e.message);
      }
    }

    context.res = {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true, assignmentId: assignmentIdNew },
    };
  } catch (err) {
    context.log.error('workflowAssign error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
