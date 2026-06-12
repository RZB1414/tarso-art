import { DEFAULT_CONTENT } from "../content/defaultContent";
import type { ApiResult, SiteContent } from "../types";

const rawBase = import.meta.env.VITE_API_BASE_URL || "";
export const API_BASE = rawBase.replace(/\/$/, "");
const CSRF_STORAGE_KEY = "tarso_admin_csrf";

export type TotpSetup = {
  issuer: string;
  account: string;
  secret: string;
  otpauthUrl: string;
};

function readCsrfToken() {
  return sessionStorage.getItem(CSRF_STORAGE_KEY) || "";
}

function setCsrfToken(token?: string) {
  if (token) sessionStorage.setItem(CSRF_STORAGE_KEY, token);
}

function clearCsrfToken() {
  sessionStorage.removeItem(CSRF_STORAGE_KEY);
}

async function jsonRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  try {
    const csrf = readCsrfToken();
    const isAdminMutation = path.startsWith("/api/admin/") && !["GET", undefined].includes(init.method);
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(csrf && isAdminMutation ? { "X-CSRF-Token": csrf } : {}),
        ...(init.headers || {}),
      },
    });
    const data = (await response.json().catch(() => ({}))) as ApiResult<T>;
    if (!response.ok) {
      return { error: data.error || "Request failed", code: data.code, status: response.status };
    }
    const maybeCsrf = (data.data as { csrfToken?: string } | undefined)?.csrfToken;
    setCsrfToken(maybeCsrf);
    return data;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Network error" };
  }
}

export function resolveAssetUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|blob:)/.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function getSiteContent(): Promise<SiteContent> {
  const result = await jsonRequest<SiteContent>("/api/site");
  return result.data || DEFAULT_CONTENT;
}

export async function login(password: string) {
  clearCsrfToken();
  return jsonRequest<{ requires2fa: true; totpConfigured: boolean }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function get2faSetup() {
  return jsonRequest<TotpSetup>("/api/admin/2fa/setup");
}

export async function verify2fa(code: string) {
  return jsonRequest<{ ok: true; csrfToken: string; twoFactorExpiresAt: string }>("/api/admin/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function verify2faSetup(code: string) {
  return jsonRequest<{ ok: true; csrfToken: string; twoFactorExpiresAt: string }>("/api/admin/2fa/setup/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function refresh2fa(code: string) {
  return jsonRequest<{ ok: true; csrfToken: string; twoFactorExpiresAt: string }>("/api/admin/2fa/refresh", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function logout() {
  const result = await jsonRequest<{ ok: true }>("/api/admin/logout", { method: "POST" });
  clearCsrfToken();
  return result;
}

export async function getAdminSession() {
  return jsonRequest<{ ok: true; csrfToken: string; twoFactorExpiresAt: string }>("/api/admin/me");
}

export async function saveSiteContent(content: SiteContent) {
  return jsonRequest<SiteContent>("/api/admin/site", {
    method: "PUT",
    body: JSON.stringify(content),
  });
}

export async function uploadImage(file: File) {
  const form = new FormData();
  form.append("file", file);

  return jsonRequest<{ key: string; url: string }>("/api/admin/images", {
    method: "POST",
    body: form,
  });
}
