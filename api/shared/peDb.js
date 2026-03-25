// api/shared/peDb.js — Practice Engine SQL connection pool singleton
const sql = require("mssql");
const { ConfidentialClientApplication } = require("@azure/msal-node");

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.PE_SQL_AAD_CLIENT_ID;
const clientSecret = process.env.PE_SQL_AAD_CLIENT_SECRET;
const userName = process.env.PE_SQL_USER;
const password = process.env.PE_SQL_PASSWORD;

const msalClient = new ConfidentialClientApplication({
  auth: {
    clientId,
    clientSecret,
    authority: `https://login.microsoftonline.com/${tenantId}`,
  },
});

async function getAadToken() {
  const result = await msalClient.acquireTokenByUsernamePassword({
    scopes: ["https://database.windows.net/.default"],
    username: userName,
    password: password,
  });
  return result.accessToken;
}

const config = {
  server: process.env.PE_SQL_SERVER,
  database: process.env.PE_SQL_DATABASE,
  port: process.env.PE_SQL_PORT ? parseInt(process.env.PE_SQL_PORT) : 1433,
  authentication: {
    type: "azure-active-directory-access-token",
    options: {
      token: null, // set dynamically before connecting
    },
  },
  options: { encrypt: true, trustServerCertificate: false },
  pool: { min: 0, max: 10, idleTimeoutMillis: 30000 },
};

let pool;

async function getPool() {
  if (!pool) {
    // Acquire an AAD token for Azure SQL via ROPC flow
    config.authentication.options.token = await getAadToken();

    // Use a named ConnectionPool to avoid colliding with the billing db's global pool
    pool = new sql.ConnectionPool(config);
    pool.on("error", (err) => {
      console.error("PE SQL pool error:", err);
      pool = null;
    });
    await pool.connect();
  }
  return pool;
}

async function query(text, params = {}) {
  const p = await getPool();
  const req = p.request();
  for (const [name, val] of Object.entries(params)) {
    if (val && typeof val === "object" && val.type) {
      req.input(name, val.type, val.value);
    } else {
      req.input(name, val);
    }
  }
  return req.query(text);
}

module.exports = { sql, getPool, query };
