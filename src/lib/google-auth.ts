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

export const authOptions: AuthOptions = {
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
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
