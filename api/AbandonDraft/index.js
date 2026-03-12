const { BlobServiceClient } = require('@azure/storage-blob');

function safeDateKey(raw) {
  const s = String(raw || '').slice(0, 10);
  return s || 'unknown-date';
}

function safeUserKey(raw) {
  return String(raw || 'unknown-user')
    .toLowerCase()
    .replace(/[^0-9a-z@._-]/gi, '-');
}

function safeTimestamp(raw) {
  const iso = raw || new Date().toISOString();
  return iso.replace(/[:.]/g, '-');
}

module.exports = async function (context, req) {
  const token = req.body.token;
  const DebtTranIndex = req.body.DebtTranIndex;
  const { userEmail, debtTranDate, draftFeeIdx, reason } = req.body;

  const apiRes = await fetch(
    `https://bmss.pehosted.com/PE/api/Billing/AbandonDraft/${DebtTranIndex}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }
  );

  const result = await apiRes.text();
  console.log(result);

  if (!apiRes.ok) {
    context.res = {
      status: apiRes.status,
      body: `Error abandoning draft: ${apiRes.status} ${result}`
    };
    return;
  }

  // Non-blocking audit blob write
  const utcNow = new Date().toISOString();
  try {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobSvc = BlobServiceClient.fromConnectionString(conn);
    const container = blobSvc.getContainerClient('container-bmssprod001');
    const blobName = `htmlData/automatedBilling/drafts/abandons/${safeDateKey(debtTranDate)}/${safeUserKey(userEmail)}_${safeTimestamp(utcNow)}_draft_${draftFeeIdx}.json`;
    const blobClient = container.getBlockBlobClient(blobName);
    const doc = JSON.stringify({ draftFeeIdx, userEmail, debtTranDate, utcNow, reason });
    await blobClient.upload(doc, Buffer.byteLength(doc), {
      blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' },
    });
  } catch (err) {
    context.log('AbandonDraft audit write failed (non-blocking):', err?.message);
  }

  context.res = { status: 200, body: result };
};
