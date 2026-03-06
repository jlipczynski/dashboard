import { NextResponse } from "next/server"

export async function GET() {
  const nextAuthUrl = process.env.NEXTAUTH_URL
  const callbackUrl = `${nextAuthUrl}/api/auth/callback/google`

  // Build the exact Google OAuth URL that NextAuth would generate
  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  googleAuthUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID || "(not set)")
  googleAuthUrl.searchParams.set("redirect_uri", callbackUrl)
  googleAuthUrl.searchParams.set("response_type", "code")
  googleAuthUrl.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/drive.readonly")
  googleAuthUrl.searchParams.set("access_type", "offline")
  googleAuthUrl.searchParams.set("prompt", "consent")

  return NextResponse.json({
    nextauth_url: nextAuthUrl || "(not set)",
    callback_url_sent_to_google: callbackUrl,
    google_auth_url_preview: googleAuthUrl.toString(),
    env_check: {
      GOOGLE_CLIENT_ID_set: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET_set: !!process.env.GOOGLE_CLIENT_SECRET,
      NEXTAUTH_SECRET_set: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || "(not set)",
      VERCEL_URL: process.env.VERCEL_URL || "(not set)",
      VERCEL_ENV: process.env.VERCEL_ENV || "(not set)",
    },
  })
}
