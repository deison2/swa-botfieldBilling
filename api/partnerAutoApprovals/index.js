// api/partnerAutoApprovals/index.js
// Manages reviewer auto-approval relationships:
//   PR_SKIP — Partner pre-approves a Manager (skips Partner Review after MR)
//   OR_SKIP — Originator pre-approves a Partner (skips Originator Review after PR)
const { sql, query } = require('../shared/db');
const { getEmail, isSuperUser, isBillingSuperUser } = require('../shared/auth');

const VALID_TYPES = ['PR_SKIP', 'OR_SKIP'];

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    if (!email) {
      context.res = { status: 401, body: 'Authentication required' };
      return;
    }

    const method = (req.method || '').toUpperCase();
    const id = context.bindingData.id ? Number(context.bindingData.id) : null;

    // ── GET: list active auto-approvals ──
    if (method === 'GET') {
      const type = req.query?.type || null; // optional filter: PR_SKIP or OR_SKIP
      let rows;

      if (isSuperUser(email) || isBillingSuperUser(email)) {
        rows = await query(
          `SELECT id, relationship_type, approver_email, reviewee_email, created_by, created_at
           FROM billing.reviewer_auto_approvals
           WHERE revoked_at IS NULL ${type ? 'AND relationship_type = @type' : ''}
           ORDER BY relationship_type, created_at DESC`,
          type ? { type } : {}
        );
      } else {
        rows = await query(
          `SELECT id, relationship_type, approver_email, reviewee_email, created_by, created_at
           FROM billing.reviewer_auto_approvals
           WHERE approver_email = @email AND revoked_at IS NULL ${type ? 'AND relationship_type = @type' : ''}
           ORDER BY relationship_type, created_at DESC`,
          { email: { type: sql.VarChar, value: email }, ...(type ? { type } : {}) }
        );
      }

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: rows.recordset,
      };
      return;
    }

    // ── POST: create a new auto-approval ──
    if (method === 'POST') {
      const { relationshipType, approverEmail, revieweeEmail } = req.body || {};

      if (!relationshipType || !VALID_TYPES.includes(relationshipType)) {
        context.res = { status: 400, body: `relationshipType must be one of: ${VALID_TYPES.join(', ')}` };
        return;
      }
      if (!approverEmail || !revieweeEmail) {
        context.res = { status: 400, body: 'approverEmail and revieweeEmail are required' };
        return;
      }

      const approver = approverEmail.toLowerCase().trim();
      const reviewee = revieweeEmail.toLowerCase().trim();

      // Auth: only the approver themselves, or a super user, can create
      if (!isSuperUser(email) && !isBillingSuperUser(email) && email !== approver) {
        context.res = { status: 403, body: 'You can only create auto-approvals for yourself' };
        return;
      }

      // Upsert: if a revoked row exists, reactivate it; otherwise insert
      await query(
        `MERGE billing.reviewer_auto_approvals AS tgt
         USING (SELECT @type AS relationship_type, @approver AS approver_email, @reviewee AS reviewee_email) AS src
         ON tgt.relationship_type = src.relationship_type AND tgt.approver_email = src.approver_email AND tgt.reviewee_email = src.reviewee_email
         WHEN MATCHED THEN UPDATE SET revoked_at = NULL, created_by = @createdBy, created_at = GETUTCDATE()
         WHEN NOT MATCHED THEN INSERT (relationship_type, approver_email, reviewee_email, created_by)
           VALUES (src.relationship_type, src.approver_email, src.reviewee_email, @createdBy);`,
        {
          type: relationshipType,
          approver: { type: sql.VarChar, value: approver },
          reviewee: { type: sql.VarChar, value: reviewee },
          createdBy: { type: sql.VarChar, value: email },
        }
      );

      context.res = {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'Auto-approval created', relationshipType, approverEmail: approver, revieweeEmail: reviewee },
      };
      return;
    }

    // ── DELETE: revoke an auto-approval ──
    if (method === 'DELETE') {
      if (!id) {
        context.res = { status: 400, body: 'id is required' };
        return;
      }

      const existing = await query(
        `SELECT approver_email FROM billing.reviewer_auto_approvals WHERE id = @id AND revoked_at IS NULL`,
        { id: { type: sql.Int, value: id } }
      );

      if (!existing.recordset.length) {
        context.res = { status: 404, body: 'Auto-approval not found or already revoked' };
        return;
      }

      const owner = existing.recordset[0].approver_email.toLowerCase();
      if (!isSuperUser(email) && !isBillingSuperUser(email) && email !== owner) {
        context.res = { status: 403, body: 'Not authorized to revoke this auto-approval' };
        return;
      }

      await query(
        `UPDATE billing.reviewer_auto_approvals SET revoked_at = GETUTCDATE() WHERE id = @id`,
        { id: { type: sql.Int, value: id } }
      );

      context.res = { status: 200, body: { message: 'Auto-approval revoked' } };
      return;
    }

    context.res = { status: 405, body: 'Method not allowed' };
  } catch (err) {
    context.log.error('partnerAutoApprovals error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
