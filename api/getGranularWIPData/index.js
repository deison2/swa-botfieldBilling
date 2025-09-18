// api/granularWipData/index.js

// Logic App endpoint (POST, no body)
const granularWIPDataUrl = "https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/granularWIPData?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug";

module.exports = async function (context, req) {
  try {
    // POST with no body
    const resp = await fetch(granularWIPDataUrl, { method: "POST" });

    if (!resp.ok) {
      throw new Error(`Logic App responded ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: data,
    };
  } catch (err) {
    context.log.error("Failed to fetch granular WIP data:", err.message);
    context.res = {
      status: 502,
      headers: { "Content-Type": "application/json" },
      body: { error: "Failed to fetch granular WIP data." },
    };
  }
};
