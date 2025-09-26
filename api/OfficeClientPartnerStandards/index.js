const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (context, req) {
const type = context.bindingData.type;
const url = `https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/${type}Standard?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug`;
const CONTAINER = "container-bmssprod001";
const BLOB = `htmlData/automatedBilling/${type}/standards.json`;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;

  const blobSvc = BlobServiceClient.fromConnectionString(conn);
  const container = blobSvc.getContainerClient(CONTAINER);
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(BLOB);

    const list = await readAll(blob);
    
  const method = req.method.toUpperCase();

    switch (method) {



      case "GET": {

function mapStandards(
  populationArray,
  blobArray,
  popKey,
  blobKey,
  {
    normalize = v => (v == null ? null : String(v).trim().toUpperCase())
  } = {}
) {
  const result = [];

  for (const obj of populationArray || []) {
    const popVal = normalize(obj?.[popKey]);
    if (popVal == null) continue;

    // find all blob entries where blobKey matches
    const matches = (blobArray || []).filter(
      b => normalize(b?.[blobKey]) === popVal
    );

    if (matches.length > 0) {
      // push merged records for each match
      for (const match of matches) {
        result.push({
          ...obj,
          ...match
        });
      }
    } else {
      // no match: push population row with null value
      result.push({
        ...obj,
        value: null
      });
    }
  }

  return result;
}


let populationKey = '';
if (type === 'office')       populationKey = 'OfficeCode';
else if (type === 'partner') populationKey = 'PartnerCode';
else if (type === 'client')  populationKey = 'ClientCode';

if (type === 'office' || type === 'partner') {
  const mainBody = await fetch(url, { method: 'POST' });
  const population = await mainBody.json();

  const res = mapStandards(population, list, populationKey, 'id');

  context.res = { status: 200, body: res };
  return;
}

if (type === 'client') {
  const mainBody = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(context.bindingData.searchText)
  });
  const population = await mainBody.json();

  const res = mapStandards(population, list, populationKey, 'id');
  console.log(list);
  console.log(res);

  context.res = { status: 200, body: res };
  return;
}

}


      case "POST": {
  const body = req.body || {};
  const id = body.id;
  const service =
    type === 'client'
      ? (body.serv ?? null)
      : null;
  const idx =
    type === 'client'
      ? list.findIndex(i =>
          i.id === id &&
          (i.serv ?? null) === (service ?? null)
        )
      : list.findIndex(i => i.id === id);

  if (idx === -1) {
    // Insert
    const toInsert =
      type === 'client'
        ? { ...body, id, serv: service }
        : { ...body, id };

    list.push(toInsert);
    await writeAll(blob, list);
    context.res = { status: 201, body: toInsert };
    return;
  } else {
    const updated =
      type === 'client'
        ? { ...list[idx], ...body, id, serv: service }
        : { ...list[idx], ...body, id };

    list[idx] = updated;
    await writeAll(blob, list);
    context.res = { status: 200, body: updated };
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