"use client";

import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { FinanseNav } from "@/components/finanse/FinanseNav";
import { groupByKind, MAX_TEXT } from "@/lib/finanse-insights";

// /finanse/wiedza — what the coach "knows" about Jan: only entries Jan accepted (brief Finanse 10).
// Jan can correct the wording or retire an entry. All writes: PATCH /api/finanse/coach/insights.

type Insight = {
  id: string;
  kind: string;
  text: string;
  status: string;
  source: string;
  created_at: string;
  decided_at: string | null;
};

const SOURCE_LABEL: Record<string, string> = { seed: "decyzja z 17.11", jan: "wpis Jana", coach: "propozycja coacha", analysis: "analiza danych" };
const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" }) : "");

export default function FinanseWiedzaPage() {
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [retiring, setRetiring] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/finanse/coach/insights?status=accepted", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setItems(d.insights ?? []);
    } catch {
      setError("Nie udało się pobrać wiedzy coacha.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/finanse/coach/insights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "Nie zapisano");
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  const groups = groupByKind(items);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <BackButton />
        <FinanseNav active="wiedza" />
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Finanse · coach</p>
          <h1 className="text-2xl font-bold text-foreground">Co coach o Tobie wie</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tylko wpisy, które zaakceptowałeś. Coach korzysta z nich w rozmowie. Popraw treść albo wycofaj wpis, który przestał obowiązywać.
          </p>
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {loading && <p className="mt-6 text-sm text-muted-foreground">Ładowanie…</p>}
        {!loading && !error && groups.length === 0 && <p className="mt-6 text-sm text-muted-foreground">Brak zaakceptowanych wpisów.</p>}

        {groups.map((g) => (
          <section key={g.kind} className="mt-6">
            <h2 className="text-sm font-bold text-foreground">
              {g.label} <span className="font-normal text-muted-foreground">· {g.items.length}</span>
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {g.items.map((i) => (
                <li key={i.id} className="rounded-2xl border border-border bg-card p-4">
                  {editing === i.id ? (
                    <div>
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        maxLength={MAX_TEXT}
                        rows={3}
                        aria-label="Treść wpisu"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={busy || !draft.trim() || draft.trim() === i.text}
                          onClick={async () => {
                            if (await patch({ id: i.id, action: "edit", text: draft })) {
                              setEditing(null);
                              load();
                            }
                          }}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          Zapisz
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs">
                          Anuluj
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground">{i.text}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {SOURCE_LABEL[i.source] ?? i.source}
                      {i.decided_at ? ` · zaakceptowane ${dateLabel(i.decided_at)}` : ""}
                    </span>
                    {editing !== i.id &&
                      (retiring === i.id ? (
                        <span className="flex items-center gap-2">
                          <span className="text-foreground">Wycofać ten wpis?</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              if (await patch({ id: i.id, action: "retire" })) {
                                setRetiring(null);
                                load();
                              }
                            }}
                            className="rounded-lg bg-amber-600 px-2.5 py-1 font-semibold text-white disabled:opacity-40"
                          >
                            Wycofaj
                          </button>
                          <button type="button" onClick={() => setRetiring(null)} className="rounded-lg border border-border px-2.5 py-1">
                            Nie
                          </button>
                        </span>
                      ) : (
                        <span className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(i.id);
                              setDraft(i.text);
                              setRetiring(null);
                            }}
                            className="font-medium text-emerald-700 hover:underline"
                          >
                            Popraw
                          </button>
                          <button type="button" onClick={() => setRetiring(i.id)} className="font-medium text-amber-700 hover:underline">
                            Wycofaj
                          </button>
                        </span>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
