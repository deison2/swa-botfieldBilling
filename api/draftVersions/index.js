// api/draftVersions/index.js
// GET  /api/draftVersions/{draftFeeIdx}  — list all versions for a draft (active cycle)
// POST /api/draftVersions                — create a new version
const { sql, query } = require('../shared/db');
const { getEmail } = require('../shared/auth');

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    if (!email) {
      context.res = { status: 401, body: 'Authentication required' };
      return;
    }

    if (req.method === 'GET') {
      return await handleGet(context, req, email);
    }
    if (req.method === 'POST') {
      return await handlePost(context, req, email);
    }

    context.res = { status: 405, body: 'Method not allowed' };
  } catch (err) {
    context.log.error('draftVersions error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};

async function handleGet(context, req, email) {
  const draftFeeIdx = Number(context.bindingData.draftFeeIdx);
  if (!draftFeeIdx) {
    context.res = { status: 400, body: 'draftFeeIdx is required' };
    return;
  }

  const result = await query(
    `SELECT dv.*
     FROM billing.draft_versions dv
     JOIN billing.billing_cycles bc ON dv.cycle_id = bc.cycle_id
     WHERE dv.draft_fee_idx = @feeIdx AND bc.is_active = 1
     ORDER BY dv.version_number ASC`,
    { feeIdx: { type: sql.Int, value: draftFeeIdx } }
  );

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: result.recordset,
  };
}

async function handlePost(context, req, email) {
  const {
    draftFeeIdx, versionNumber, analysisData, narrativeData, reason,
  } = req.body || {};

  if (!draftFeeIdx) {
    context.res = { status: 400, body: 'draftFeeIdx is required' };
    return;
  }

  // Resolve active cycle
  const cycleResult = await query(
    'SELECT cycle_id FROM billing.billing_cycles WHERE is_active = 1'
  );
  if (!cycleResult.recordset.length) {
    context.res = { status: 400, body: 'No active billing cycle' };
    return;
  }
  const cycleId = cycleResult.recordset[0].cycle_id;

  // Auto-determine version number if not provided
  let verNum = versionNumber;
  if (verNum == null) {
    const maxResult = await query(
      `SELECT ISNULL(MAX(version_number), -1) AS maxVer
       FROM billing.draft_versions
       WHERE draft_fee_idx = @feeIdx AND cycle_id = @cycleId`,
      {
        feeIdx: { type: sql.Int, value: Number(draftFeeIdx) },
        cycleId: { type: sql.Int, value: cycleId },
      }
    );
    verNum = maxResult.recordset[0].maxVer + 1;
  }

  const analysisJson = analysisData != null ? JSON.stringify(analysisData) : null;
  const narrativeJson = narrativeData != null ? JSON.stringify(narrativeData) : null;

  await query(
    `INSERT INTO billing.draft_versions
       (draft_fee_idx, cycle_id, version_number, analysis_data, narrative_data, created_by, reason)
     VALUES
       (@feeIdx, @cycleId, @ver, @analysis, @narrative, @by, @reason)`,
    {
      feeIdx: { type: sql.Int, value: Number(draftFeeIdx) },
      cycleId: { type: sql.Int, value: cycleId },
      ver: { type: sql.Int, value: verNum },
      analysis: { type: sql.NVarChar(sql.MAX), value: analysisJson },
      narrative: { type: sql.NVarChar(sql.MAX), value: narrativeJson },
      by: email,
      reason: reason || null,
    }
  );

  context.res = {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: { draftFeeIdx: Number(draftFeeIdx), cycleId, versionNumber: verNum },
  };
}
