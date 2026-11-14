import type { AuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { refreshGoogleAccessToken, isAccessTokenValid } from "@/lib/google-token"

// Ensure NEXTAUTH_URL is set on Vercel even if not configured in dashboard.
// Without this, NextAuth falls back to VERCEL_URL which is a deployment-specific
// URL (e.g. dashboard-abc123.vercel.app) instead of the production domain,
// causing redirect_uri_mismatch with Google OAuth.
if (!process.env.NEXTAUTH_URL) {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  } else if (process.env.VERCEL_URL) {
    process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`
  }
}

function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const allowed = getAllowedEmails()
  if (allowed.length === 0) return false // no allowlist = deny all
  return allowed.includes((email ?? "").toLowerCase())
}

// Logs NOTHING from NextAuth metadata: its debug/error payloads contain tokens,
// the client secret, cookies and profile data. We keep only the code and the error name/message.
function safeErrorSummary(metadata: unknown): string {
  const m = metadata as { error?: { name?: string; message?: string }; name?: string; message?: string } | undefined
  const err = m?.error ?? m
  const name = typeof err?.name === "string" ? err.name : ""
  const message = typeof err?.message === "string" ? err.message.slice(0, 200) : ""
  return [name, message].filter(Boolean).join(": ")
}

export const authOptions: AuthOptions = {
  debug: false,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      return isEmailAllowed(user.email)
    },
    async jwt({ token, account }) {
      // First login — keep the tokens ONLY in the encrypted JWT (cookie).
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + (account.expires_in as number) * 1000,
          error: undefined,
        }
      }
      // Token still valid
      if (isAccessTokenValid(token.accessTokenExpires)) {
        return token
      }
      if (!token.refreshToken) {
        return { ...token, error: "RefreshAccessTokenError" }
      }
      // Token expired — refresh (shared mechanism with cache/deduplication)
      const refreshed = await refreshGoogleAccessToken(token.refreshToken)
      if (!refreshed.ok) {
        return { ...token, error: refreshed.error }
      }
      return {
        ...token,
        accessToken: refreshed.accessToken,
        accessTokenExpires: refreshed.accessTokenExpires,
        refreshToken: refreshed.refreshToken ?? token.refreshToken,
        error: undefined,
      }
    },
    async session({ session, token }) {
      // NEVER put Google tokens in the session — it goes to the browser (/api/auth/session).
      // Routes fetch the token on the server: getGoogleAccessToken(req) in lib/google-token.ts.
      session.googleConnected = !!token.refreshToken && !token.error
      session.error = token.error as string | undefined
      return session
    },
  },
  logger: {
    error(code, metadata) {
      console.error("[NEXTAUTH ERROR]", code, safeErrorSummary(metadata))
    },
    warn(code) {
      console.warn("[NEXTAUTH WARN]", code)
    },
    // Must be an explicit no-op: a custom logger.debug in NextAuth v4 overrides debug:false
    // (next-auth/utils/logger.js) and used to log tokens and the client secret.
    debug() {},
  },
  secret: process.env.NEXTAUTH_SECRET,
}
