/// <reference types="@cloudflare/workers-types" />

import { DEFAULT_CONTENT } from "../src/content/defaultContent";
import {
  ALLOWED_MEDIA_TYPES,
  MAX_MEDIA_UPLOAD_REQUEST_SIZE,
  formatFileSize,
  maxFileSizeForMedia,
  mediaTypeFromMime,
  mediaTypeLabel,
} from "../src/media";
import type { ArtVariant, FeaturedItem, ImageOverlayStyle, MediaType, PortfolioItem, ProcessStep, SiteContent } from "../src/types";

type Env = {
  DB: D1Database;
  ASSETS: R2Bucket;
  ADMIN_PASSWORD_HASH: string;
  ADMIN_TOTP_SECRET: string;
  SESSION_SECRET: string;
  ADMIN_ORIGIN?: string;
};

type SessionPayload = {
  sub: "admin";
  iat: number;
  exp: number;
  aal: 2;
  twoFactorExp: number;
  csrf: string;
};

type ChallengePayload = {
  sub: "admin";
  iat: number;
  exp: number;
  stage: "password";
};

type RateLimitResult = {
  allowed: boolean;
  retryAfter?: number;
};

const SITE_ID = "main";
const SESSION_COOKIE = "tarso_admin";
const CHALLENGE_COOKIE = "tarso_admin_challenge";
const MAX_JSON_SIZE = 256 * 1024;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const TOTP_TTL_SECONDS = 24 * 60 * 60;
const CHALLENGE_TTL_SECONDS = 10 * 60;
const TRUSTED_PRODUCTION_ORIGINS = ["https://tarso-art.pages.dev"];
const IMAGE_ZOOM_MIN = 0.25;
const IMAGE_ZOOM_MAX = 3;
const TEXT_SCALE_MIN = 0.5;
const TEXT_SCALE_MAX = 3;
const FONT_WEIGHT_MIN = 100;
const FONT_WEIGHT_MAX = 900;
const DEFAULT_IMAGE_OVERLAY: ImageOverlayStyle = {
  textColor: "#ffffff",
  backgroundColor: "#111318",
  backgroundOpacity: 0,
  backgroundBlur: 0,
  textX: 5,
  textY: 88,
  textScale: 1,
  fontWeight: 400,
};
const PORTFOLIO_SPANS: Array<PortfolioItem["span"]> = ["s-a", "s-b", "s-c", "s-d", "s-e", "s-f", "s-g"];
const ART_VARIANTS: ArtVariant[] = ["ink", "graphite"];
const HERO_LAYOUTS: Array<SiteContent["hero"]["layout"]> = ["panels", "splash", "editorial"];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return withCors(request, env, preflight(request, env));
      }

      if (url.pathname === "/api/site" && request.method === "GET") {
        return withCors(request, env, json({ data: await readSiteContent(env) }));
      }

      if (url.pathname.startsWith("/api/assets/") && ["GET", "HEAD"].includes(request.method)) {
        return withCors(request, env, await serveAsset(request, url, env, request.method === "HEAD"));
      }

      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        const origin = enforceTrustedOrigin(request, env);
        if (origin) return withCors(request, env, origin);
        return withCors(request, env, await login(request, env));
      }

      if (url.pathname === "/api/admin/2fa/verify" && request.method === "POST") {
        const origin = enforceTrustedOrigin(request, env);
        if (origin) return withCors(request, env, origin);
        return withCors(request, env, await verifyChallengeTotp(request, env));
      }

      if (url.pathname === "/api/admin/2fa/setup" && request.method === "GET") {
        const origin = enforceTrustedOrigin(request, env);
        if (origin) return withCors(request, env, origin);
        return withCors(request, env, await getTotpSetup(request, env));
      }

      if (url.pathname === "/api/admin/2fa/setup/verify" && request.method === "POST") {
        const origin = enforceTrustedOrigin(request, env);
        if (origin) return withCors(request, env, origin);
        return withCors(request, env, await verifySetupTotp(request, env));
      }

      if (url.pathname === "/api/admin/2fa/refresh" && request.method === "POST") {
        const origin = enforceTrustedOrigin(request, env);
        if (origin) return withCors(request, env, origin);
        return withCors(request, env, await refreshTotp(request, env));
      }

      if (url.pathname === "/api/admin/logout" && request.method === "POST") {
        const response = json({ data: { ok: true } });
        clearAuthCookies(response, request);
        return withCors(request, env, response);
      }

      if (url.pathname === "/api/admin/me" && request.method === "GET") {
        return withCors(request, env, await me(request, env));
      }

      if (url.pathname === "/api/admin/site" && request.method === "PUT") {
        const guard = await requireFullSession(request, env, { csrf: true });
        if (guard.response) return withCors(request, env, guard.response);
        const limited = await checkRateLimit(request, env, "admin-write", 60, 60, 10 * 60);
        if (!limited.allowed) return withCors(request, env, rateLimitResponse(limited));
        return withCors(request, env, await saveSite(request, env));
      }

      if ((url.pathname === "/api/admin/media" || url.pathname === "/api/admin/images") && request.method === "POST") {
        const guard = await requireFullSession(request, env, { csrf: true });
        if (guard.response) return withCors(request, env, guard.response);
        const limited = await checkRateLimit(request, env, "admin-upload", 20, 10 * 60, 30 * 60);
        if (!limited.allowed) return withCors(request, env, rateLimitResponse(limited));
        return withCors(request, env, await uploadMedia(request, env));
      }

      return withCors(request, env, json({ error: "Not found" }, 404));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal error";
      await auditEvent(request, env, "server_error", false, message);
      return withCors(request, env, json({ error: "Internal error" }, 500));
    }
  },
};

async function readSiteContent(env: Env): Promise<SiteContent> {
  const row = await env.DB.prepare("SELECT data FROM site_content WHERE id = ?")
    .bind(SITE_ID)
    .first<{ data: string }>();

  if (!row?.data) return DEFAULT_CONTENT;
  try {
    return normalizeContent(JSON.parse(row.data) as SiteContent);
  } catch {
    return DEFAULT_CONTENT;
  }
}

async function saveSite(request: Request, env: Env): Promise<Response> {
  if (tooLarge(request, MAX_JSON_SIZE)) return json({ error: "Payload too large" }, 413);

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return json({ error: "Invalid content" }, 400);

  const content = normalizeContent(body);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO site_content (id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  )
    .bind(SITE_ID, JSON.stringify(content), now)
    .run();

  await auditEvent(request, env, "site_save", true);
  return json({ data: content });
}

async function uploadMedia(request: Request, env: Env): Promise<Response> {
  if (tooLarge(request, MAX_MEDIA_UPLOAD_REQUEST_SIZE)) {
    return json({ error: `Arquivo muito grande. Use videos de ate ${formatFileSize(maxFileSizeForMedia("video"))}.` }, 413);
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) return json({ error: "Missing file" }, 400);
  const mediaType = mediaTypeFromMime(file.type);
  if (!mediaType) {
    return json({ error: "Only PNG, JPEG, WebP, GIF, MP4 and WebM files are allowed" }, 400);
  }
  const maxSize = maxFileSizeForMedia(mediaType);
  if (file.size > maxSize) {
    return json({ error: `${mediaTypeLabel(mediaType)} muito grande. Use arquivo de ate ${formatFileSize(maxSize)}.` }, 400);
  }
  if (!ALLOWED_MEDIA_TYPES.includes(file.type as (typeof ALLOWED_MEDIA_TYPES)[number])) {
    return json({ error: "Only PNG, JPEG, WebP, GIF, MP4 and WebM files are allowed" }, 400);
  }

  const bytes = await file.arrayBuffer();
  if (!hasAllowedMediaSignature(new Uint8Array(bytes), file.type)) {
    await auditEvent(request, env, "media_upload_rejected", false, "bad_magic_bytes");
    return json({ error: "Invalid media file" }, 400);
  }

  const safeName = sanitizeFilename(file.name);
  const random = crypto.randomUUID().slice(0, 8);
  const key = `${Date.now()}-${random}-${safeName}`;

  await env.ASSETS.put(key, bytes, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
      contentDisposition: `inline; filename="${safeName}"`,
    },
    customMetadata: {
      filename: file.name,
      mediaType,
    },
  });

  const url = `/api/assets/${encodeURIComponent(key)}`;
  await env.DB.prepare(
    `INSERT INTO assets (key, filename, content_type, size, url, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(key, file.name, file.type, file.size, url, new Date().toISOString())
    .run();

  await auditEvent(request, env, "media_upload", true, key);
  return json({ data: { key, url, mediaType, contentType: file.type, size: file.size } });
}

async function serveAsset(request: Request, url: URL, env: Env, headOnly = false): Promise<Response> {
  const key = decodeURIComponent(url.pathname.replace("/api/assets/", ""));
  if (!key || key.includes("..") || key.includes("/") || key.includes("\\")) {
    return json({ error: "Missing asset key" }, 400);
  }

  const rangeHeader = request.headers.get("Range");
  const metadata = headOnly || rangeHeader ? await env.ASSETS.head(key) : null;
  if ((headOnly || rangeHeader) && !metadata) return json({ error: "Asset not found" }, 404);

  const headers = new Headers();
  headers.set("accept-ranges", "bytes");

  if (headOnly && metadata) {
    metadata.writeHttpMetadata(headers);
    headers.set("etag", metadata.httpEtag);
    headers.set("content-length", String(metadata.size));
    headers.set("cache-control", headers.get("cache-control") || "public, max-age=31536000, immutable");
    securityHeaders(headers, false);
    return new Response(null, { headers });
  }

  if (rangeHeader && metadata) {
    const range = parseRangeHeader(rangeHeader, metadata.size);
    if (!range) {
      headers.set("content-range", `bytes */${metadata.size}`);
      securityHeaders(headers, false);
      return new Response(null, { status: 416, headers });
    }

    const object = await env.ASSETS.get(key, { range: { offset: range.offset, length: range.length } });
    if (!object || !object.body) return json({ error: "Asset not found" }, 404);

    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("content-range", `bytes ${range.offset}-${range.end}/${metadata.size}`);
    headers.set("content-length", String(range.length));
    headers.set("cache-control", headers.get("cache-control") || "public, max-age=31536000, immutable");
    securityHeaders(headers, false);

    return new Response(object.body, { status: 206, headers });
  }

  const object = await env.ASSETS.get(key);
  if (!object || !object.body) return json({ error: "Asset not found" }, 404);

  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("content-length", String(object.size));
  headers.set("cache-control", headers.get("cache-control") || "public, max-age=31536000, immutable");
  securityHeaders(headers, false);

  return new Response(object.body, { headers });
}

async function login(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET || !env.ADMIN_TOTP_SECRET) {
    return json({ error: "Admin secrets are not configured" }, 500);
  }

  const limited = await checkRateLimit(request, env, "login", 5, 15 * 60, 30 * 60);
  if (!limited.allowed) return rateLimitResponse(limited);
  if (tooLarge(request, 2048)) return json({ error: "Payload too large" }, 413);

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const hash = await sha256Hex(body.password || "");

  if (!timingSafeEqual(hash, env.ADMIN_PASSWORD_HASH.toLowerCase())) {
    await auditEvent(request, env, "password_login", false);
    return json({ error: "Senha invalida" }, 401);
  }

  await resetRateLimit(request, env, "login");
  await auditEvent(request, env, "password_login", true);

  const now = Math.floor(Date.now() / 1000);
  const challenge = await signToken<ChallengePayload>(
    { sub: "admin", iat: now, exp: now + CHALLENGE_TTL_SECONDS, stage: "password" },
    env,
  );
  const response = json({
    data: {
      requires2fa: true,
      totpConfigured: await isTotpConfigured(env),
    },
  });
  response.headers.append("Set-Cookie", cookie(CHALLENGE_COOKIE, challenge, CHALLENGE_TTL_SECONDS, request));
  response.headers.append("Set-Cookie", expiredCookie(SESSION_COOKIE, request));
  return response;
}

async function getTotpSetup(request: Request, env: Env): Promise<Response> {
  const challenge = await readChallenge(request, env);
  if (!challenge) {
    return json({ error: "Etapa da senha expirada. Volte e entre novamente.", code: "PASSWORD_REQUIRED" }, 401);
  }
  if (!env.ADMIN_TOTP_SECRET) return json({ error: "TOTP secret is not configured" }, 500);

  const limited = await checkRateLimit(request, env, "totp-setup", 8, 10 * 60, 30 * 60);
  if (!limited.allowed) return rateLimitResponse(limited);

  if (await isTotpConfigured(env)) {
    return json({ error: "2FA setup already configured", code: "TOTP_ALREADY_CONFIGURED" }, 403);
  }

  await auditEvent(request, env, "totp_setup_view", true);
  return json({ data: totpSetupPayload(env.ADMIN_TOTP_SECRET) });
}

async function verifySetupTotp(request: Request, env: Env): Promise<Response> {
  const challenge = await readChallenge(request, env);
  if (!challenge) {
    return json({ error: "Etapa da senha expirada. Volte e entre novamente.", code: "PASSWORD_REQUIRED" }, 401);
  }

  if (await isTotpConfigured(env)) {
    return json({ error: "2FA setup already configured", code: "TOTP_ALREADY_CONFIGURED" }, 403);
  }

  const limited = await checkRateLimit(request, env, "totp-setup-verify", 6, 10 * 60, 30 * 60);
  if (!limited.allowed) return rateLimitResponse(limited);
  if (tooLarge(request, 2048)) return json({ error: "Payload too large" }, 413);

  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const ok = await verifyTotp(body.code || "", env.ADMIN_TOTP_SECRET);
  if (!ok) {
    await auditEvent(request, env, "totp_setup_verify", false);
    return json({ error: "Codigo 2FA invalido", code: "TOTP_INVALID" }, 401);
  }

  await markTotpConfigured(env);
  await resetRateLimit(request, env, "totp-setup-verify");
  await auditEvent(request, env, "totp_setup_verify", true);

  const response = await issueSession(request, env);
  response.headers.append("Set-Cookie", expiredCookie(CHALLENGE_COOKIE, request));
  return response;
}

async function verifyChallengeTotp(request: Request, env: Env): Promise<Response> {
  const challenge = await readChallenge(request, env);
  if (!challenge) {
    return json({ error: "Etapa da senha expirada. Volte e entre novamente.", code: "PASSWORD_REQUIRED" }, 401);
  }

  const limited = await checkRateLimit(request, env, "totp", 6, 10 * 60, 30 * 60);
  if (!limited.allowed) return rateLimitResponse(limited);
  if (tooLarge(request, 2048)) return json({ error: "Payload too large" }, 413);

  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const ok = await verifyTotp(body.code || "", env.ADMIN_TOTP_SECRET);
  if (!ok) {
    await auditEvent(request, env, "totp_verify", false);
    return json({ error: "Codigo 2FA invalido", code: "TOTP_INVALID" }, 401);
  }

  await resetRateLimit(request, env, "totp");
  await auditEvent(request, env, "totp_verify", true);

  const response = await issueSession(request, env);
  response.headers.append("Set-Cookie", expiredCookie(CHALLENGE_COOKIE, request));
  return response;
}

async function refreshTotp(request: Request, env: Env): Promise<Response> {
  const session = await readSession(request, env);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const limited = await checkRateLimit(request, env, "totp-refresh", 6, 10 * 60, 30 * 60);
  if (!limited.allowed) return rateLimitResponse(limited);
  if (tooLarge(request, 2048)) return json({ error: "Payload too large" }, 413);

  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const ok = await verifyTotp(body.code || "", env.ADMIN_TOTP_SECRET);
  if (!ok) {
    await auditEvent(request, env, "totp_refresh", false);
    return json({ error: "Codigo 2FA invalido", code: "TOTP_INVALID" }, 401);
  }

  await resetRateLimit(request, env, "totp-refresh");
  await auditEvent(request, env, "totp_refresh", true);
  return issueSession(request, env);
}

async function issueSession(request: Request, env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const csrf = randomToken();
  const session = await signToken<SessionPayload>(
    {
      sub: "admin",
      iat: now,
      exp: now + SESSION_TTL_SECONDS,
      aal: 2,
      twoFactorExp: now + TOTP_TTL_SECONDS,
      csrf,
    },
    env,
  );
  const response = json({
    data: {
      ok: true,
      csrfToken: csrf,
      twoFactorExpiresAt: new Date((now + TOTP_TTL_SECONDS) * 1000).toISOString(),
    },
  });
  response.headers.append("Set-Cookie", cookie(SESSION_COOKIE, session, SESSION_TTL_SECONDS, request));
  return response;
}

async function me(request: Request, env: Env): Promise<Response> {
  const session = await readSession(request, env);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const now = Math.floor(Date.now() / 1000);
  if (session.twoFactorExp <= now) {
    return json({ error: "2FA required", code: "TOTP_REQUIRED" }, 403);
  }

  return json({
    data: {
      ok: true,
      csrfToken: session.csrf,
      twoFactorExpiresAt: new Date(session.twoFactorExp * 1000).toISOString(),
    },
  });
}

async function isTotpConfigured(env: Env): Promise<boolean> {
  try {
    const row = await env.DB.prepare("SELECT value FROM admin_security WHERE key = ?")
      .bind("totp_configured_at")
      .first<{ value: string }>();
    return Boolean(row?.value);
  } catch {
    return false;
  }
}

async function markTotpConfigured(env: Env): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO admin_security (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind("totp_configured_at", now, now)
    .run();
}

function totpSetupPayload(secret: string): {
  issuer: string;
  account: string;
  secret: string;
  otpauthUrl: string;
} {
  const issuer = "TarsoArt";
  const account = "admin";
  const label = encodeURIComponent(`${issuer}:${account}`);
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });

  return {
    issuer,
    account,
    secret,
    otpauthUrl: `otpauth://totp/${label}?${query.toString()}`,
  };
}

async function requireFullSession(
  request: Request,
  env: Env,
  options: { csrf: boolean },
): Promise<{ session?: SessionPayload; response?: Response }> {
  const session = await readSession(request, env);
  if (!session) return { response: json({ error: "Unauthorized" }, 401) };

  const now = Math.floor(Date.now() / 1000);
  if (session.twoFactorExp <= now) {
    return { response: json({ error: "2FA required", code: "TOTP_REQUIRED" }, 403) };
  }

  if (options.csrf && request.headers.get("X-CSRF-Token") !== session.csrf) {
    await auditEvent(request, env, "csrf_rejected", false);
    return { response: json({ error: "CSRF token required", code: "CSRF_REQUIRED" }, 403) };
  }

  return { session };
}

async function readSession(request: Request, env: Env): Promise<SessionPayload | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifyToken<SessionPayload>(token, env);
  if (!payload || payload.sub !== "admin" || payload.aal !== 2 || !payload.csrf) return null;
  return payload;
}

async function readChallenge(request: Request, env: Env): Promise<ChallengePayload | null> {
  const token = readCookie(request, CHALLENGE_COOKIE);
  if (!token) return null;
  const payload = await verifyToken<ChallengePayload>(token, env);
  if (!payload || payload.sub !== "admin" || payload.stage !== "password") return null;
  return payload;
}

async function signToken<T extends Record<string, unknown>>(payload: T, env: Env): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const left = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = await hmac(left, env.SESSION_SECRET);
  return `${left}.${signature}`;
}

async function verifyToken<T>(token: string, env: Env): Promise<T | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expected = await hmac(`${header}.${payload}`, env.SESSION_SECRET);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const parsed = JSON.parse(textFromBase64Url(payload)) as T & { exp?: number };
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function checkRateLimit(
  request: Request,
  env: Env,
  scope: string,
  limit: number,
  windowSeconds: number,
  blockSeconds: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const key = await rateLimitKey(request, scope);
  const row = await env.DB.prepare(
    "SELECT window_start, count, blocked_until FROM rate_limits WHERE key = ?",
  )
    .bind(key)
    .first<{ window_start: number; count: number; blocked_until: number | null }>();

  if (row?.blocked_until && row.blocked_until > now) {
    return { allowed: false, retryAfter: row.blocked_until - now };
  }

  const windowStart = !row || now - row.window_start >= windowSeconds ? now : row.window_start;
  const count = !row || now - row.window_start >= windowSeconds ? 1 : row.count + 1;
  const blockedUntil = count > limit ? now + blockSeconds : null;

  await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count, blocked_until, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       window_start = excluded.window_start,
       count = excluded.count,
       blocked_until = excluded.blocked_until,
       updated_at = excluded.updated_at`,
  )
    .bind(key, windowStart, count, blockedUntil, now)
    .run();

  return blockedUntil ? { allowed: false, retryAfter: blockSeconds } : { allowed: true };
}

async function resetRateLimit(request: Request, env: Env, scope: string): Promise<void> {
  await env.DB.prepare("DELETE FROM rate_limits WHERE key = ?").bind(await rateLimitKey(request, scope)).run();
}

async function rateLimitKey(request: Request, scope: string): Promise<string> {
  return `${scope}:${await sha256Hex(clientIp(request))}`;
}

async function auditEvent(
  request: Request,
  env: Env,
  type: string,
  success: boolean,
  detail = "",
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO auth_events (id, type, success, ip_hash, user_agent, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        type,
        success ? 1 : 0,
        await sha256Hex(clientIp(request)),
        (request.headers.get("User-Agent") || "").slice(0, 240),
        detail.slice(0, 500),
        new Date().toISOString(),
      )
      .run();
  } catch {
    // Audit logging must never take down the admin API.
  }
}

function rateLimitResponse(result: RateLimitResult): Response {
  const response = json({ error: "Too many attempts", code: "RATE_LIMITED" }, 429);
  if (result.retryAfter) response.headers.set("Retry-After", String(result.retryAfter));
  return response;
}

async function verifyTotp(code: string, secret: string): Promise<boolean> {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  const nowStep = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -1; offset <= 1; offset += 1) {
    const expected = await totp(secret, nowStep + offset);
    if (timingSafeEqual(normalized, expected)) return true;
  }
  return false;
}

async function totp(secret: string, counter: number): Promise<string> {
  const keyBytes = base32Decode(secret);
  const keyMaterial = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength,
  ) as ArrayBuffer;
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter, false);

  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const hmacBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function base32Decode(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.toUpperCase().replace(/[\s=]/g, "");
  let bits = "";
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function hmac(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function base64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textFromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function sanitizeFilename(name: string): string {
  const fallback = "image";
  const safe = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);
  return safe || fallback;
}

function hasAllowedMediaSignature(bytes: Uint8Array, type: string): boolean {
  if (type === "image/png") {
    return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (type === "image/jpeg") {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/gif") {
    const header = String.fromCharCode(...bytes.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (type === "image/webp") {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    return riff === "RIFF" && webp === "WEBP";
  }
  if (type === "video/mp4") {
    return bytes.length > 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  }
  if (type === "video/webm") {
    const hasEbmlHeader = bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    const headerText = String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 512))).toLowerCase();
    return hasEbmlHeader && headerText.includes("webm");
  }
  return false;
}

function normalizeContent(input: unknown): SiteContent {
  const content = record(input);
  const branding = record(content.branding);
  const hero = record(content.hero);
  const portfolio = record(content.portfolio);
  const featured = record(content.featured);
  const about = record(content.about);
  const process = record(content.process);
  const commission = record(content.commission);
  const footer = record(content.footer);
  const titleLines = textList(hero.titleLines, DEFAULT_CONTENT.hero.titleLines, 6, 42);
  const heroMediaUrl = cleanImageUrl(hero.mainImageUrl);
  const aboutMediaUrl = cleanImageUrl(about.imageUrl);

  return {
    branding: {
      name: cleanText(branding.name, DEFAULT_CONTENT.branding.name, 40),
      tag: cleanText(branding.tag, DEFAULT_CONTENT.branding.tag, 40),
      instagramUrl: cleanUrl(branding.instagramUrl, DEFAULT_CONTENT.branding.instagramUrl),
      instagramHandle: cleanText(branding.instagramHandle, DEFAULT_CONTENT.branding.instagramHandle, 60),
      tiktokUrl: cleanUrl(branding.tiktokUrl, DEFAULT_CONTENT.branding.tiktokUrl),
      tiktokHandle: cleanText(branding.tiktokHandle, DEFAULT_CONTENT.branding.tiktokHandle, 60),
      email: cleanEmail(branding.email, DEFAULT_CONTENT.branding.email),
    },
    hero: {
      kicker: textList(hero.kicker, DEFAULT_CONTENT.hero.kicker, 3, 48),
      titleLines,
      strokeLineIndex: cleanInteger(hero.strokeLineIndex, DEFAULT_CONTENT.hero.strokeLineIndex, 0, titleLines.length - 1),
      subtitle: cleanText(hero.subtitle, DEFAULT_CONTENT.hero.subtitle, 240),
      tags: textList(hero.tags, DEFAULT_CONTENT.hero.tags, 12, 36),
      layout: oneOf(hero.layout, DEFAULT_CONTENT.hero.layout, HERO_LAYOUTS),
      mainImageUrl: heroMediaUrl,
      mainImageAlt: cleanOptionalText(hero.mainImageAlt, 120),
      mainMediaType: heroMediaUrl ? cleanMediaType(hero.mainMediaType, heroMediaUrl) : undefined,
      mainImagePlacement: cleanPlacement(hero.mainImagePlacement),
      mainImageOverlay: cleanOverlayStyle(hero.mainImageOverlay),
    },
    portfolio: {
      eyebrow: cleanText(portfolio.eyebrow, DEFAULT_CONTENT.portfolio.eyebrow, 80),
      title: cleanText(portfolio.title, DEFAULT_CONTENT.portfolio.title, 120),
      filters: textList(portfolio.filters, DEFAULT_CONTENT.portfolio.filters, 16, 42),
      items: normalizePortfolioItems(portfolio.items),
    },
    featured: {
      eyebrow: cleanText(featured.eyebrow, DEFAULT_CONTENT.featured.eyebrow, 80),
      title: cleanText(featured.title, DEFAULT_CONTENT.featured.title, 120),
      items: normalizeFeaturedItems(featured.items),
    },
    about: {
      eyebrow: cleanText(about.eyebrow, DEFAULT_CONTENT.about.eyebrow, 80),
      quote: cleanText(about.quote, DEFAULT_CONTENT.about.quote, 160),
      quoteMuted: cleanText(about.quoteMuted, DEFAULT_CONTENT.about.quoteMuted, 160),
      body: cleanText(about.body, DEFAULT_CONTENT.about.body, 1200),
      signature: cleanText(about.signature, DEFAULT_CONTENT.about.signature, 80),
      imageUrl: aboutMediaUrl,
      imageAlt: cleanOptionalText(about.imageAlt, 120),
      mediaType: aboutMediaUrl ? cleanMediaType(about.mediaType, aboutMediaUrl) : undefined,
      imagePlacement: cleanPlacement(about.imagePlacement),
      imageOverlay: cleanOverlayStyle(about.imageOverlay),
    },
    process: {
      eyebrow: cleanText(process.eyebrow, DEFAULT_CONTENT.process.eyebrow, 80),
      title: cleanText(process.title, DEFAULT_CONTENT.process.title, 120),
      steps: normalizeProcessSteps(process.steps),
    },
    commission: {
      availability: cleanText(commission.availability, DEFAULT_CONTENT.commission.availability, 100),
      title: cleanText(commission.title, DEFAULT_CONTENT.commission.title, 160),
      text: cleanText(commission.text, DEFAULT_CONTENT.commission.text, 600),
      successMessage: cleanText(commission.successMessage, DEFAULT_CONTENT.commission.successMessage, 180),
    },
    footer: {
      copyright: cleanText(footer.copyright, DEFAULT_CONTENT.footer.copyright, 160),
    },
  };
}

function normalizePortfolioItems(value: unknown): PortfolioItem[] {
  const source = Array.isArray(value) ? value : DEFAULT_CONTENT.portfolio.items;
  return source.slice(0, 36).map((item, index) => {
    const row = record(item);
    const fallback = DEFAULT_CONTENT.portfolio.items[index] || fallbackPortfolioItem(index);
    const mediaUrl = cleanImageUrl(row.imageUrl);
    return {
      id: cleanSlug(row.id, fallback.id),
      title: cleanText(row.title, fallback.title, 100),
      category: cleanText(row.category, fallback.category, 80),
      description: cleanText(row.description, fallback.description, 400),
      imageUrl: mediaUrl,
      imageAlt: cleanOptionalText(row.imageAlt, 120),
      mediaType: mediaUrl ? cleanMediaType(row.mediaType, mediaUrl) : undefined,
      imagePlacement: cleanPlacement(row.imagePlacement),
      imageOverlay: cleanOverlayStyle(row.imageOverlay),
      span: oneOf(row.span, fallback.span, PORTFOLIO_SPANS),
      variant: oneOf(row.variant, fallback.variant, ART_VARIANTS),
    };
  });
}

function normalizeFeaturedItems(value: unknown): FeaturedItem[] {
  const source = Array.isArray(value) ? value : DEFAULT_CONTENT.featured.items;
  return source.slice(0, 16).map((item, index) => {
    const row = record(item);
    const fallback = DEFAULT_CONTENT.featured.items[index] || fallbackFeaturedItem(index);
    const mediaUrl = cleanImageUrl(row.imageUrl);
    return {
      id: cleanSlug(row.id, fallback.id),
      number: cleanText(row.number, fallback.number, 8),
      category: cleanText(row.category, fallback.category, 80),
      title: cleanText(row.title, fallback.title, 120),
      description: cleanText(row.description, fallback.description, 600),
      imageUrl: mediaUrl,
      imageAlt: cleanOptionalText(row.imageAlt, 120),
      mediaType: mediaUrl ? cleanMediaType(row.mediaType, mediaUrl) : undefined,
      imagePlacement: cleanPlacement(row.imagePlacement),
      imageOverlay: cleanOverlayStyle(row.imageOverlay),
      variant: oneOf(row.variant, fallback.variant, ART_VARIANTS),
      meta: normalizeMeta(row.meta, fallback.meta),
    };
  });
}

function normalizeProcessSteps(value: unknown): ProcessStep[] {
  const source = Array.isArray(value) ? value : DEFAULT_CONTENT.process.steps;
  return source.slice(0, 12).map((step, index) => {
    const row = record(step);
    const fallback = DEFAULT_CONTENT.process.steps[index] || fallbackProcessStep(index);
    const mediaUrl = cleanImageUrl(row.imageUrl);
    return {
      id: cleanSlug(row.id, fallback.id),
      number: cleanText(row.number, fallback.number, 8),
      title: cleanText(row.title, fallback.title, 120),
      text: cleanText(row.text, fallback.text, 600),
      progress: cleanPercent(row.progress, fallback.progress),
      imageUrl: mediaUrl,
      imageAlt: cleanOptionalText(row.imageAlt, 120),
      mediaType: mediaUrl ? cleanMediaType(row.mediaType, mediaUrl) : undefined,
      imagePlacement: cleanPlacement(row.imagePlacement),
      imageOverlay: cleanOverlayStyle(row.imageOverlay),
      variant: oneOf(row.variant, fallback.variant, ART_VARIANTS),
    };
  });
}

function normalizeMeta(value: unknown, fallback: Array<{ label: string; value: string }>) {
  const source = Array.isArray(value) ? value : fallback;
  return source.slice(0, 8).map((item, index) => {
    const row = record(item);
    const fallbackRow = fallback[index] || { label: "Info", value: "" };
    return {
      label: cleanText(row.label, fallbackRow.label, 40),
      value: cleanText(row.value, fallbackRow.value, 120),
    };
  }).filter((item) => item.value);
}

function fallbackPortfolioItem(index: number): PortfolioItem {
  return {
    id: `work-${index + 1}`,
    title: `Trabalho ${index + 1}`,
    category: "Portfolio",
    description: "Descricao do trabalho",
    span: "s-b",
    variant: "ink",
  };
}

function fallbackFeaturedItem(index: number): FeaturedItem {
  return {
    id: `featured-${index + 1}`,
    number: String(index + 1).padStart(2, "0"),
    category: "Destaque",
    title: `Destaque ${index + 1}`,
    description: "Descricao do destaque",
    variant: "ink",
    meta: [],
  };
}

function fallbackProcessStep(index: number): ProcessStep {
  return {
    id: `step-${index + 1}`,
    number: String(index + 1).padStart(2, "0"),
    title: `Etapa ${index + 1}`,
    text: "Descricao da etapa",
    progress: "25%",
    variant: "graphite",
  };
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const source = typeof value === "string" ? value : fallback;
  const clean = source.replace(/\0/g, "").replace(/\r\n?/g, "\n").trim();
  return clean.slice(0, maxLength) || fallback;
}

function cleanOptionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\0/g, "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
  return clean || undefined;
}

function textList(value: unknown, fallback: string[], maxItems: number, maxLength: number): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const clean = source
    .slice(0, maxItems)
    .map((item) => cleanOptionalText(item, maxLength))
    .filter((item): item is string => Boolean(item));
  return clean.length ? clean : fallback.slice(0, maxItems);
}

function cleanUrl(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (!raw) return fallback;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    return fallback;
  }
  return fallback;
}

function cleanEmail(value: unknown, fallback: string): string {
  const clean = cleanText(value, fallback, 160);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : fallback;
}

function cleanImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  if (!clean || clean.length > 2048) return undefined;
  if (/^\/api\/assets\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+$/.test(clean) && !clean.includes("..")) return clean;
  try {
    const url = new URL(clean);
    if (
      url.protocol === "https:" &&
      /^\/api\/assets\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+$/.test(url.pathname) &&
      !url.pathname.includes("..") &&
      (url.hostname === "tarso-art.pages.dev" || url.hostname === "tarso-art.renanbuiatti14.workers.dev")
    ) {
      return url.pathname;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function cleanMediaType(value: unknown, url?: string): MediaType {
  if (value === "video" || value === "image") return value;
  return /\.(mp4|webm)(?:$|\?)/i.test(url || "") ? "video" : "image";
}

function cleanPlacement(value: unknown) {
  const row = record(value);
  if (!Object.keys(row).length) return undefined;
  return {
    x: cleanNumber(row.x, 50, 0, 100),
    y: cleanNumber(row.y, 50, 0, 100),
    zoom: cleanNumber(row.zoom, 1, IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX),
  };
}

function cleanOverlayStyle(value: unknown): ImageOverlayStyle | undefined {
  const row = record(value);
  if (!Object.keys(row).length) return undefined;
  return {
    textColor: cleanHexColor(row.textColor, DEFAULT_IMAGE_OVERLAY.textColor),
    backgroundColor: cleanHexColor(row.backgroundColor, DEFAULT_IMAGE_OVERLAY.backgroundColor),
    backgroundOpacity: cleanNumber(
      row.backgroundOpacity,
      DEFAULT_IMAGE_OVERLAY.backgroundOpacity,
      0,
      100,
    ),
    backgroundBlur: cleanNumber(row.backgroundBlur, DEFAULT_IMAGE_OVERLAY.backgroundBlur, 0, 30),
    textX: cleanNumber(row.textX, DEFAULT_IMAGE_OVERLAY.textX, 0, 100),
    textY: cleanNumber(row.textY, DEFAULT_IMAGE_OVERLAY.textY, 0, 100),
    textScale: cleanNumber(row.textScale, DEFAULT_IMAGE_OVERLAY.textScale, TEXT_SCALE_MIN, TEXT_SCALE_MAX),
    fontWeight: cleanInteger(row.fontWeight, DEFAULT_IMAGE_OVERLAY.fontWeight, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX),
  };
}

function cleanHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function cleanInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(cleanNumber(value, fallback, min, Math.max(min, max)));
}

function cleanPercent(value: unknown, fallback: string): string {
  const source = typeof value === "string" ? value : fallback;
  const match = source.match(/\d+/);
  const numeric = match ? Number(match[0]) : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return `${Math.min(100, Math.max(0, Math.round(numeric)))}%`;
}

function cleanSlug(value: unknown, fallback: string): string {
  const clean = cleanText(value, fallback, 80)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return clean || fallback;
}

function oneOf<T extends string>(value: unknown, fallback: T, allowed: T[]): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie") || "";
  const prefix = `${name}=`;
  return (
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) || null
  );
}

function clearAuthCookies(response: Response, request: Request): void {
  response.headers.append("Set-Cookie", expiredCookie(SESSION_COOKIE, request));
  response.headers.append("Set-Cookie", expiredCookie(CHALLENGE_COOKIE, request));
}

function cookie(name: string, value: string, maxAge: number, request: Request): string {
  return `${name}=${value}; HttpOnly; ${cookieSecurityPolicy(request)}; Path=/; Max-Age=${maxAge}`;
}

function expiredCookie(name: string, request: Request): string {
  return `${name}=; HttpOnly; ${cookieSecurityPolicy(request)}; Path=/; Max-Age=0`;
}

function cookieSecurityPolicy(request: Request): string {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const isCrossOriginAdmin = Boolean(origin && origin !== url.origin);

  if (url.protocol === "https:" && isCrossOriginAdmin) {
    return "SameSite=None; Secure";
  }

  return `SameSite=Strict${url.protocol === "https:" ? "; Secure" : ""}`;
}

function tooLarge(request: Request, limit: number): boolean {
  const length = Number(request.headers.get("Content-Length") || 0);
  return Number.isFinite(length) && length > limit;
}

function parseRangeHeader(header: string, size: number): { offset: number; length: number; end: number } | null {
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || header.includes(",")) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const length = Math.min(suffix, size);
    const offset = Math.max(0, size - length);
    return { offset, length, end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd) || start < 0 || requestedEnd < start || start >= size) {
    return null;
  }

  const end = Math.min(requestedEnd, size - 1);
  return { offset: start, length: end - start + 1, end };
}

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function json(body: unknown, status = 200): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  securityHeaders(headers, true);
  return new Response(JSON.stringify(body), { status, headers });
}

function preflight(request: Request, env: Env): Response {
  if (!isTrustedOrigin(request, env)) return json({ error: "Origin not allowed" }, 403);
  return new Response(null, { status: 204 });
}

function enforceTrustedOrigin(request: Request, env: Env): Response | null {
  return isTrustedOrigin(request, env) ? null : json({ error: "Origin not allowed" }, 403);
}

function isTrustedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return allowedOrigins(request, env).includes(origin);
}

function allowedOrigins(request: Request, env: Env): string[] {
  const sameOrigin = new URL(request.url).origin;
  const configured = (env.ADMIN_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return Array.from(new Set([sameOrigin, ...TRUSTED_PRODUCTION_ORIGINS, ...configured]));
}

function withCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get("Origin");
  const headers = new Headers(response.headers);

  if (origin && allowedOrigins(request, env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
  securityHeaders(headers, response.headers.get("Content-Type")?.includes("application/json") ?? false);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function securityHeaders(headers: Headers, noStore: boolean): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
  if (noStore) headers.set("Cache-Control", "no-store");
}
