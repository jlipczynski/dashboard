// @vitest-environment node
// Google tokens stay on the server: session, logs, refresh (expiry, parallel use).
// ONLY fake tokens (FAKE_*) — no real secrets in tests.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }))

import { getToken } from "next-auth/jwt"
import { authOptions } from "@/lib/google-auth"
import {
  refreshGoogleAccessToken,
  getGoogleAccessToken,
  isAccessTokenValid,
  __resetGoogleTokenCacheForTests,
} from "@/lib/google-token"

const FAKE_ACCESS = "FAKE_ACCESS_ya29_test"
const FAKE_REFRESH = "FAKE_REFRESH_1//0test"
const FAKE_NEW_ACCESS = "FAKE_NEW_ACCESS_ya29"
const FAKE_SECRET = "FAKE_GOCSPX-client-secret"

type JwtCb = NonNullable<typeof authOptions.callbacks>["jwt"]
type SessionCb = NonNullable<typeof authOptions.callbacks>["session"]
const jwtCb = authOptions.callbacks!.jwt as JwtCb
const sessionCb = authOptions.callbacks!.session as SessionCb

function okRefreshResponse(token = FAKE_NEW_ACCESS) {
  return new Response(JSON.stringify({ access_token: token, expires_in: 3600 }), { status: 200 })
}

let logs: string[]
beforeEach(() => {
  __resetGoogleTokenCacheForTests()
  process.env.GOOGLE_CLIENT_ID = "FAKE_CLIENT_ID"
  process.env.GOOGLE_CLIENT_SECRET = FAKE_SECRET
  process.env.NEXTAUTH_SECRET = "FAKE_NEXTAUTH_SECRET"
  logs = []
  const capture = (...a: unknown[]) => { logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")) }
  vi.spyOn(console, "log").mockImplementation(capture)
  vi.spyOn(console, "error").mockImplementation(capture)
  vi.spyOn(console, "warn").mockImplementation(capture)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const SECRETS = [FAKE_ACCESS, FAKE_REFRESH, FAKE_NEW_ACCESS, FAKE_SECRET]
const expectNoSecretsIn = (text: string) => { for (const s of SECRETS) expect(text).not.toContain(s) }

describe("session (/api/auth/session) — no tokens", () => {
  it("does not return accessToken/refreshToken, only the googleConnected flag", async () => {
    const session = await sessionCb({
      session: { user: { email: "x@test" }, expires: "2099-01-01" },
      token: { accessToken: FAKE_ACCESS, refreshToken: FAKE_REFRESH, accessTokenExpires: Date.now() + 3600_000 },
    } as never)
    const json = JSON.stringify(session)
    expectNoSecretsIn(json)
    expect(json).not.toMatch(/accessToken|refreshToken/)
    expect((session as { googleConnected?: boolean }).googleConnected).toBe(true)
  })

  it("googleConnected=false after a refresh error", async () => {
    const session = await sessionCb({
      session: { expires: "2099-01-01" },
      token: { refreshToken: FAKE_REFRESH, error: "RefreshAccessTokenError" },
    } as never)
    expect((session as { googleConnected?: boolean }).googleConnected).toBe(false)
  })
})

describe("NextAuth logger — does not log tokens or the client secret", () => {
  it("debug is a no-op (formerly logged OAUTH_CALLBACK_RESPONSE and GET_AUTHORIZATION_URL)", () => {
    authOptions.logger!.debug!("OAUTH_CALLBACK_RESPONSE", {
      account: { access_token: FAKE_ACCESS, refresh_token: FAKE_REFRESH },
      provider: { clientSecret: FAKE_SECRET },
    } as never)
    expect(logs).toHaveLength(0)
  })

  it("error logs the code and error name, not metadata", () => {
    authOptions.logger!.error!("OAUTH_CALLBACK_ERROR", {
      error: { name: "OAuthCallbackError", message: "State cookie was missing." },
      providerId: "google",
      account: { access_token: FAKE_ACCESS, refresh_token: FAKE_REFRESH },
      provider: { clientSecret: FAKE_SECRET },
    } as never)
    const all = logs.join("\n")
    expectNoSecretsIn(all)
    expect(all).toContain("OAUTH_CALLBACK_ERROR")
    expect(all).toContain("OAuthCallbackError")
  })
})

describe("expiry", () => {
  it("token counts as expired 60 s before expires", () => {
    const now = 1_000_000
    expect(isAccessTokenValid(now + 120_000, now)).toBe(true)
    expect(isAccessTokenValid(now + 30_000, now)).toBe(false)
    expect(isAccessTokenValid(undefined, now)).toBe(false)
  })
})

describe("refresh — POST body, deduplication, cache, errors", () => {
  it("sends client_secret and refresh_token in the body, not in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okRefreshResponse())
    vi.stubGlobal("fetch", fetchMock)
    const r = await refreshGoogleAccessToken(FAKE_REFRESH)
    expect(r.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("https://oauth2.googleapis.com/token")
    expect(init.method).toBe("POST")
    expect(String(init.body)).toContain("refresh_token=")
    expectNoSecretsIn(String(url))
  })

  it("10 parallel requests with an expired token = 1 call to Google", async () => {
    let resolve!: (r: Response) => void
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((res) => { resolve = res }))
    vi.stubGlobal("fetch", fetchMock)
    const all = Promise.all(Array.from({ length: 10 }, () => refreshGoogleAccessToken(FAKE_REFRESH)))
    await new Promise((r) => setTimeout(r, 0))
    resolve(okRefreshResponse())
    const results = await all
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(results.every((r) => r.ok && r.accessToken === FAKE_NEW_ACCESS)).toBe(true)
  })

  it("a fresh refreshed token is reused from the cache (no second call)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okRefreshResponse())
    vi.stubGlobal("fetch", fetchMock)
    await refreshGoogleAccessToken(FAKE_REFRESH)
    await refreshGoogleAccessToken(FAKE_REFRESH)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("invalid_grant → error, no cache, the log has no tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }))
    vi.stubGlobal("fetch", fetchMock)
    const r = await refreshGoogleAccessToken(FAKE_REFRESH)
    expect(r).toEqual({ ok: false, error: "RefreshAccessTokenError" })
    await refreshGoogleAccessToken(FAKE_REFRESH)
    expect(fetchMock).toHaveBeenCalledTimes(2) // errors are not cached
    expectNoSecretsIn(logs.join("\n"))
    expect(logs.join("\n")).toContain("invalid_grant")
  })

  it("network error → error, the log has no tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError(`fetch failed ${FAKE_REFRESH}`)))
    const r = await refreshGoogleAccessToken(FAKE_REFRESH)
    expect(r.ok).toBe(false)
    expectNoSecretsIn(logs.join("\n"))
  })
})

describe("jwt callback — expiry and refresh", () => {
  it("first login: tokens only in the JWT", async () => {
    const t = await jwtCb({
      token: {},
      account: { access_token: FAKE_ACCESS, refresh_token: FAKE_REFRESH, expires_in: 3600 },
    } as never)
    expect(t.accessToken).toBe(FAKE_ACCESS)
    expect(t.refreshToken).toBe(FAKE_REFRESH)
  })

  it("expired → refresh, the refresh token is kept", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okRefreshResponse()))
    const t = await jwtCb({
      token: { accessToken: FAKE_ACCESS, refreshToken: FAKE_REFRESH, accessTokenExpires: Date.now() - 1000 },
    } as never)
    expect(t.accessToken).toBe(FAKE_NEW_ACCESS)
    expect(t.refreshToken).toBe(FAKE_REFRESH)
    expect(t.error).toBeUndefined()
  })

  it("refresh failure → error in the JWT", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })))
    const t = await jwtCb({
      token: { accessToken: FAKE_ACCESS, refreshToken: FAKE_REFRESH, accessTokenExpires: Date.now() - 1000 },
    } as never)
    expect(t.error).toBe("RefreshAccessTokenError")
  })
})

describe("getGoogleAccessToken(req) — server-side token for routes", () => {
  const req = {} as never
  it("no session → null", async () => {
    vi.mocked(getToken).mockResolvedValue(null)
    expect(await getGoogleAccessToken(req)).toBeNull()
  })
  it("valid token → returned without calling Google", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.mocked(getToken).mockResolvedValue({ accessToken: FAKE_ACCESS, refreshToken: FAKE_REFRESH, accessTokenExpires: Date.now() + 3600_000 } as never)
    expect(await getGoogleAccessToken(req)).toBe(FAKE_ACCESS)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("expired → refreshed on the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okRefreshResponse()))
    vi.mocked(getToken).mockResolvedValue({ accessToken: FAKE_ACCESS, refreshToken: FAKE_REFRESH, accessTokenExpires: Date.now() - 1 } as never)
    expect(await getGoogleAccessToken(req)).toBe(FAKE_NEW_ACCESS)
  })
  it("expired and refresh fails → null (route answers 'not connected')", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })))
    vi.mocked(getToken).mockResolvedValue({ accessToken: FAKE_ACCESS, refreshToken: FAKE_REFRESH, accessTokenExpires: Date.now() - 1 } as never)
    expect(await getGoogleAccessToken(req)).toBeNull()
  })
})
