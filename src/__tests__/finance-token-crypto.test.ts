// @vitest-environment node
import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { encryptToken, decryptToken } from "../lib/finance-token-crypto";

const KEY = randomBytes(32).toString("base64");
const FAKE = "1//fake-refresh-token-for-tests";

describe("finance token crypto", () => {
  it("round-trips and never contains the plain token", () => {
    const enc = encryptToken(FAKE, KEY);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain(FAKE);
    expect(decryptToken(enc, KEY)).toBe(FAKE);
  });
  it("random IV: two encryptions differ", () => {
    expect(encryptToken(FAKE, KEY)).not.toBe(encryptToken(FAKE, KEY));
  });
  it("wrong key or tampered data → throws", () => {
    const enc = encryptToken(FAKE, KEY);
    expect(() => decryptToken(enc, randomBytes(32).toString("base64"))).toThrow();
    const raw = Buffer.from(enc.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => decryptToken(`v1:${raw.toString("base64")}`, KEY)).toThrow();
  });
  it("missing / short key → throws", () => {
    expect(() => encryptToken(FAKE, undefined)).toThrow(/32 bytes/);
    expect(() => encryptToken(FAKE, Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});
