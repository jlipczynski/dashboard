import type { AuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

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

// Debug: log what NextAuth will use as callback URL
console.log("[AUTH DEBUG]", {
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  VERCEL_URL: process.env.VERCEL_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  computed_callback: `${process.env.NEXTAUTH_URL}/api/auth/callback/google`,
})

async function refreshAccessToken(token: any) {
  try {
    const url =
      "https://oauth2.googleapis.com/token?" +
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      })

    const response = await fetch(url, { method: "POST" })
    const refreshedTokens = await response.json()

    if (!response.ok) throw refreshedTokens

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    }
  } catch (error) {
    console.error("[AUTH] Failed to refresh access token", error)
    return { ...token, error: "RefreshAccessTokenError" }
  }
}

export const authOptions: AuthOptions = {
  debug: true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // First login — save tokens
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + (account.expires_in as number) * 1000,
        }
      }
      // Token still valid
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token
      }
      // Token expired — refresh
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.error = token.error as string | undefined
      return session
    },
  },
  logger: {
    error(code, metadata) {
      console.error("[NEXTAUTH ERROR]", code, JSON.stringify(metadata, null, 2))
    },
    warn(code) {
      console.warn("[NEXTAUTH WARN]", code)
    },
    debug(code, metadata) {
      console.log("[NEXTAUTH DEBUG]", code, JSON.stringify(metadata, null, 2))
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
