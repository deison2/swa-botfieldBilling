// api/userRoles/index.js
const { sql, query } = require('../shared/db');
const { getEmail, isSuperUser, isBillingSuperUser } = require('../shared/auth');

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    if (!email) {
      context.res = { status: 401, body: 'Authentication required' };
      return;
    }

    // Get active cycle
    const cycleResult = await query(
      'SELECT TOP 1 cycle_id FROM billing.billing_cycles WHERE is_active = 1'
    );
    const activeCycleId = cycleResult.recordset.length
      ? cycleResult.recordset[0].cycle_id
      : null;

    let pendingReviews = { BR: 0, MR: 0, PR: 0, OR: 0, POST: 0 };
    let totalPending = 0;

    if (activeCycleId) {
      const pendingResult = await query(
        `SELECT wsd.stage_code, COUNT(*) AS cnt
         FROM billing.workflow_instances wi
         JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
         WHERE wi.cycle_id = @cycleId
           AND wi.current_status = 'PENDING'
           AND (
             wi.billing_reviewer = @email
             OR wi.manager_reviewer = @email
             OR wi.partner_reviewer = @email
             OR wi.originator_reviewer = @email
           )
         GROUP BY wsd.stage_code`,
        {
          cycleId: { type: sql.Int, value: activeCycleId },
          email,
        }
      );

      for (const row of pendingResult.recordset) {
        pendingReviews[row.stage_code] = row.cnt;
        totalPending += row.cnt;
      }
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        email,
        isSuperUser: isSuperUser(email),
        isBillingSuperUser: isBillingSuperUser(email),
        activeCycleId,
        pendingReviews,
        totalPending,
      },
    };
  } catch (err) {
    context.log.error('userRoles error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
