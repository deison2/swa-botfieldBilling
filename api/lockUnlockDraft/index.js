// api/lockUnlockDraft/index.js

module.exports = async function (context, req) {
  try {
    const token = req.body && req.body.token;
    if (!token) {
      context.res = {
        status: 400,
        body: 'Missing token in request body.'
      };
      return;
    }

    const draftIdxRaw = context.bindingData.debtTranIndex;
    const draftIdx = Number(draftIdxRaw);

    const userRaw = context.bindingData.user || '';
    const user = userRaw.trim();
    const isLock = !!user; // with user → LOCK; without user → UNLOCK

    context.log('lockUnlockDraft ▶ draftIdx =', draftIdx, 'user =', user || '(none)');
    context.log('lockUnlockDraft ▶ mode =', isLock ? 'LOCK' : 'UNLOCK');

    if (!Number.isFinite(draftIdx)) {
      context.res = {
        status: 400,
        body: `Invalid debtTranIndex: ${draftIdxRaw}`
      };
      return;
    }

    let peRes;
    let peBodyText = '';

    if (isLock) {
      // ===== LOCK: set DraftInUse + DraftInUseSince =====
      const currentTime = new Date().toISOString();

      peRes = await fetch(
        'https://bmss.pehosted.com/PE/api/Billing/DraftFeeUpdateHeaderFields',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            DraftIdx: draftIdx,
            Fields: [
              { FieldName: 'DraftInUse',      Value: user },
              { FieldName: 'DraftInUseSince', Value: currentTime }
            ]
          })
        }
      );

      peBodyText = await peRes.text();
      context.log('PE LOCK response:', peRes.status, peBodyText);

    } else {
      // ===== UNLOCK: call BillingAdmin/UnlockDraftFee/{id} (GET) =====
      const url = `https://bmss.pehosted.com/PE/api/BillingAdmin/UnlockDraftFee/${draftIdx}`;

      peRes = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      peBodyText = await peRes.text();
      context.log('PE UNLOCK response:', peRes.status, peBodyText);
      // Per docs, success returns integer 0
    }

    if (!peRes.ok) {
      context.log.error('PE lock/unlock failed', peRes.status, peBodyText);
      context.res = {
        status: peRes.status,
        body: peBodyText || 'PE lock/unlock call failed.'
      };
      return;
    }

    // Try to JSON-parse the body if non-empty; otherwise just return text/null
    let body = null;
    if (peBodyText && peBodyText.trim()) {
      try {
        body = JSON.parse(peBodyText);
      } catch {
        body = peBodyText;
      }
    }

    context.res = {
      status: 200,
      body
    };
  } catch (err) {
    context.log.error('lockUnlockDraft error:', err);
    context.res = {
      status: 500,
      body: 'Internal server error calling lock/unlock.'
    };
  }
};