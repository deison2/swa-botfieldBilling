// api/mentions/index.js
const { sql, query } = require('../shared/db');
const { getEmail } = require('../shared/auth');

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    if (!email) {
      context.res = { status: 401, body: 'Authentication required' };
      return;
    }

    const method = req.method.toUpperCase();
    const mentionId = context.bindingData.mentionId;

    if (method === 'GET') {
      const result = await query(
        `SELECT cm.mention_id, cm.action_id, cm.draft_fee_idx,
                cm.mentioned_by, cm.is_read, cm.created_at,
                wa.comments, wa.action_type,
                wsd.stage_code, wsd.stage_name
         FROM billing.comment_mentions cm
         JOIN billing.workflow_actions wa ON cm.action_id = wa.action_id
         JOIN billing.workflow_stage_definitions wsd ON wa.stage_id = wsd.stage_id
         WHERE cm.mentioned_email = @email AND cm.is_read = 0
         ORDER BY cm.created_at DESC`,
        { email: { type: sql.VarChar, value: email } }
      );

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: result.recordset,
      };
      return;
    }

    if (method === 'PUT') {
      // Bulk mark-as-read for a specific draft
      if (mentionId === 'markRead') {
        const { draft_fee_idx } = req.body || {};
        if (!draft_fee_idx) {
          context.res = { status: 400, body: 'draft_fee_idx is required' };
          return;
        }

        const result = await query(
          `UPDATE billing.comment_mentions SET is_read = 1
           WHERE draft_fee_idx = @feeIdx AND mentioned_email = @email AND is_read = 0`,
          {
            feeIdx: { type: sql.Int, value: Number(draft_fee_idx) },
            email: { type: sql.VarChar, value: email },
          }
        );

        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: { updated: result.rowsAffected[0] },
        };
        return;
      }

      // Single mention mark-as-read
      const id = Number(mentionId);
      if (!mentionId || isNaN(id)) {
        context.res = { status: 400, body: 'Valid mentionId is required' };
        return;
      }

      const result = await query(
        `UPDATE billing.comment_mentions SET is_read = 1
         WHERE mention_id = @mentionId AND mentioned_email = @email`,
        {
          mentionId: { type: sql.Int, value: id },
          email: { type: sql.VarChar, value: email },
        }
      );

      if (result.rowsAffected[0] === 0) {
        context.res = { status: 404, body: 'Mention not found' };
        return;
      }

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { updated: result.rowsAffected[0] },
      };
      return;
    }
  } catch (err) {
    context.log.error('mentions error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
