// api/workflowAction/index.js
const { sql, query } = require('../shared/db');
const { getEmail, isSuperUser, isBillingSuperUser, isBillingTeam } = require('../shared/auth');

const VALID_ACTIONS = ['APPROVED', 'REJECTED', 'COMMENT', 'REASSIGNED', 'ON_HOLD', 'RELEASED', 'FORCE_APPROVED', 'VIEWED', 'SEND_BACK'];

// @billing expands to these emails
const BILLING_ALIAS = ['chenriksen@bmss.com', 'lambrose@bmss.com'];

/**
 * Parse @mentions from comment text.
 * Supports @user@domain.com and @billing (alias).
 * Returns array of unique lowercase emails.
 */
function parseMentions(text) {
  if (!text) return [];
  const emails = new Set();
  // Match @billing alias
  if (/@billing\b/i.test(text)) {
    BILLING_ALIAS.forEach(e => emails.add(e));
  }
  // Match @user@domain.com patterns
  const emailPattern = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let m;
  while ((m = emailPattern.exec(text)) !== null) {
    emails.add(m[1].toLowerCase());
  }
  return [...emails];
}

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
    // COMMENT is exempt — anyone can comment on a draft at any point
    if (action_type !== 'COMMENT' && !isSuperUser(email)) {
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

    // Map non-standard action types to DB-safe values
    let dbActionType = action_type;
    let dbComments = comments || null;
    if (action_type === 'FORCE_APPROVED') {
      dbActionType = 'APPROVED';
      dbComments = `[Force-approved] ${comments || ''}`.trim();
    } else if (action_type === 'SEND_BACK') {
      dbActionType = 'REJECTED';
      dbComments = `[Sent back] ${comments || ''}`.trim();
    }

    // Record the action and capture the action_id
    const insertResult = await query(
      `INSERT INTO billing.workflow_actions (instance_id, cycle_id, stage_id, action_type, action_by, comments, reassigned_to)
       OUTPUT INSERTED.action_id
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
    const actionId = insertResult.recordset?.[0]?.action_id;

    // Parse @mentions and insert into comment_mentions (non-blocking)
    if (actionId && (action_type === 'COMMENT' || dbComments)) {
      try {
        const mentions = parseMentions(dbComments);
        // Don't mention yourself
        const filtered = mentions.filter(e => e !== email);
        if (filtered.length > 0) {
          const esc = v => `N'${v.replace(/'/g, "''")}'`;
          const values = filtered.map(e =>
            `(${actionId}, ${inst.draft_fee_idx}, ${esc(e)}, ${esc(email)})`
          ).join(',\n');
          await query(
            `INSERT INTO billing.comment_mentions (action_id, draft_fee_idx, mentioned_email, mentioned_by)
             VALUES ${values}`
          );
        }
      } catch (mentionErr) {
        context.log.warn('Failed to record mentions (non-blocking):', mentionErr.message);
      }
    }

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
    } else if (action_type === 'SEND_BACK') {
      await sendBackStage(instanceId, inst);
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

// Stage code labels for readable auto-advance comments
const STAGE_LABELS = { 1: 'Billing Team Review', 2: 'Manager Review', 3: 'Partner Review', 4: 'Originator Review', 5: 'Post' };

async function advanceStage(instanceId, inst, approverEmail) {
  let currentStageId = inst.current_stage_id;
  let currentOrder = inst.stage_order;

  // Re-read the instance to get the latest reviewer columns
  const freshResult = await query(
    `SELECT * FROM billing.workflow_instances WHERE instance_id = @id`,
    { id: { type: sql.Int, value: instanceId } }
  );
  const liveInst = freshResult.recordset[0] || inst;

  // Loop: advance stages, auto-skipping where appropriate
  while (true) {
    // Mark current stage completed
    const completionCol = STAGE_COMPLETE_COL[currentStageId];
    if (completionCol) {
      await query(
        `UPDATE billing.workflow_instances SET ${completionCol} = GETUTCDATE(), updated_at = GETUTCDATE()
         WHERE instance_id = @id`,
        { id: { type: sql.Int, value: instanceId } }
      );
    }

    // Find next stage
    const nextStage = await query(
      `SELECT TOP 1 stage_id, stage_code, stage_order FROM billing.workflow_stage_definitions
       WHERE stage_order > @order ORDER BY stage_order ASC`,
      { order: { type: sql.TinyInt, value: currentOrder } }
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

    const next = nextStage.recordset[0];
    const nextStageId = next.stage_id;

    // Advance to next stage
    await query(
      `UPDATE billing.workflow_instances SET current_stage_id = @nextStage, current_status = 'PENDING', updated_at = GETUTCDATE()
       WHERE instance_id = @id`,
      { id: { type: sql.Int, value: instanceId }, nextStage: { type: sql.TinyInt, value: nextStageId } }
    );

    // Check if we should auto-skip this next stage
    // Only applies to individual-reviewer stages (MR=2, PR=3, OR=4), not group stages (BR=1, POST=5)
    if (nextStageId < 2 || nextStageId > 4) break;

    const nextReviewerCol = STAGE_REVIEWER_COL[nextStageId];
    const nextReviewer = (liveInst[nextReviewerCol] || '').toLowerCase().trim();

    // Check 1: Same reviewer as the person who initiated the approval chain
    if (nextReviewer && nextReviewer === approverEmail) {
      const prevLabel = STAGE_LABELS[currentStageId] || `Stage ${currentStageId}`;
      const skipLabel = STAGE_LABELS[nextStageId] || `Stage ${nextStageId}`;
      const comment = `${skipLabel} auto-advanced (same reviewer as ${prevLabel})`;

      await query(
        `INSERT INTO billing.workflow_actions (instance_id, cycle_id, stage_id, action_type, action_by, comments)
         VALUES (@instId, @cycleId, @stageId, 'APPROVED', @by, @comments)`,
        {
          instId: { type: sql.Int, value: instanceId },
          cycleId: { type: sql.Int, value: liveInst.cycle_id },
          stageId: { type: sql.TinyInt, value: nextStageId },
          by: approverEmail,
          comments: comment,
        }
      );

      // Continue the loop to advance past this stage
      currentStageId = nextStageId;
      currentOrder = next.stage_order;
      continue;
    }

    // Check 2: Auto-approval relationships
    // PR_SKIP (stage 3): Partner pre-approved a Manager → skip Partner Review
    // OR_SKIP (stage 4): Originator pre-approved a Partner → skip Originator Review
    const autoSkipConfig = {
      3: { type: 'PR_SKIP', approverCol: 'partner_reviewer', revieweeCol: 'manager_reviewer', skipLabel: 'Partner Review' },
      4: { type: 'OR_SKIP', approverCol: 'originator_reviewer', revieweeCol: 'partner_reviewer', skipLabel: 'Originator Review' },
    };

    const skipCfg = autoSkipConfig[nextStageId];
    if (skipCfg) {
      const approverAddr = (liveInst[skipCfg.approverCol] || '').toLowerCase().trim();
      const revieweeAddr = (liveInst[skipCfg.revieweeCol] || '').toLowerCase().trim();

      if (approverAddr && revieweeAddr) {
        const autoApproval = await query(
          `SELECT TOP 1 id FROM billing.reviewer_auto_approvals
           WHERE relationship_type = @type AND approver_email = @approver AND reviewee_email = @reviewee AND revoked_at IS NULL`,
          {
            type: skipCfg.type,
            approver: { type: sql.VarChar, value: approverAddr },
            reviewee: { type: sql.VarChar, value: revieweeAddr },
          }
        );

        if (autoApproval.recordset.length) {
          const comment = `${skipCfg.skipLabel} auto-approved (${approverAddr} has pre-approved ${revieweeAddr}'s reviews)`;

          await query(
            `INSERT INTO billing.workflow_actions (instance_id, cycle_id, stage_id, action_type, action_by, comments)
             VALUES (@instId, @cycleId, @stageId, 'APPROVED', @by, @comments)`,
            {
              instId: { type: sql.Int, value: instanceId },
              cycleId: { type: sql.Int, value: liveInst.cycle_id },
              stageId: { type: sql.TinyInt, value: nextStageId },
              by: approverAddr,
              comments: comment,
            }
          );

          // Continue the loop to advance past this stage
          currentStageId = nextStageId;
          currentOrder = next.stage_order;
          continue;
        }
      }
    }

    // No auto-skip condition met — stop here
    break;
  }
}

async function sendBackStage(instanceId, inst) {
  // Find the previous stage
  const prevStage = await query(
    `SELECT TOP 1 stage_id, stage_code, stage_order FROM billing.workflow_stage_definitions
     WHERE stage_order < @order ORDER BY stage_order DESC`,
    { order: { type: sql.TinyInt, value: inst.stage_order } }
  );

  if (!prevStage.recordset.length) {
    // Already at the first stage — nothing to send back to
    return;
  }

  const prev = prevStage.recordset[0];

  // Clear the completion timestamp of the previous stage (it's being re-opened)
  const prevCompletionCol = STAGE_COMPLETE_COL[prev.stage_id];
  if (prevCompletionCol) {
    await query(
      `UPDATE billing.workflow_instances SET ${prevCompletionCol} = NULL, updated_at = GETUTCDATE()
       WHERE instance_id = @id`,
      { id: { type: sql.Int, value: instanceId } }
    );
  }

  // Move the instance back to the previous stage
  await query(
    `UPDATE billing.workflow_instances SET current_stage_id = @prevStage, current_status = 'PENDING', updated_at = GETUTCDATE()
     WHERE instance_id = @id`,
    { id: { type: sql.Int, value: instanceId }, prevStage: { type: sql.TinyInt, value: prev.stage_id } }
  );
}
