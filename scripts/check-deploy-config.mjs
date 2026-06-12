import { readFileSync } from "node:fs";

const wrangler = readFileSync("wrangler.toml", "utf8");
const headers = readFileSync("public/_headers", "utf8");
const failures = [];
const warnings = [];

const databaseId = wrangler.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1] || "";
const adminOrigin = wrangler.match(/^ADMIN_ORIGIN\s*=\s*"([^"]+)"/m)?.[1] || "";
const apiBase = process.env.VITE_API_BASE_URL || "";

if (!databaseId || databaseId === "REPLACE_WITH_D1_DATABASE_ID") {
  failures.push("wrangler.toml ainda esta com database_id placeholder.");
}

if (!adminOrigin || /localhost|127\.0\.0\.1/i.test(adminOrigin)) {
  failures.push("ADMIN_ORIGIN precisa ser a URL real do Cloudflare Pages antes do deploy.");
}

if (apiBase) {
  const origin = new URL(apiBase).origin;
  const csp = headers.match(/Content-Security-Policy:\s*(.+)/)?.[1] || "";
  if (!csp.includes(origin) && !csp.includes("https://*.workers.dev")) {
    failures.push(`public/_headers nao permite conexao com ${origin} em connect-src.`);
  }
}

if (headers.includes("connect-src 'self' https://*.workers.dev")) {
  warnings.push("CSP permite workers.dev para apoiar deploy separado. Em producao, prefira Worker no mesmo dominio do Pages.");
}

for (const warning of warnings) {
  console.warn(`WARN ${warning}`);
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
  }
  process.exit(1);
}

console.log("Deploy config OK.");
