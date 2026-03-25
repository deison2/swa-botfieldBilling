// api/workflowTracker/index.js
// POST /api/workflowTracker
// Accepts { drafts: [...PE rows] }, ensures workflow_instances exist for each,
// cleans up orphans, and returns tracker data.
// Client already has draft details (client_code, name, etc.) — we only manage workflow state.
const { sql, query } = require('../shared/db');
const { getEmail, isSuperUser, isBillingSuperUser, isBillingTeam, BILLING_SUPER_USERS } = require('../shared/auth');

module.exports = async function (context, req) {
  try {
    const email = getEmail(req);
    if (!email) {
      context.res = { status: 401, body: 'Authentication required' };
      return;
    }

    const isAdmin = isSuperUser(email) || isBillingSuperUser(email);
    const isBT = isBillingTeam(email);
    const drafts = req.body?.drafts || [];

    // Build a lookup of PE draft data by draft_fee_idx
    const draftMap = {};
    for (const d of drafts) {
      const feeIdx = Number(d.DRAFTFEEIDX);
      if (Number.isFinite(feeIdx)) draftMap[feeIdx] = d;
    }
    const liveFeeIdxs = Object.keys(draftMap).map(Number);

    // ── 0. Get or create active cycle ──
    let cycleResult = await query(
      'SELECT cycle_id FROM billing.billing_cycles WHERE is_active = 1'
    );
    if (!cycleResult.recordset.length) {
      const now = new Date();
      await query(
        `INSERT INTO billing.billing_cycles (period_month, period_year, is_active)
         VALUES (@month, @year, 1)`,
        {
          month: { type: sql.TinyInt, value: now.getMonth() + 1 },
          year: { type: sql.SmallInt, value: now.getFullYear() },
        }
      );
      cycleResult = await query(
        'SELECT cycle_id FROM billing.billing_cycles WHERE is_active = 1'
      );
    }
    const cycleId = cycleResult.recordset[0].cycle_id;

    // ── 1. Ensure workflow_instances exist for every PE draft ──
    const defaultBillingReviewer = BILLING_SUPER_USERS[0] || email;

    if (liveFeeIdxs.length > 0) {
      // Find which drafts already have instances (single query)
      const idxList = liveFeeIdxs.join(',');
      const existingResult = await query(
        `SELECT draft_fee_idx FROM billing.workflow_instances
         WHERE cycle_id = @cycleId AND draft_fee_idx IN (${idxList})`,
        { cycleId: { type: sql.Int, value: cycleId } }
      );
      const existingSet = new Set(existingResult.recordset.map(r => r.draft_fee_idx));

      // Bulk-insert missing ones in a single statement
      const missing = liveFeeIdxs.filter(idx => !existingSet.has(idx));
      if (missing.length > 0) {
        const valueRows = missing.map(feeIdx => {
          const d = draftMap[feeIdx];
          const mgr = (d.CMEmail || '').toLowerCase().trim() || 'NULL';
          const ptr = (d.CPEmail || '').toLowerCase().trim() || 'NULL';
          const org = (d.COEmail || '').toLowerCase().trim() || 'NULL';
          const esc = (v) => v === 'NULL' ? 'NULL' : `N'${v.replace(/'/g, "''")}'`;
          return `(${feeIdx}, @cycleId, N'${defaultBillingReviewer.replace(/'/g, "''")}', ${esc(mgr)}, ${esc(ptr)}, ${esc(org)}, 1, 'PENDING')`;
        });

        // Insert in batches of 100 to stay within SQL limits
        for (let i = 0; i < valueRows.length; i += 100) {
          const batch = valueRows.slice(i, i + 100);
          await query(
            `INSERT INTO billing.workflow_instances
               (draft_fee_idx, cycle_id, billing_reviewer, manager_reviewer, partner_reviewer, originator_reviewer, current_stage_id, current_status)
             VALUES ${batch.join(',\n')}`,
            { cycleId: { type: sql.Int, value: cycleId } }
          );
        }
      }
    }

    // ── 1b. Sync reviewer columns on existing instances from latest PE data ──
    // Reviewer assignments in PE can change; keep workflow_instances in sync.
    if (liveFeeIdxs.length > 0) {
      const updateCases = { manager: [], partner: [], originator: [] };
      for (const feeIdx of liveFeeIdxs) {
        const d = draftMap[feeIdx];
        const mgr = (d.CMEmail || '').toLowerCase().trim();
        const ptr = (d.CPEmail || '').toLowerCase().trim();
        const org = (d.COEmail || '').toLowerCase().trim();
        if (mgr) updateCases.manager.push({ feeIdx, val: mgr });
        if (ptr) updateCases.partner.push({ feeIdx, val: ptr });
        if (org) updateCases.originator.push({ feeIdx, val: org });
      }

      const buildBulkUpdate = (col, items) => {
        if (!items.length) return null;
        const esc = v => `N'${v.replace(/'/g, "''")}'`;
        const whenClauses = items.map(i => `WHEN ${i.feeIdx} THEN ${esc(i.val)}`).join(' ');
        const idList = items.map(i => i.feeIdx).join(',');
        return `UPDATE billing.workflow_instances
                SET ${col} = CASE draft_fee_idx ${whenClauses} ELSE ${col} END,
                    updated_at = GETUTCDATE()
                WHERE cycle_id = @cycleId AND draft_fee_idx IN (${idList})
                  AND (${col} IS NULL OR ${col} != CASE draft_fee_idx ${whenClauses} ELSE ${col} END)`;
      };

      const updates = [
        buildBulkUpdate('manager_reviewer', updateCases.manager),
        buildBulkUpdate('partner_reviewer', updateCases.partner),
        buildBulkUpdate('originator_reviewer', updateCases.originator),
      ].filter(Boolean);

      for (const updateSql of updates) {
        await query(updateSql, { cycleId: { type: sql.Int, value: cycleId } });
      }
    }

    // ── 2. Cleanup: delete orphaned workflow rows no longer in PE ──
    if (liveFeeIdxs.length > 0) {
      const idxList = liveFeeIdxs.join(',');

      await query(
        `DELETE wa FROM billing.workflow_actions wa
         JOIN billing.workflow_instances wi ON wa.instance_id = wi.instance_id
         WHERE wi.cycle_id = @cycleId AND wi.draft_fee_idx NOT IN (${idxList})`,
        { cycleId: { type: sql.Int, value: cycleId } }
      );
      await query(
        `DELETE FROM billing.workflow_instances
         WHERE cycle_id = @cycleId AND draft_fee_idx NOT IN (${idxList})`,
        { cycleId: { type: sql.Int, value: cycleId } }
      );
    }

    // ── 3. Fetch all active-cycle instances ──
    let instancesQuery = `
      SELECT wi.instance_id, wi.draft_fee_idx, wi.cycle_id,
             wi.billing_reviewer, wi.manager_reviewer, wi.partner_reviewer, wi.originator_reviewer,
             wi.current_stage_id, wi.current_status,
             wi.br_completed_at, wi.mr_completed_at, wi.pr_completed_at, wi.or_completed_at, wi.posted_at,
             wi.updated_at,
             wsd.stage_code, wsd.stage_name
      FROM billing.workflow_instances wi
      JOIN billing.billing_cycles bc ON wi.cycle_id = bc.cycle_id AND bc.is_active = 1
      JOIN billing.workflow_stage_definitions wsd ON wi.current_stage_id = wsd.stage_id
    `;

    const params = {};

    if (!isAdmin) {
      instancesQuery += `
      WHERE (wi.billing_reviewer = @email OR wi.manager_reviewer = @email
             OR wi.partner_reviewer = @email OR wi.originator_reviewer = @email
             ${isBT ? "OR wi.current_stage_id = 1" : ""})
      `;
      params.email = { type: sql.VarChar, value: email };
    }

    instancesQuery += ` ORDER BY wi.updated_at DESC`;

    const instResult = await query(instancesQuery, params);
    const instances = instResult.recordset;

    // ── 4. Enrich instances with role/actionability + client info from PE data ──
    const emailLower = email.toLowerCase();

    const enriched = instances.map(inst => {
      const d = draftMap[inst.draft_fee_idx] || {};

      const roles = [];
      if ((inst.billing_reviewer || '').toLowerCase() === emailLower || (isBT && inst.current_stage_id === 1)) roles.push('billing');
      if ((inst.manager_reviewer || '').toLowerCase() === emailLower) roles.push('manager');
      if ((inst.partner_reviewer || '').toLowerCase() === emailLower) roles.push('partner');
      if ((inst.originator_reviewer || '').toLowerCase() === emailLower) roles.push('originator');

      const stageReviewerMap = { 1: 'billing_reviewer', 2: 'manager_reviewer', 3: 'partner_reviewer', 4: 'originator_reviewer' };
      const currentReviewerCol = stageReviewerMap[inst.current_stage_id];
      const currentReviewer = currentReviewerCol ? (inst[currentReviewerCol] || '') : '';
      const isCurrentReviewer =
        (currentReviewer.toLowerCase() === emailLower) ||
        (inst.current_stage_id === 1 && (isBT || isAdmin));

      // Check if the user already completed their stage review
      const userCompletedTheirStage = (
        (roles.includes('billing')    && inst.br_completed_at) ||
        (roles.includes('manager')    && inst.mr_completed_at) ||
        (roles.includes('partner')    && inst.pr_completed_at) ||
        (roles.includes('originator') && inst.or_completed_at)
      );

      let actionability;
      if (inst.current_status === 'COMPLETED' || inst.posted_at) {
        actionability = 'completed';
      } else if (userCompletedTheirStage) {
        actionability = 'completed';
      } else if (inst.current_status === 'ON_HOLD') {
        actionability = 'waiting';
      } else if (isCurrentReviewer) {
        actionability = 'actionable';
      } else {
        actionability = 'waiting';
      }

      return {
        instance_id: inst.instance_id,
        draft_fee_idx: inst.draft_fee_idx,
        cycle_id: inst.cycle_id,
        client_code: d.CLIENTCODE || '',
        client_name: d.CLIENTNAME || '',
        partner_name: d.CLIENTPARTNER || d.clientpartner || d.ClientPartner || '',
        manager_name: d.CLIENTMANAGER || d.clientmanager || d.ClientManager || '',
        stage_code: inst.stage_code,
        stage_name: inst.stage_name,
        current_stage_id: inst.current_stage_id,
        current_status: inst.current_status,
        current_reviewer: currentReviewer,
        billing_reviewer: inst.billing_reviewer,
        manager_reviewer: inst.manager_reviewer,
        partner_reviewer: inst.partner_reviewer,
        originator_reviewer: inst.originator_reviewer,
        br_completed_at: inst.br_completed_at,
        mr_completed_at: inst.mr_completed_at,
        pr_completed_at: inst.pr_completed_at,
        or_completed_at: inst.or_completed_at,
        posted_at: inst.posted_at,
        updated_at: inst.updated_at,
        roles,
        isCurrentReviewer,
        actionability,
      };
    });

    // ── 5. Summary counts ──
    const summary = { actionable: 0, waiting: 0, completed: 0 };
    for (const inst of enriched) {
      summary[inst.actionability]++;
    }

    // ── 6. Progress by partner ──
    // Use partner_reviewer email as key; fall back to PE display name (CLIENTPARTNER)
    const partnerMap = {};
    for (const inst of enriched) {
      const key = inst.partner_reviewer || inst.partner_name;
      if (!key) continue;
      if (!partnerMap[key]) partnerMap[key] = { total: 0, completed: 0, displayName: inst.partner_name || '' };
      partnerMap[key].total++;
      if (inst.pr_completed_at || inst.current_stage_id > 3) partnerMap[key].completed++;
    }
    const progressByPartner = Object.entries(partnerMap)
      .map(([key, data]) => ({ email: key, displayName: data.displayName, total: data.total, completed: data.completed, pct: data.total ? Math.round((data.completed / data.total) * 100) : 0 }))
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));

    // ── 7. Progress by manager ──
    const managerMap = {};
    for (const inst of enriched) {
      const key = inst.manager_reviewer || inst.manager_name;
      if (!key) continue;
      if (!managerMap[key]) managerMap[key] = { total: 0, completed: 0, displayName: inst.manager_name || '' };
      managerMap[key].total++;
      if (inst.mr_completed_at || inst.current_stage_id > 2) managerMap[key].completed++;
    }
    const progressByManager = Object.entries(managerMap)
      .map(([key, data]) => ({ email: key, displayName: data.displayName, total: data.total, completed: data.completed, pct: data.total ? Math.round((data.completed / data.total) * 100) : 0 }))
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));

    // ── 8. Return everything ──
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        summary,
        progressByPartner,
        progressByManager,
        instances: enriched,
      },
    };
  } catch (err) {
    context.log.error('workflowTracker error:', err);
    context.res = { status: 500, body: err.message || String(err) };
  }
};
