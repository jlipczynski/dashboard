// SERVER-ONLY. The Google refresh token for the nightly e-mail import (cron has no cookie / JWT).
// Stored AES-256-GCM encrypted in finance_google_tokens; never logged, never sent to the browser.
import { getSupabaseAdmin } from "@/lib/finanse-db";
import { encryptToken, decryptToken } from "@/lib/finance-token-crypto";

/** Called from the NextAuth jwt callback on sign-in. Silently skipped when FINANCE_TOKEN_KEY is not set. */
export async function saveRefreshToken(email: string, refreshToken: string): Promise<void> {
  if (!process.env.FINANCE_TOKEN_KEY) return;
  const { error } = await getSupabaseAdmin()
    .from("finance_google_tokens")
    .upsert(
      { user_email: email.toLowerCase(), refresh_token_enc: encryptToken(refreshToken), updated_at: new Date().toISOString() },
      { onConflict: "user_email" }
    );
  if (error) throw new Error("finance_google_tokens upsert failed");
}

/** Refresh token of an allowed user (the first one found), or null. */
export async function loadRefreshToken(allowedEmails: string[]): Promise<{ email: string; refreshToken: string } | null> {
  if (allowedEmails.length === 0) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("finance_google_tokens")
    .select("user_email, refresh_token_enc")
    .in("user_email", allowedEmails.map((e) => e.toLowerCase()))
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error || !data?.[0]) return null;
  return { email: data[0].user_email as string, refreshToken: decryptToken(data[0].refresh_token_enc as string) };
}
