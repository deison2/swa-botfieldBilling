// /api/myPhoto/index.js
// Azure Functions (Node 18+) — uses global fetch (no node-fetch)

module.exports = async function (context, req) {
  context.log("[myPhoto] invoked");

  // --- Extract signed-in user's email from SWA header ---
  let email = null;
  try {
    const b64 = req.headers["x-ms-client-principal"];
    if (b64) {
      const principal = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
      email = principal?.userDetails?.toLowerCase?.() || null;
    }
  } catch (e) {
    context.log("[myPhoto] principal parse error", e);
  }

  if (!email) {
    context.log("[myPhoto] no email on request");
    context.res = { status: 401, body: "Unauthorized" };
    return;
  }

  // --- Required env vars ---
  const tenant       = process.env.AZURE_TENANT_ID;
  const clientId     = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenant || !clientId || !clientSecret) {
    context.log("[myPhoto] missing env vars", {
      hasTenant: !!tenant,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret
    });
    context.res = {
      status: 500,
      headers: { "x-photo-status": "config-missing" },
      body: "Server not configured"
    };
    return;
  }

  // --- Optional quick diagnostics: /api/myPhoto?diag=env ---
  if ((req.query.diag || "").toString() === "env") {
    context.res = {
      status: 200,
      headers: { "Cache-Control": "no-store" },
      body: {
        hasTenant: !!tenant,
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        email
      }
    };
    return;
  }

  try {
    // ---- Acquire app-only token for Microsoft Graph ----
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials"
      })
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text().catch(() => "");
      context.log("[myPhoto] token error", tokenRes.status, t.slice(0, 300));
      context.res = {
        status: 500,
        headers: { "x-photo-status": "token-failed" },
        body: "Token acquisition failed"
      };
      return;
    }

    const { access_token } = await tokenRes.json();

    // ---- Build Graph photo URL ----
    // Default:  /users/{id}/photo/$value
    // Sized:    /users/{id}/photos/{size}/$value  (note plural 'photos')
    const allowed = new Set(["48x48", "64x64", "96x96", "120x120", "240x240"]);
    const s = (req.query.size || "").trim();
    const size = allowed.has(s) ? s : "";

    const path = size ? `photos/${size}/$value` : "photo/$value";
    const url  = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/${path}`;

    const g = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    context.log("[myPhoto] graph status", g.status, "user", email);

    if (g.status === 404) {
      // No photo for this user → graceful fallback on the client
      context.res = {
        status: 204,
        headers: {
          "Cache-Control": "no-store",
          "x-photo-status": "not-found",
          "x-graph-status": "404"
        }
      };
      return;
    }

    if (!g.ok) {
      const body = await g.text().catch(() => "");
      context.log("[myPhoto] graph error body", body.slice(0, 300));
      context.res = {
        status: 502,
        headers: { "x-photo-status": "graph-error", "x-graph-status": String(g.status) },
        body: "Graph photo fetch failed"
      };
      return;
    }

    const buf = Buffer.from(await g.arrayBuffer());

    // Cache a bit to avoid hammering Graph; adjust as needed.
    context.res = {
      status: 200,
      isRaw: true,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=1800",
        "x-photo-status": "ok",
        "x-graph-status": String(g.status)
      },
      body: buf
    };
  } catch (err) {
    context.log("[myPhoto] unexpected error", err);
    context.res = {
      status: 500,
      headers: { "x-photo-status": "exception" },
      body: "Unexpected error"
    };
  }
};