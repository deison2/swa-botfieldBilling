const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "container-bmssprod001";
const BLOB = "htmlData/automatedBilling/billingGroups/masterRelationship.json";

module.exports = async function (context, req) {
  const method = String(req.method || "GET").toUpperCase();
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!conn) {
    context.res = { status: 500, body: "Missing AZURE_STORAGE_CONNECTION_STRING" };
    return;
  }

  const blobSvc = BlobServiceClient.fromConnectionString(conn);
  const container = blobSvc.getContainerClient(CONTAINER);
  const blob = container.getBlockBlobClient(BLOB);

  try {
    // Ensure container exists (no-op if already there)
    await container.createIfNotExists();

    const list = await readAll(blob); // [{ childCode, parentCode }, ...]

    if (method === "GET") {
      context.res = { status: 200, body: list };
      return;
    }

    if (method === "POST") {
      const childCode = req.body.child;
      const parentCode = req.body.parent;
      console.log(`Received request to add/update billing group: childCode=${childCode}, parentCode=${parentCode}`);
      const norm = (s) => String(s ?? "").trim();
      const normChild = norm(childCode);
      const normParent = norm(parentCode);

      if (!normChild || !normParent) {
        context.res = { status: 400, body: { error: "childCode and parentCode are required" } };
        return;
      }

      // Build lookup maps from current list
      const childToParent = new Map();
      const parentToChildren = new Map();

      for (const row of list) {
        const c = norm(row.childCode);
        const p = norm(row.parentCode);
        if (!c || !p) continue;

        childToParent.set(c, p);
        if (!parentToChildren.has(p)) parentToChildren.set(p, new Set());
        if (p !== c) parentToChildren.get(p).add(c); // only real children
      }

      const hasChildren = (code) => (parentToChildren.get(code)?.size ?? 0) > 0;
      const isChild = (code) => {
        const p = childToParent.get(code);
        return !!p && p !== code;
      };

      // RULE 1: If the target has children, it must bill to itself
      if (hasChildren(normChild) && normParent !== normChild) {
        context.res = {
          status: 409,
          body: {
            error: "This client has children and must be its own billing parent.",
            code: "PARENT_MUST_SELF",
            childCode: normChild,
          },
        };
        return;
      }

      // RULE 2: You cannot select a CHILD as the parent (unless self)
      if (isChild(normParent) && normParent !== normChild) {
        context.res = {
          status: 409,
          body: {
            error: "Selected billing client is itself a child and cannot be a parent.",
            code: "PARENT_CANNOT_BE_CHILD",
            parentCode: normParent,
          },
        };
        return;
      }

      // RULE 3: Prevent cycles (walk up from proposed parent; hitting child = cycle)
      const wouldCreateCycle = (() => {
        let cursor = normParent;
        const sentinel = normChild;
        let hops = 0;
        const MAX_HOPS = 1000;

        while (cursor && hops < MAX_HOPS) {
          if (cursor === sentinel) return true;
          const next = childToParent.get(cursor);
          if (!next || next === cursor) break; // root or self-root
          cursor = next;
          hops++;
        }
        return false;
      })();

      // Upsert mapping
      const idx = list.findIndex((i) => norm(i.childCode) === normChild);

      let result;
      if (idx !== -1) {
        list[idx] = { ...list[idx], childCode: normChild, parentCode: normParent };
        result = { status: "updated", item: list[idx] };
      } else {
        const newItem = { childCode: normChild, parentCode: normParent };
        list.push(newItem);
        result = { status: "created", item: newItem };
      }
      console.log(list);

      // Persist updated list to blob (overwrite)
      const json = JSON.stringify(list, null, 2);
      await blob.upload(Buffer.from(json), Buffer.byteLength(json), {
        blobHTTPHeaders: { blobContentType: "application/json" },
        overwrite: true, // v12 will overwrite when using upload with this option
      });

      context.res = { status: result.status === "created" ? 201 : 200, body: result };
      return;
    }

    // Method not allowed
    context.res = { status: 405, headers: { Allow: "GET, POST" }, body: "Method Not Allowed" };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err?.message || "Server error" };
  }
};

// Helpers
async function readAll(blobClient) {
  try {
    const dl = await blobClient.download();
    const buf = await streamToBuffer(dl.readableStreamBody);
    const text = buf.toString() || "[]";
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // If the blob doesn't exist yet, treat as empty list
    if (e.statusCode === 404) return [];
    throw e;
  }
}

function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (d) => chunks.push(d));
    readableStream.on("end", () => resolve(Buffer.concat(chunks)));
    readableStream.on("error", reject);
  });
}
