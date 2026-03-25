// api/workflowProgress/index.js
const { sql, query } = require('../shared/db');

module.exports = async function (context, req) {
  try {
    const cycleId = Number(context.bindingData.cycleId);
    if (!Number.isFinite(cycleId)) {
      context.res = { status: 400, body: 'cycleId is required' };
      return;
    }

    // Total count
    const totalResult = await query(
      'SELECT COUNT(*) AS total FROM billing.workflow_instances WHERE cycle_id = @id',
      { id: { type: sql.Int, value: cycleId } }
    );
    const total = totalResult.recordset[0].total;

    // Per-stage breakdown
    const stageResult = await query(
      `SELECT wsd.stage_id, wsd.stage_code, wsd.stage_name, wsd.stage_order,
              COUNT(wi.instance_id) AS count,
              SUM(CASE WHEN wi.current_status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN wi.current_status = 'ON_HOLD' THEN 1 ELSE 0 END) AS on_hold,
              SUM(CASE WHEN wi.current_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected
       FROM billing.workflow_stage_definitions wsd
       LEFT JOIN billing.workflow_instances wi
         ON wi.current_stage_id = wsd.stage_id AND wi.cycle_id = @id
       GROUP BY wsd.stage_id, wsd.stage_code, wsd.stage_name, wsd.stage_order
       ORDER BY wsd.stage_order`,
      { id: { type: sql.Int, value: cycleId } }
    );

    // Completion counts
    const completionResult = await query(
      `SELECT
         SUM(CASE WHEN br_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS br_done,
         SUM(CASE WHEN mr_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS mr_done,
         SUM(CASE WHEN pr_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS pr_done,
         SUM(CASE WHEN or_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS or_done,
         SUM(CASE WHEN posted_at IS NOT NULL THEN 1 ELSE 0 END) AS posted,
         SUM(CASE WHEN current_status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
       FROM billing.workflow_instances
       WHERE cycle_id = @id`,
      { id: { type: sql.Int, value: cycleId } }
    );

    const comp = completionResult.recordset[0] || {};
    const overallPct = total > 0 ? ((comp.completed || 0) / total) : 0;

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        cycle_id: cycleId,
        total,
        stages: stageResult.recordset,
        completions: {
          br_done: comp.br_done || 0,
          mr_done: comp.mr_done || 0,
          pr_done: comp.pr_done || 0,
          or_done: comp.or_done || 0,
          posted: comp.posted || 0,
          completed: comp.completed || 0,
        },
        overall_completion_pct: Math.round(overallPct * 1000) / 10,
      },
    };
  } catch (err) {
    context.log.error('workflowProgress error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
