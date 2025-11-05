const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "container-bmssprod001";
const PREFIX = "htmlData/automatedBilling/drafts/billed/"; 
// expected file pattern: draftsBilled_MM.DD.YY.json

module.exports = async function (context, req) {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;

  // --- boot logs
  context.log("autoBillingBilled: start", {
    method: req.method,
    query: req.query,
    prefix: PREFIX,
    container: CONTAINER,
    hasConnString: !!conn
  });

  const blobSvc = BlobServiceClient.fromConnectionString(conn);
  const container = blobSvc.getContainerClient(CONTAINER);

  try {
    // ===== LIST MODE =====
    if (req.query.list) {
      const out = [];
      let seen = 0, matched = 0, skipped = 0;

      context.log("LIST: listing blobs with prefix:", PREFIX);
      for await (const b of container.listBlobsFlat({ prefix: PREFIX })) {
        seen++;
        const name = b.name;

        // match draftsBilled_MM.DD.YY.json
        const m = name.match(/draftsBilled_(\d{2})\.(\d{2})\.(\d{2})\.json$/i);
        if (!m) {
          skipped++;
          context.log(`LIST: skip (pattern mismatch): ${name}`);
          continue;
        }

        const [_, mm, dd, yy] = m;
        const yyyy = 2000 + Number(yy);
        const ymd  = `${yyyy}-${mm}-${dd}`;
        const label = `${Number(mm)}/${Number(dd)}/${yyyy}`;

        matched++;
        out.push({
          name,
          ymd,
          label,
          size: b.properties?.contentLength ?? null,
          lastModified: b.properties?.lastModified ?? null
        });

        context.log("LIST: matched", { name, ymd, size: b.properties?.contentLength });
      }

      out.sort((a, b) => (a.ymd < b.ymd ? 1 : a.ymd > b.ymd ? -1 : 0));

      context.log("LIST: done", { seen, matched, skipped, returned: out.length });
      context.res = { status: 200, body: out };
      return;
    }

        // ===== GET MODE =====
    // Supports a single date:  "2025-10-15"
    // or multiple dates:       "2025-09-15,2025-09-30"
    const dateParam = req.query.date;
    context.log("GET: requested date(s)", { dateParam });

    if (!dateParam) {
      context.res = {
        status: 400,
        body: "Missing query parameter: date=YYYY-MM-DD (or comma-separated list) or list=1"
      };
      return;
    }

    // Turn "2025-09-15,2025-09-30" or "'2025-09-15', '2025-09-30'" into ["2025-09-15","2025-09-30"]
    const ymdList = String(dateParam)
      .split(",")
      .map(s => s.replace(/['\s]/g, "")) // strip quotes + whitespace
      .filter(Boolean);

    if (!ymdList.length) {
      context.res = {
        status: 400,
        body: "No valid date values found in 'date' parameter"
      };
      return;
    }

    async function loadOneDate(ymd) {
      const [Y, M, D] = String(ymd).split("-");
      if (!Y || !M || !D) {
        throw new Error(`Invalid date format; expected YYYY-MM-DD, got: ${ymd}`);
      }

      // Build draftsBilled_MM.DD.YY.json
      const yy = String(Number(Y) % 100).padStart(2, "0");
      const mm = String(Number(M)).padStart(2, "0");
      const dd = String(Number(D)).padStart(2, "0");
      const blobName = `${PREFIX}draftsBilled_${mm}.${dd}.${yy}.json`;
      const blob = container.getBlockBlobClient(blobName);

      context.log("GET: resolved blob", { ymd, blobName, url: blob.url });

      const exists = await blob.exists();
      context.log("GET: exists?", { ymd, exists });

      if (!exists) {
        // Treat missing blob as empty array; don't hard-fail the whole request
        context.log("GET: blob not found, treating as []", { ymd, blobName });
        return [];
      }

      const props = await blob.getProperties();
      context.log("GET: properties", {
        ymd,
        contentLength: props.contentLength,
        contentType: props.contentType,
        lastModified: props.lastModified
      });

      let text = "[]";
      try {
        const dl = await blob.download();
        const bytes = await streamToBuffer(dl.readableStreamBody);
        text = bytes.toString("utf8") || "[]";
        context.log("GET: downloaded", { ymd, length: text.length });
      } catch (e) {
        context.log.error("GET: download/stream error", { ymd, error: e?.message || e });
        throw e;
      }

      try {
        const json = JSON.parse(text);
        const length = Array.isArray(json) ? json.length : (json ? 1 : 0);
        context.log("GET: JSON parsed ok", {
          ymd,
          arrayLength: length,
          type: typeof json
        });
        return Array.isArray(json) ? json : [json];
      } catch (e) {
        context.log.error("GET: JSON parse error", { ymd, error: e?.message || e });
        // bubble up so the outer catch returns a 502-style error
        throw new Error(
          `Invalid JSON in ${blobName} (${text.length} bytes). First 400 chars:\n` +
          text.slice(0, 400)
        );
      }
    }

    // Load all requested dates in parallel and flatten
    const allArrays = await Promise.all(ymdList.map(loadOneDate));
    const merged = allArrays.flat();

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: merged
    };
    return;

  } catch (err) {
    context.log.error("FATAL:", err?.message || err);
    const code = err.statusCode || 500;
    context.res = { status: code, body: err.message || String(err) };
  }
};

function streamToBuffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", d => chunks.push(d));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}