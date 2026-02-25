const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (context, req) {
  const type = context.bindingData.dataType;
  console.log('Requested Knuula data type:', type);
  let BLOB;
  switch (type) {
    case "feeData":
      BLOB = "htmlData/automatedBilling/knuulaFees/masterFees.json";
      break;
    case "contractData":
      BLOB = "htmlData/automatedBilling/knuulaFees/masterContracts.json";
      break;

  default:
    throw new Error(`Unknown type: ${type}`);
  }
  console.log(BLOB);
  const CONTAINER = "container-bmssprod001";
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;

  const blobSvc = BlobServiceClient.fromConnectionString(conn);
  const container = blobSvc.getContainerClient(CONTAINER);
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(BLOB);


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

  const list = await readAll(blob);
  context.res = { status: 200, body: list };
        return
};