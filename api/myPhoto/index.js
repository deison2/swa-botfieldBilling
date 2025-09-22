// /api/myPhoto/index.js
// Azure Functions (Node 18+): uses global fetch

// --- Silhouette fallback (mint circle + white ring + teal avatar) ---
function silhouetteSvg(size = 120) {
  const ring = "#ffffff";   // white ring to match sidebar avatar
  const bg   = "#cfe9e4";   // mint
  const fg   = "#063941";   // deep teal

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#dff0ed"/>
      <stop offset="100%" stop-color="#b2d7d0"/>
    </linearGradient>
  </defs>

  <!-- backdrop + ring to mirror botfield/keithbot -->
  <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="url(#grad)"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${bg}" />
  <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="none" stroke="${ring}" stroke-width="2"/>

  <!-- your 24x24 silhouette scaled to center -->
  <g opacity="0.9" transform="translate(${size*0.5 - 12}, ${size*0.5 - 12})" fill="${fg}">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-3.314 3.134-6 8-6s8 2.686 8 6H4z"/>
  </g>
</svg>`.trim();
}

// Parse ?size=... supporting "64x64" or "120"
function parseSize(qsSize) {
  if (!qsSize) return 120;
  const m = String(qsSize).match(/(\d{2,3})/); // pull first 2-3 digit group
  const n = m ? parseInt(m[1], 10) : 120;
  return Math.max(48, Math.min(n, 512));
}

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
    // Still return a friendly fallback so the UI never shows a blank
    const size = parseSize(req.query.size);
    context.res = {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "x-photo-status": "unauthorized-fallback"
      },
      body: silhouetteSvg(size)
    };
    return;
  }

  // --- Required env vars ---
  const tenant       = process.env.AZURE_TENANT_ID;
  const clientId     = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  // Quick diagnostics: /api/myPhoto?diag=env
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

  // If config missing, serve fallback so avatar is never empty
  if (!tenant || !clientId || !clientSecret) {
    context.log("[myPhoto] missing env vars", {
      hasTenant: !!tenant,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret
    });
    const size = parseSize(req.query.size);
    context.res = {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "x-photo-status": "config-missing-fallback"
      },
      body: silhouetteSvg(size)
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
      const size = parseSize(req.query.size);
      context.res = {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "no-store",
          "x-photo-status": "token-fallback"
        },
        body: silhouetteSvg(size)
      };
      return;
    }

    const { access_token } = await tokenRes.json();

    // ---- Build Graph photo URL ----
    // Default:  /users/{id}/photo/$value
    // Sized:    /users/{id}/photos/{size}/$value  (note plural 'photos')
    const allowed = new Set(["48x48", "64x64", "96x96", "120x120", "240x240"]);
    const s = (req.query.size || "").trim();
    const sizeParam = allowed.has(s) ? s : "";
    const path = sizeParam ? `photos/${sizeParam}/$value` : "photo/$value";
    const url  = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/${path}`;

    const g = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    context.log("[myPhoto] graph status", g.status, "user", email);

    // --- Fallbacks ---
    if (g.status === 404) {
      const size = parseSize(req.query.size);
      context.res = {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=600",
          "x-photo-status": "not-found-fallback",
          "x-graph-status": "404"
        },
        body: silhouetteSvg(size)
      };
      return;
    }

    if (!g.ok) {
      const body = await g.text().catch(() => "");
      context.log("[myPhoto] graph error body", body.slice(0, 300));
      const size = parseSize(req.query.size);
      context.res = {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "no-store",
          "x-photo-status": "graph-error-fallback",
          "x-graph-status": String(g.status)
        },
        body: silhouetteSvg(size)
      };
      return;
    }

    // --- Success: return JPEG stream ---
    const buf = Buffer.from(await g.arrayBuffer());
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
    const size = parseSize(req.query.size);
    context.res = {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "x-photo-status": "exception-fallback"
      },
      body: silhouetteSvg(size)
    };
  }
};