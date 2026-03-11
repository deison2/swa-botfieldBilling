const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (context, req) {
  const runType = context.bindingData.runType;
  const { payload } = req.body;
    const CONTAINER = "container-bmssprod001";
  const BLOB = "htmlData/automatedBilling/techFees/masterAudit.json";
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const blobSvc = BlobServiceClient.fromConnectionString(conn);
  const container = blobSvc.getContainerClient(CONTAINER);
  const blob = container.getBlockBlobClient(BLOB);

  switch (runType) {
    case 'population': {
      const apiRes = await fetch(
        'https://prod-34.eastus.logic.azure.com:443/workflows/720a09fd25ee4402988dbce84d5007af/triggers/manual/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=yF_ioqGToBw5rJikWkKay-VUdCKXlYNHADt9A_tODiA',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!apiRes.ok) {
        const msg = await apiRes.text().catch(() => '');
        context.res = { status: apiRes.status, body: `TechFeeProcess failed: ${apiRes.status} ${msg}` };
        return;
      }

      const result = await apiRes.json().catch(() => null);
      console.log(result);
      context.res = { status: 200, body: result };
      return;
    }

    case 'audit': {

      switch (payload.runType) {
        case 'read': {
          const list = await readAll(blob);
          context.res = { status: 200, body: list };
          return;
        }
        case 'write': {
          let existing = [];
          try {
            existing = await readAll(blob);
            if (!Array.isArray(existing)) existing = [];
          } catch {
            // Blob doesn't exist yet — start with empty array
          }
          const updated = [...existing, payload.record];
          const data = JSON.stringify(updated);
          await blob.upload(data, Buffer.byteLength(data), { overwrite: true });
          context.res = { status: 200, body: { message: 'Audit records updated successfully' } };
          return;
        }
        default:
          context.res = { status: 400, body: `Unknown runType for audit: ${payload.runType}` };
          return;
      }
    }

    default:
      context.res = { status: 400, body: `Unknown runType: ${runType}` };
      return;
  }
};

async function readAll(blob) {
  const download = await blob.download();
  const downloaded = await streamToBuffer(download.readableStreamBody);
  return JSON.parse(downloaded);
}

function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", d => chunks.push(d));
    readableStream.on("end", () => resolve(Buffer.concat(chunks)));
    readableStream.on("error", reject);
  });
}
