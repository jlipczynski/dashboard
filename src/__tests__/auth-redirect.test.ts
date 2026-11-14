// @vitest-environment node
// Redirect after login/logout: never to /api/auth/* (login loop), only the same origin.
import { describe, it, expect } from "vitest"
import { authOptions } from "@/lib/google-auth"

const redirect = authOptions.callbacks!.redirect!
const baseUrl = "https://jan-dashboard.vercel.app"
const go = (url: string) => redirect({ url, baseUrl })

describe("redirect callback", () => {
  it("stale callback-url = /api/auth/signin → home page (formerly a loop)", async () => {
    expect(await go(`${baseUrl}/api/auth/signin`)).toBe(baseUrl)
    expect(await go("/api/auth/signin")).toBe(baseUrl)
    expect(await go("/api/auth/signin?callbackUrl=%2F")).toBe(baseUrl)
    expect(await go("/api/auth/signout")).toBe(baseUrl)
  })
  it("normal pages are kept (also /wydatek and query strings)", async () => {
    expect(await go("/")).toBe(`${baseUrl}/`)
    expect(await go("/weekly")).toBe(`${baseUrl}/weekly`)
    expect(await go(`${baseUrl}/finanse?tab=historia`)).toBe(`${baseUrl}/finanse?tab=historia`)
    expect(await go("/rozwoj")).toBe(`${baseUrl}/rozwoj`)
  })
  it("a correct target page (e.g. /wydatek) is kept — relative, absolute and from the middleware", async () => {
    expect(await go("/wydatek")).toBe(`${baseUrl}/wydatek`)
    expect(await go(`${baseUrl}/wydatek`)).toBe(`${baseUrl}/wydatek`)
    // the middleware sends callbackUrl=<the full request URL>
    expect(await go(decodeURIComponent(encodeURIComponent(`${baseUrl}/wydatek`)))).toBe(`${baseUrl}/wydatek`)
    expect(await go("/wydatek?x=1")).toBe(`${baseUrl}/wydatek?x=1`)
  })

  it("a wrong callback /api/auth/signin never ends on the login page (any form)", async () => {
    const bad = [
      "/api/auth/signin",
      `${baseUrl}/api/auth/signin`,
      `${baseUrl}/api/auth/signin?callbackUrl=${encodeURIComponent(`${baseUrl}/api/auth/signin`)}`,
      "/api/auth/signin/google",
      "/api/auth/callback/google",
      "/api/auth/error?error=OAuthCallback",
      "/api/auth/signout",
    ]
    for (const url of bad) {
      const target = new URL(await go(url))
      expect(target.pathname.startsWith("/api/auth")).toBe(false)
    }
  })

  it("other domains and tricks → home page (no open redirect)", async () => {
    expect(await go("https://evil.example/phish")).toBe(baseUrl)
    expect(await go("//evil.example/x")).toBe(baseUrl)
    expect(await go("https://jan-dashboard.vercel.app.evil.example/")).toBe(baseUrl)
    expect(await go("javascript:alert(1)")).toBe(baseUrl)
  })
})
