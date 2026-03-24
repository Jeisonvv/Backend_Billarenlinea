import type { CookieOptions, Request, Response } from "express";

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME?.trim() || "auth_token";
const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type SameSitePolicy = "lax" | "strict" | "none";

function getSameSitePolicy(): SameSitePolicy {
  const configuredPolicy = process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();

  if (configuredPolicy === "lax" || configuredPolicy === "strict" || configuredPolicy === "none") {
    return configuredPolicy;
  }

  return "lax";
}

function shouldUseSecureCookie(sameSite: SameSitePolicy) {
  const configuredSecure = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();

  if (configuredSecure === "true") {
    return true;
  }

  if (configuredSecure === "false") {
    return false;
  }

  return sameSite === "none" || process.env.NODE_ENV === "production";
}

function buildBaseCookieOptions(): CookieOptions {
  const sameSite = getSameSitePolicy();
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();

  return {
    httpOnly: true,
    secure: shouldUseSecureCookie(sameSite),
    sameSite,
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

function parseCookieHeader(cookieHeader?: string) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const entry of cookieHeader.split(";")) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const name = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }

    cookies.set(name, decodeURIComponent(value));
  }

  return cookies;
}

export function extractAuthToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return parseCookieHeader(req.headers.cookie).get(AUTH_COOKIE_NAME) ?? null;
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...buildBaseCookieOptions(),
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, buildBaseCookieOptions());
}