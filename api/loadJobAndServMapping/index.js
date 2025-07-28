const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "container-bmssprod001";
const JOBMAPPING = "htmlData/automatedBilling/narrativeStandards/jobMapping.json";
const SERVICEMAPPING = "htmlData/automatedBilling/narrativeStandards/services.json";

module.exports = async function (context, req) {
  const type = context.bindingData.type;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;

  const blobSvc = BlobServiceClient.fromConnectionString(conn);
  const container = blobSvc.getContainerClient(CONTAINER);

  const blobName = type === "jobMapping" ? JOBMAPPING : SERVICEMAPPING;
  const blobClient = container.getBlockBlobClient(blobName);

  try {
    const list = await readAll(blobClient);
    console.log(list);
    context.res = list
      ? { status: 200, body: list }
      : { status: 404, body: `type ${type} not found` };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};

// Helpers
async function readAll(blobClient) {
  try {
    const dl = await blobClient.download();
    const buf = await streamToBuffer(dl.readableStreamBody);
    return JSON.parse(buf.toString() || "[]");
  } catch (e) {
    if (e.statusCode === 404) return []; // blob not found yet
    throw e;
  }
}

function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", d => chunks.push(d));
    readableStream.on("end", () => resolve(Buffer.concat(chunks)));
    readableStream.on("error", reject);
  });
}
