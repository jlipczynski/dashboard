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
  it("other domains and tricks → home page (no open redirect)", async () => {
    expect(await go("https://evil.example/phish")).toBe(baseUrl)
    expect(await go("//evil.example/x")).toBe(baseUrl)
    expect(await go("https://jan-dashboard.vercel.app.evil.example/")).toBe(baseUrl)
    expect(await go("javascript:alert(1)")).toBe(baseUrl)
  })
})
