const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "container-bmssprod001";
const PREFIX = "htmlData/automatedBilling/drafts/exclusions/"; 
// blob names look like: draftsExcluded_MM.DD.YY.json

module.exports = async function (context, req) {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const blobSvc = BlobServiceClient.fromConnectionString(conn);
  const container = blobSvc.getContainerClient(CONTAINER);

  try {
    if (req.query.list) {
      const out = [];
      for await (const b of container.listBlobsFlat({ prefix: PREFIX })) {
        const name = b.name;
        const m = name.match(/draftsExcluded_(\d{2})\.(\d{2})\.(\d{2})\.json$/i);
        if (!m) continue;
        const [_, mm, dd, yy] = m;
        const yyyy = 2000 + Number(yy);
        const ymd = `${yyyy}-${mm}-${dd}`;
        const label = `${Number(mm)}/${Number(dd)}/${yyyy}`;
        out.push({
          name, ymd, label,
          size: b.properties?.contentLength ?? null,
          lastModified: b.properties?.lastModified ?? null,
        });
      }
      out.sort((a, b) => (a.ymd < b.ymd ? 1 : a.ymd > b.ymd ? -1 : 0));
      context.res = { status: 200, body: out };
      return;
    }

    const ymd = req.query.date; // YYYY-MM-DD
    if (!ymd) {
      context.res = { status: 400, body: "Missing query parameter: date=YYYY-MM-DD or list=1" };
      return;
    }

    const [Y, M, D] = String(ymd).split("-");
    const yy = String(Number(Y) % 100).padStart(2, "0");
    const mm = String(Number(M)).padStart(2, "0");
    const dd = String(Number(D)).padStart(2, "0");
    const blobName = `${PREFIX}draftsExcluded_${mm}.${dd}.${yy}.json`;

    const blob = container.getBlockBlobClient(blobName);
    context.log("[Excluded] downloading", { blobName });
    const dl = await blob.download();
    const buf = await streamToBuffer(dl.readableStreamBody);
    const text = buf.toString() || "[]";
    context.res = { status: 200, body: JSON.parse(text) };
  } catch (err) {
    context.log.error("[Excluded] ERROR", err);
    context.res = { status: err.statusCode || 500, body: err.message };
  }
};

function streamToBuffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (d) => chunks.push(d));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}