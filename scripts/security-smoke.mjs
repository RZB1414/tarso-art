import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const baseUrl = (process.env.SECURITY_TEST_BASE_URL || "http://127.0.0.1:5174").replace(/\/$/, "");
const apiBaseUrl = (process.env.SECURITY_TEST_API_BASE_URL || baseUrl).replace(/\/$/, "");
const password = process.env.ADMIN_TEST_PASSWORD;
const pentest = process.argv.includes("--pentest");

if (!password) {
  console.error("Set ADMIN_TEST_PASSWORD in the environment before running security tests.");
  process.exit(1);
}

function readDevVars() {
  try {
    return Object.fromEntries(
      readFileSync(".dev.vars", "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
  } catch {
    return {};
  }
}

const totpSecret = process.env.ADMIN_TOTP_SECRET || readDevVars().ADMIN_TOTP_SECRET;
if (!totpSecret) {
  console.error("ADMIN_TOTP_SECRET is required for security tests.");
  process.exit(1);
}

class CookieJar {
  value = "";

  store(response) {
    const setCookie = response.headers.getSetCookie?.() || [];
    const fallback = response.headers.get("set-cookie");
    const cookies = setCookie.length ? setCookie : fallback ? [fallback] : [];
    const current = new Map(
      this.value
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const index = item.indexOf("=");
          return [item.slice(0, index), item.slice(index + 1)];
        }),
    );

    for (const cookie of cookies) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      const key = pair.slice(0, index);
      const val = pair.slice(index + 1);
      if (!val) current.delete(key);
      else current.set(key, val);
    }
    this.value = Array.from(current.entries()).map(([key, val]) => `${key}=${val}`).join("; ");
  }

  headers(extra = {}) {
    return this.value ? { ...extra, Cookie: this.value } : extra;
  }
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.toUpperCase().replace(/[\s=]/g, "");
  let bits = "";
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(counter, 4);
  const hmac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function request(path, options = {}, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: jar?.headers(options.headers || {}) || options.headers,
  });
  jar?.store(response);
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { response, body };
}

async function requestAbsolute(base, path, options = {}, jar) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: jar?.headers(options.headers || {}) || options.headers,
  });
  jar?.store(response);
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { response, body };
}

function assert(condition, label, details = "") {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`PASS ${label}`);
}

const jar = new CookieJar();

let result = await request("/api/admin/me");
assert(result.response.status === 401, "unauthenticated /me is blocked");

result = await request("/api/admin/2fa/setup");
assert(result.response.status === 401, "unauthenticated 2FA setup is blocked");

result = await request("/api/admin/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.12" },
  body: JSON.stringify({ password: "wrong-password" }),
});
assert(result.response.status === 401, "wrong password is rejected");

result = await request("/api/admin/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.13" },
  body: JSON.stringify({ password }),
}, jar);
assert(result.response.status === 200 && result.body.data?.requires2fa, "password step requires 2FA");

result = await request("/api/admin/2fa/setup", {}, jar);
assert(
  (result.response.status === 200 && result.body.data?.secret && result.body.data?.otpauthUrl) ||
    (result.response.status === 403 && result.body.code === "TOTP_ALREADY_CONFIGURED"),
  "2FA setup is password-gated and one-time",
);

if (result.response.status === 200) {
  result = await request("/api/admin/2fa/setup/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.16" },
    body: JSON.stringify({ code: "000000" }),
  }, jar);
  assert(result.response.status === 401, "wrong setup 2FA code is rejected");
}

result = await request("/api/admin/site", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
}, jar);
assert(result.response.status === 401, "password-only challenge cannot write admin content");

result = await request("/api/admin/2fa/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.14" },
  body: JSON.stringify({ code: "000000" }),
}, jar);
assert(result.response.status === 401, "wrong 2FA code is rejected");

result = await request("/api/admin/2fa/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.15" },
  body: JSON.stringify({ code: totp(totpSecret) }),
}, jar);
assert(result.response.status === 200 && result.body.data?.csrfToken, "valid 2FA creates full session and CSRF token");

const csrf = result.body.data.csrfToken;

result = await request("/api/admin/me", {}, jar);
assert(result.response.status === 200 && result.body.data?.csrfToken, "authenticated /me returns CSRF token");

const site = await request("/api/site");
result = await request("/api/admin/site", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(site.body.data),
}, jar);
assert(result.response.status === 403 && result.body.code === "CSRF_REQUIRED", "write without CSRF is blocked");

result = await request("/api/admin/site", {
  method: "PUT",
  headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
  body: JSON.stringify(site.body.data),
}, jar);
assert(result.response.status === 200, "write with CSRF succeeds");

const form = new FormData();
form.append("file", new Blob([Buffer.from("not actually png")], { type: "image/png" }), "fake.png");
result = await request("/api/admin/images", {
  method: "POST",
  headers: { "X-CSRF-Token": csrf },
  body: form,
}, jar);
assert(result.response.status === 400, "fake image upload is rejected by magic bytes");

const videoForm = new FormData();
videoForm.append("file", new Blob([Buffer.from("not actually mp4")], { type: "video/mp4" }), "fake.mp4");
result = await request("/api/admin/media", {
  method: "POST",
  headers: { "X-CSRF-Token": csrf },
  body: videoForm,
}, jar);
assert(result.response.status === 400, "fake video upload is rejected by magic bytes");

if (pentest) {
  result = await request("/api/assets/..%2Fworker%2Findex.ts");
  assert(result.response.status === 400 || result.response.status === 404, "asset traversal probe is blocked");

  const malicious = structuredClone(site.body.data);
  malicious.branding.instagramUrl = "javascript:alert(1)";
  malicious.branding.tiktokUrl = "data:text/html,owned";
  malicious.hero.mainImageUrl = "data:image/svg+xml,<svg></svg>";
  malicious.hero.mainMediaType = "video";
  malicious.hero.tags = Array.from({ length: 50 }, (_, index) => `tag-${index}`);
  result = await request("/api/admin/site", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify(malicious),
  }, jar);
  assert(result.response.status === 200, "malicious content payload is normalized, not crashed");
  assert(!result.body.data.branding.instagramUrl.startsWith("javascript:"), "javascript social URL is stripped");
  assert(!result.body.data.branding.tiktokUrl.startsWith("data:"), "data social URL is stripped");
  assert(!result.body.data.hero.mainImageUrl, "data image URL is stripped");
  assert(result.body.data.hero.tags.length <= 12, "oversized tag list is capped");

  result = await request("/api/admin/site", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify(site.body.data),
  }, jar);
  assert(result.response.status === 200, "site content is restored after normalization probe");

  result = await requestAbsolute(apiBaseUrl, "/api/admin/login", {
    method: "OPTIONS",
    headers: {
      Origin: "https://evil.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Content-Type",
    },
  });
  assert(result.response.status === 403, "untrusted CORS preflight is blocked");
}

console.log("Security smoke tests completed.");
