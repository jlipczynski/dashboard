// SERVER-ONLY. AES-256-GCM for the stored Google refresh token (finance_google_tokens).
// Key: FINANCE_TOKEN_KEY = 32 random bytes, base64 (generate: openssl rand -base64 32).
// Format: "v1:" + base64(iv[12] | tag[16] | ciphertext). Never log the input or the output.
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function keyFrom(b64: string | undefined): Buffer {
  const key = Buffer.from(b64 ?? "", "base64");
  if (key.length !== 32) throw new Error("FINANCE_TOKEN_KEY must be 32 bytes (base64)");
  return key;
}

export function encryptToken(plain: string, keyB64: string | undefined = process.env.FINANCE_TOKEN_KEY): string {
  const key = keyFrom(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")}`;
}

export function decryptToken(enc: string, keyB64: string | undefined = process.env.FINANCE_TOKEN_KEY): string {
  const key = keyFrom(keyB64);
  if (!enc.startsWith("v1:")) throw new Error("Unknown token format");
  const raw = Buffer.from(enc.slice(3), "base64");
  if (raw.length < 29) throw new Error("Token too short");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
