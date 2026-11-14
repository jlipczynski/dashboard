// SERVER-ONLY. Google OAuth tokens (Gmail/Drive) never leave the server:
// - they live in the encrypted NextAuth JWT (httpOnly cookie, JWE),
// - they are NOT exposed in the session (/api/auth/session),
// - they are never logged.
// Do not import this file in client components.
import { createHash } from "crypto"
import { getToken, type JWT } from "next-auth/jwt"
import type { NextRequest } from "next/server"

// Treat the token as expired 60 s early, so it does not expire mid-request.
const EXPIRY_SKEW_MS = 60_000

export type RefreshResult =
  | { ok: true; accessToken: string; accessTokenExpires: number; refreshToken?: string }
  | { ok: false; error: string }

type CacheEntry = { accessToken: string; accessTokenExpires: number; refreshToken?: string }

// Per-instance cache and in-flight deduplication of refreshes.
// The key is a hash of the refresh token (never the token itself).
// Effect: N parallel requests with an expired token = 1 call to Google per instance.
const refreshCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<RefreshResult>>()

function keyFor(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex")
}

export function isAccessTokenValid(expires: number | undefined, now = Date.now()): boolean {
  return typeof expires === "number" && now < expires - EXPIRY_SKEW_MS
}

async function callGoogleRefresh(refreshToken: string): Promise<RefreshResult> {
  try {
    // Data in the POST body (application/x-www-form-urlencoded), NOT in the URL.
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })
    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string
      expires_in?: number
      refresh_token?: string
      error?: string
    }
    if (!response.ok || !data.access_token) {
      // Log only the HTTP status and the Google error code (e.g. "invalid_grant") — no tokens.
      console.error("[google-token] refresh failed:", response.status, data.error ?? "unknown_error")
      return { ok: false, error: "RefreshAccessTokenError" }
    }
    return {
      ok: true,
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + (data.expires_in ?? 3600) * 1000,
      refreshToken: data.refresh_token,
    }
  } catch (e) {
    console.error("[google-token] refresh failed:", e instanceof Error ? e.name : "unknown_error")
    return { ok: false, error: "RefreshAccessTokenError" }
  }
}

// Refresh with cache and deduplication. Used by both the NextAuth jwt callback and getGoogleAccessToken().
export async function refreshGoogleAccessToken(refreshToken: string): Promise<RefreshResult> {
  const key = keyFor(refreshToken)

  const cached = refreshCache.get(key)
  if (cached && isAccessTokenValid(cached.accessTokenExpires)) {
    return { ok: true, ...cached }
  }

  const pending = inFlight.get(key)
  if (pending) return pending

  const p = callGoogleRefresh(refreshToken)
    .then((result) => {
      if (result.ok) {
        refreshCache.set(key, {
          accessToken: result.accessToken,
          accessTokenExpires: result.accessTokenExpires,
          refreshToken: result.refreshToken,
        })
      } else {
        refreshCache.delete(key)
      }
      return result
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

// Google access token for the current request (route handlers only).
// Returns null when the user is not logged in through Google or the refresh failed.
export async function getGoogleAccessToken(req: NextRequest): Promise<string | null> {
  const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as JWT | null
  if (!token) return null

  if (token.accessToken && isAccessTokenValid(token.accessTokenExpires)) {
    return token.accessToken
  }
  if (!token.refreshToken) return null

  const refreshed = await refreshGoogleAccessToken(token.refreshToken)
  return refreshed.ok ? refreshed.accessToken : null
}

// For tests only.
export function __resetGoogleTokenCacheForTests() {
  refreshCache.clear()
  inFlight.clear()
}
