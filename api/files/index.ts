import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";

const blobSvc = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING!);
const container = blobSvc.getContainerClient("my-container");

app.http("files", {
  methods: ["GET", "POST", "DELETE", "PUT"],
  authLevel: "function",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    switch (req.method) {
      case "GET": {
        const list: string[] = [];
        for await (const b of container.listBlobsFlat()) list.push(b.name);
        return { jsonBody: list };
      }
      case "POST": {
        const name = req.query.get("name")!;
        const data = Buffer.from(await req.arrayBuffer());
        await container.getBlockBlobClient(name).uploadData(data);
        return { status: 201, jsonBody: { name } };
      }
      // ... PUT/DELETE similarly
      default:
        return { status: 405 };
    }
  }
});
