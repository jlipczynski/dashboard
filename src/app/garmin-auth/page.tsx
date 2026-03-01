"use client";

import { useState } from "react";

export default function GarminAuthPage() {
  const [step, setStep] = useState<"idle" | "mfa_sent" | "submitting" | "done">("idle");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const triggerMFA = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/garmin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trigger_mfa" }),
      });
      const data = await res.json();

      if (data.status === "success") {
        // Login worked without MFA
        setToken(data.token);
        setStep("done");
      } else if (data.status === "mfa_sent") {
        setStep("mfa_sent");
      } else {
        setError(data.error || "Blad logowania");
      }
    } catch {
      setError("Blad polaczenia z serwerem");
    } finally {
      setLoading(false);
    }
  };

  const submitMFA = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    setStep("submitting");
    try {
      const res = await fetch("/api/garmin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", code: code.trim() }),
      });
      const data = await res.json();

      if (data.status === "success") {
        setToken(data.token);
        setStep("done");
      } else {
        setError(data.error || "Blad MFA");
        setStep("mfa_sent");
      }
    } catch {
      setError("Blad polaczenia z serwerem");
      setStep("mfa_sent");
    } finally {
      setLoading(false);
    }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(token);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Garmin Auth</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Jednorazowa autoryzacja Garmin Connect z MFA
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === "idle" && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <p className="text-sm text-muted-foreground">
              Krok 1: Kliknij przycisk ponizej. Garmin wysle kod MFA na Twoj email.
            </p>
            <button
              onClick={triggerMFA}
              disabled={loading}
              className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Logowanie..." : "Wyslij kod MFA"}
            </button>
          </div>
        )}

        {step === "mfa_sent" && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <p className="text-sm text-muted-foreground">
              Krok 2: Sprawdz email od Garmin i wpisz kod ponizej.
            </p>
            <input
              type="text"
              placeholder="Wpisz kod MFA (6 cyfr)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-lg tracking-widest"
              maxLength={6}
              autoFocus
            />
            <button
              onClick={submitMFA}
              disabled={loading || !code.trim()}
              className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Weryfikacja... (moze potrwac do 30s)" : "Zaloguj z kodem"}
            </button>
          </div>
        )}

        {step === "submitting" && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm text-center space-y-3">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Logowanie z kodem MFA... To moze potrwac do 30 sekund.
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700">
              Zalogowano pomyslnie!
            </div>
            <p className="text-sm text-muted-foreground">
              Skopiuj token ponizej i dodaj go jako <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">GARMIN_TOKEN</code> w ustawieniach Vercel:
            </p>
            <div className="relative">
              <textarea
                readOnly
                value={token}
                rows={4}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs break-all"
              />
              <button
                onClick={copyToken}
                className="absolute right-2 top-2 rounded bg-foreground/10 px-2 py-1 text-xs hover:bg-foreground/20"
              >
                Kopiuj
              </button>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-xs text-blue-700 space-y-1">
              <p className="font-medium">Gdzie to wkleic:</p>
              <p>1. Vercel → Settings → Environment Variables</p>
              <p>2. Dodaj: GARMIN_TOKEN = (wklej skopiowany token)</p>
              <p>3. Zrob Redeploy</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
