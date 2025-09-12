const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (context, req) {
const type = context.bindingData.type;
const url = `https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/${type}Standard?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug`;
const CONTAINER = "container-bmssprod001";
const BLOB = `htmlData/automatedBilling/${type}/standards.json`;
  const method = req.method.toUpperCase();
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;

  const blobSvc = BlobServiceClient.fromConnectionString(conn);
  const container = blobSvc.getContainerClient(CONTAINER);
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(BLOB);

    const list = await readAll(blob);

    switch (method) {
      case "GET": {

function mapStandards(
  populationArray,
  blobArray,
  popKey,
  blobKey,
  outProp,         
  {
    normalize = v => (v == null ? null : String(v).trim().toUpperCase()),
    pick = item => (item && typeof item === 'object' ? item.value : item),
    fallback = null
  } = {}
) {
  const lookup = new Map();
  for (const item of blobArray || []) {
    const k = normalize(item?.[blobKey]);
    if (k == null) continue;
    if (!lookup.has(k)) lookup.set(k, item);
  }

  return (populationArray || []).map(obj => {
    const k = normalize(obj?.[popKey]);
    const match = k == null ? undefined : lookup.get(k);
    return { ...obj, [outProp]: match != null ? pick(match) : fallback };
  });
}
let populationKey = '';
if (type === 'office')       populationKey = 'OfficeCode';
else if (type === 'partner') populationKey = 'PartnerCode';
else if (type === 'client')  populationKey = 'ClientCode';

if (type === 'office' || type === 'partner') {
    const mainBody = await fetch(url, {method:  'POST'});
    const population = await mainBody.json();
    const res = mapStandards(population, list, populationKey, "id", "value");
    console.log(res);
          context.res = {
          status: 200,
          body: res
          };
        return
      }
else if (type === 'client') {
    const mainBody = await fetch(url, {
        method:  'POST',
        body: JSON.stringify(context.bindingData.searchText)
    });
    const population = await mainBody.json();
    const res = mapStandards(population, list, populationKey, "id", "value");
    console.log(res);
          context.res = {
          status: 200,
          body: res
          };
        return
    }
}



      case "POST": {
        const body = req.body;
        const id = req.body.id;
        console.log(body);
        const idx = list.findIndex(i => i.id === id);
        if (idx === -1) {
          list.push(body);
            await writeAll(blob, list);
            context.res = { status: 201, body: body };
          return;
        }
        else {
          list[idx] = { ...list[idx], ...body, id }; // keep uuid stable
          await writeAll(blob, list);
          context.res = { status: 200, body: list[idx] };
          return;
        }
      }
    }

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
}