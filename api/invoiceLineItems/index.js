// api/invoiceLineItems/index.js

const { DefaultAzureCredential } = require("@azure/identity"); // (not used yet, kept for parity)

// Logic App endpoint (same workflow, different "type")
const invoiceLineItemsUrl =
  "https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/invoiceLineItems?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug";

// ---- helpers ---------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const toIsoYmd = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const jan1ThisYear = () => new Date(new Date().getFullYear(), 0, 1);
const todayLocal   = () => new Date();

const coerceIso = (v, fallbackDate) => {
  // Accept 'YYYY-MM-DD' or any Date-coercible value; return ISO yyyy-mm-dd
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v ? new Date(v) : fallbackDate;
  return toIsoYmd(isNaN(d) ? fallbackDate : d);
};

const buildDateRangeString = (startIso, endIso) => `'${startIso}' and '${endIso}'`;

// ----------------------------------------------------------------------------
module.exports = async function (context, req) {
  try {
    // read inputs from body (preferred) or query (fallback)
    const clientCode =
      (req.body?.clientCode ?? req.query?.clientCode ?? "").toString().trim();

    // Optional convenience: allow either explicit dateRange or start/end inputs
    const explicitRange = (req.body?.dateRange ?? req.query?.dateRange)?.toString().trim();

    let startIso, endIso, dateRange;
    if (explicitRange) {
      // assume already like:  '2024-01-01' and '2024-09-16'
      dateRange = explicitRange;
    } else {
      startIso = coerceIso(req.body?.startDate ?? req.query?.startDate, jan1ThisYear());
      endIso   = coerceIso(req.body?.endDate   ?? req.query?.endDate,   todayLocal());
      dateRange = buildDateRangeString(startIso, endIso);
    }

    if (!clientCode) {
      context.res = {
        status: 400,
        body: { error: "clientCode is required" },
      };
      return;
    }

    // Payload the Logic App expects
    const payload = { clientCode, dateRange };

    const resp = await fetch(invoiceLineItemsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Pass through Logic App response or surface a helpful error
    if (!resp.ok) {
      const text = await resp.text();
      context.res = {
        status: resp.status,
        body: { error: "Upstream error", status: resp.status, message: text },
      };
      return;
    }

    const data = await resp.json();
    context.res = {
      status: 200,
      body: data,
    };
  } catch (err) {
    context.log.error("invoiceLineItems handler failed:", err);
    context.res = {
      status: 500,
      body: { error: "Internal server error", message: err?.message ?? String(err) },
    };
  }
};
