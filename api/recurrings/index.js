const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "container-bmssprod001";
const BLOB = "htmlData/automatedBilling/recurrings/masterRecurrings.json";

module.exports = async function (context, req) {
    
  if (process.env.NODE_ENV === "development") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  console.warn("⚠️  SSL certificate verification disabled (development mode)");
  }
  
  const method = req.method.toUpperCase();
  const uuid = context.bindingData.uuid; // from route
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;

  const blobSvc = BlobServiceClient.fromConnectionString(conn);
  const container = blobSvc.getContainerClient(CONTAINER);
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(BLOB);

  try {
    const list = await readAll(blob);

    switch (method) {
      case "GET": {
        // Return all (no uuid) or one (if uuid present)
        if (!uuid) {
          context.res = { status: 200, body: list };
        } else {
          const item = list.find(i => i.uuid === uuid);
          context.res = item
            ? { status: 200, body: item }
            : { status: 404, body: `uuid ${uuid} not found` };
        }
        return;
      }

      case "POST": {
        const body = req.body;
        if (!body || !body.uuid) {
          context.res = { status: 400, body: "Missing body or uuid" };
          return;
        }
        if (list.some(i => i.uuid === body.uuid)) {
          context.res = { status: 409, body: "uuid already exists" };
          return;
        }
        list.push(body);
        await writeAll(blob, list);
        context.res = { status: 201, body: body };
        return;
      }

      case "PUT": {
        if (!uuid) {
          context.res = { status: 400, body: "uuid param required in URL" };
          return;
        }
        const body = req.body;
        if (!body) {
          context.res = { status: 400, body: "Missing body" };
          return;
        }
        const idx = list.findIndex(i => i.uuid === uuid);
        if (idx === -1) {
          context.res = { status: 404, body: `uuid ${uuid} not found` };
          return;
        }
        // merge or replace – here we fully replace
        list[idx] = { ...list[idx], ...body, uuid }; // keep uuid stable
        await writeAll(blob, list);
        context.res = { status: 200, body: list[idx] };
        return;
      }

      case "DELETE": {
        if (!uuid) {
          context.res = { status: 400, body: "uuid param required in URL" };
          return;
        }
        const newList = list.filter(i => i.uuid !== uuid);
        if (newList.length === list.length) {
          context.res = { status: 404, body: `uuid ${uuid} not found` };
          return;
        }
        await writeAll(blob, newList);
        context.res = { status: 204 };
        return;
      }

      default:
        context.res = { status: 405, body: "Method not allowed" };
    }
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

async function writeAll(blobClient, arr) {
  const data = Buffer.from(JSON.stringify(arr, null, 2));
  await blobClient.uploadData(data, { overwrite: true });
}

function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", d => chunks.push(d));
    readableStream.on("end", () => resolve(Buffer.concat(chunks)));
    readableStream.on("error", reject);
  });
}
