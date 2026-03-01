import { NextRequest, NextResponse } from "next/server";
import { GarminConnect } from "@gooin/garmin-connect";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Garmin MFA Authentication Flow (2 steps):
 *
 * Step 1 - POST { action: "trigger_mfa" }
 *   Attempts login to trigger MFA email from Garmin.
 *   Login will fail (expected), but Garmin sends the MFA code email.
 *
 * Step 2 - POST { action: "complete", code: "123456" }
 *   Performs full login with MFA code in a single request:
 *   - Starts login with sessionId
 *   - Submits MFA code to the file-based session
 *   - Login completes, tokens exported
 *   - Returns base64 token to store as GARMIN_TOKEN env var
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Brak GARMIN_EMAIL lub GARMIN_PASSWORD w env vars" },
      { status: 500 }
    );
  }

  if (action === "trigger_mfa") {
    // Attempt login WITHOUT sessionId - this will FAIL with MFA error
    // but Garmin will send the MFA code email
    try {
      const client = new GarminConnect({ username: email, password });
      await client.login();
      // If login succeeds without MFA (unlikely), export token directly
      const token = client.exportToken();
      const tokenStr = Buffer.from(JSON.stringify(token)).toString("base64");
      return NextResponse.json({
        status: "success",
        token: tokenStr,
        message: "Zalogowano bez MFA! Skopiuj token.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("MFA") || msg.includes("验证")) {
        return NextResponse.json({
          status: "mfa_sent",
          message: "Kod MFA zostal wyslany na Twoj email. Wpisz go i kliknij 'Zaloguj z kodem'.",
        });
      }
      return NextResponse.json(
        { error: `Login failed: ${msg}` },
        { status: 500 }
      );
    }
  }

  if (action === "complete") {
    const { code } = body;
    if (!code) {
      return NextResponse.json({ error: "Brak kodu MFA" }, { status: 400 });
    }

    try {
      // Reset MFA manager singleton so we get a fresh instance
      const { MFAManager } = require("@gooin/garmin-connect/dist/common/MFAManager");
      MFAManager.resetInstance();

      const sessionId = `mfa-${Date.now()}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new GarminConnect({
        username: email,
        password,
        mfa: { type: "file", dir: "/tmp/garmin-mfa" },
      } as any);

      // Start login in background (will wait for MFA code via file polling)
      const loginPromise = client.login(email, password, sessionId);

      // Wait for the session file to be created by waitForMFACode
      await new Promise((r) => setTimeout(r, 8000));

      // Submit the MFA code to the file-based session
      const mfaManager = MFAManager.getInstance();
      const submitted = await mfaManager.submitMFACode(sessionId, code);

      if (!submitted) {
        return NextResponse.json(
          { error: "Nie udalo sie przeslac kodu MFA. Sprobuj ponownie." },
          { status: 500 }
        );
      }

      // Wait for login to complete
      await loginPromise;

      // Export token
      const token = client.exportToken();
      const tokenStr = Buffer.from(JSON.stringify(token)).toString("base64");

      return NextResponse.json({
        status: "success",
        token: tokenStr,
        message: "Zalogowano! Skopiuj token i dodaj jako GARMIN_TOKEN w Vercel env vars.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `MFA login failed: ${msg}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
