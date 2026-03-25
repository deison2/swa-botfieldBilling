// api/billingCycles/index.js
const { sql, query } = require('../shared/db');
const { requireBillingSuperUser } = require('../shared/auth');

module.exports = async function (context, req) {
  try {
    const cycleId = context.bindingData.cycleId
      ? Number(context.bindingData.cycleId)
      : null;

    // ---------- GET ----------
    if (req.method === 'GET') {
      if (cycleId) {
        const result = await query(
          'SELECT * FROM billing.billing_cycles WHERE cycle_id = @id',
          { id: { type: sql.Int, value: cycleId } }
        );
        if (!result.recordset.length) {
          context.res = { status: 404, body: 'Cycle not found' };
          return;
        }
        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: result.recordset[0],
        };
        return;
      }

      // List — optional ?active=true filter
      const activeOnly = (req.query.active || '').toLowerCase() === 'true';
      const where = activeOnly ? 'WHERE is_active = 1' : '';
      const result = await query(
        `SELECT * FROM billing.billing_cycles ${where} ORDER BY created_at DESC`
      );
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: result.recordset,
      };
      return;
    }

    // ---------- POST (create) ----------
    if (req.method === 'POST') {
      const email = requireBillingSuperUser(context, req);
      if (!email) return;

      const {
        cycle_name,
        period_month,
        period_year,
        br_due,
        mr_due,
        pr_due,
        or_due,
        post_due,
        lock_after_signoff,
      } = req.body || {};

      if (!period_month || !period_year) {
        context.res = { status: 400, body: 'period_month and period_year are required' };
        return;
      }

      // Auto-calculate due dates from stage defaults if not provided
      const startDate = new Date();
      let brDue = br_due, mrDue = mr_due, prDue = pr_due, orDue = or_due, postDue = post_due;

      if (!brDue || !mrDue || !prDue || !orDue || !postDue) {
        const stages = await query(
          'SELECT stage_code, default_days FROM billing.workflow_stage_definitions ORDER BY stage_order'
        );
        const defaults = {};
        for (const s of stages.recordset) defaults[s.stage_code] = s.default_days;

        let cursor = new Date(startDate);
        if (!brDue) { cursor.setDate(cursor.getDate() + (defaults.BR || 1)); brDue = cursor.toISOString(); }
        if (!mrDue) { cursor.setDate(cursor.getDate() + (defaults.MR || 3)); mrDue = cursor.toISOString(); }
        if (!prDue) { cursor.setDate(cursor.getDate() + (defaults.PR || 2)); prDue = cursor.toISOString(); }
        if (!orDue) { cursor.setDate(cursor.getDate() + (defaults.OR || 1)); orDue = cursor.toISOString(); }
        if (!postDue) { cursor.setDate(cursor.getDate() + (defaults.POST || 1)); postDue = cursor.toISOString(); }
      }

      const result = await query(
        `INSERT INTO billing.billing_cycles
           (cycle_name, period_month, period_year, br_due, mr_due, pr_due, or_due, post_due, lock_after_signoff)
         OUTPUT INSERTED.*
         VALUES (@name, @month, @year, @br, @mr, @pr, @or_, @post, @lock)`,
        {
          name: cycle_name || null,
          month: { type: sql.TinyInt, value: period_month },
          year: { type: sql.SmallInt, value: period_year },
          br: brDue,
          mr: mrDue,
          pr: prDue,
          or_: orDue,
          post: postDue,
          lock: { type: sql.Bit, value: lock_after_signoff != null ? lock_after_signoff : 1 },
        }
      );

      context.res = {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: result.recordset[0],
      };
      return;
    }

    // ---------- PUT (update) ----------
    if (req.method === 'PUT') {
      const email = requireBillingSuperUser(context, req);
      if (!email) return;

      if (!cycleId) {
        context.res = { status: 400, body: 'cycleId is required in the URL' };
        return;
      }

      const fields = req.body || {};
      const sets = [];
      const params = { id: { type: sql.Int, value: cycleId } };

      const allowed = {
        cycle_name: sql.NVarChar,
        period_month: sql.TinyInt,
        period_year: sql.SmallInt,
        br_due: sql.NVarChar,
        mr_due: sql.NVarChar,
        pr_due: sql.NVarChar,
        or_due: sql.NVarChar,
        post_due: sql.NVarChar,
        lock_after_signoff: sql.Bit,
        is_active: sql.Bit,
      };

      for (const [key, sqlType] of Object.entries(allowed)) {
        if (fields[key] !== undefined) {
          sets.push(`${key} = @${key}`);
          params[key] = { type: sqlType, value: fields[key] };
        }
      }

      if (!sets.length) {
        context.res = { status: 400, body: 'No valid fields to update' };
        return;
      }

      // When setting is_active = 1, deactivate all others first
      if (fields.is_active === true || fields.is_active === 1) {
        await query(
          'UPDATE billing.billing_cycles SET is_active = 0 WHERE cycle_id != @id',
          { id: { type: sql.Int, value: cycleId } }
        );
      }

      const result = await query(
        `UPDATE billing.billing_cycles SET ${sets.join(', ')} OUTPUT INSERTED.* WHERE cycle_id = @id`,
        params
      );

      if (!result.recordset.length) {
        context.res = { status: 404, body: 'Cycle not found' };
        return;
      }

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: result.recordset[0],
      };
      return;
    }

    context.res = { status: 405, body: 'Method not allowed' };
  } catch (err) {
    context.log.error('billingCycles error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
