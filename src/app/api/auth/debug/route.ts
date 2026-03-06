import { NextResponse } from "next/server"

export async function GET() {
  const nextAuthUrl = process.env.NEXTAUTH_URL
  const vercelUrl = process.env.VERCEL_URL
  const vercelProjectProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const vercelEnv = process.env.VERCEL_ENV

  const computedCallbackUrl = nextAuthUrl
    ? `${nextAuthUrl.replace(/\/$/, "")}/api/auth/callback/google`
    : vercelUrl
      ? `https://${vercelUrl}/api/auth/callback/google`
      : "http://localhost:3000/api/auth/callback/google"

  return NextResponse.json({
    NEXTAUTH_URL: nextAuthUrl || "(not set)",
    NEXTAUTH_URL_trailing_slash: nextAuthUrl?.endsWith("/") ?? false,
    VERCEL_URL: vercelUrl || "(not set)",
    VERCEL_PROJECT_PRODUCTION_URL: vercelProjectProductionUrl || "(not set)",
    VERCEL_ENV: vercelEnv || "(not set)",
    computed_callback_url: computedCallbackUrl,
    expected_callback_url:
      "https://jan-dashboard.vercel.app/api/auth/callback/google",
  })
}
