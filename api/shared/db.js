// api/shared/db.js — SQL connection pool singleton
const sql = require("mssql");

const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  port: process.env.AZURE_SQL_PORT ? parseInt(process.env.AZURE_SQL_PORT) : 1433,
  options: { encrypt: true, trustServerCertificate: false },
  pool: { min: 0, max: 10, idleTimeoutMillis: 30000 },
};

let pool;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    pool.on("error", (err) => {
      console.error("SQL pool error:", err);
      pool = null;
    });
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
