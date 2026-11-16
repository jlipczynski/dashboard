"use client";

import { useState } from "react";
import { addDays, defaultPlanEnd, toDateStr, validateReset, type RehabPlan } from "@/lib/rehab";

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

export function RehabReset({
  plan,
  onReset,
}: {
  plan: RehabPlan;
  onReset: (start: string, end: string) => void;
}) {
  const today = toDateStr(new Date());
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(defaultPlanEnd(today));
  const [endTouched, setEndTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const validation = validateReset(start, end, today);
  const willDelete = start > plan.start;

  const openForm = () => {
    setStart(today);
    setEnd(defaultPlanEnd(today));
    setEndTouched(false);
    setError(null);
    setMessage(null);
    setOpen(true);
  };

  const changeStart = (v: string) => {
    setStart(v);
    if (!endTouched && validateReset(v, defaultPlanEnd(v), today) === null) setEnd(defaultPlanEnd(v));
  };

  const confirm = async () => {
    if (validation || busy) return;
    setBusy(true);
    setError(null);
    try {
      let msg = "Nowy plan ustawiony (nie było wpisów do usunięcia)";
      if (willDelete) {
        const res = await fetch("/api/rehab/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: plan.start, before: start }),
        });
        const d = await res.json();
        if (!res.ok || !d.ok) {
          const partial = d.rehabDeleted ? " (wpisy rehabilitacji zostały już usunięte)" : "";
          throw new Error((d.error || "Błąd usuwania") + partial);
        }
        msg = `Usunięto: rehab ${d.deleted.rehab}, kalorie ${d.deleted.calories}`;
      }
      onReset(start, end);
      setMessage(msg);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd usuwania");
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button onClick={openForm} className="text-muted-foreground hover:text-foreground">
          ↺ Zacznij od nowa
        </button>
        {message && <span className="text-muted-foreground">{message}</span>}
      </span>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-muted-foreground">
          Start
          <input
            type="date"
            value={start}
            max={today}
            onChange={(e) => changeStart(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
          />
        </label>
        <label className="flex items-center gap-1 text-muted-foreground">
          Koniec
          <input
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setEndTouched(true);
            }}
            className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
          />
        </label>
      </div>
      {validation ? (
        <span className="text-red-500">{validation}</span>
      ) : willDelete ? (
        <span className="text-muted-foreground">
          Usunie wpisy rehabilitacji i kalorii od {fmtDate(plan.start)} do {fmtDate(addDays(start, -1))}. Tego nie da
          się cofnąć.
        </span>
      ) : (
        <span className="text-muted-foreground">Nic nie zostanie usunięte — zmienią się tylko daty planu.</span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={confirm}
          disabled={!!validation || busy}
          className="rounded-md bg-foreground px-2 py-1 font-medium text-background disabled:opacity-50"
        >
          {busy ? "Usuwam..." : "Tak, zacznij od nowa"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-muted-foreground hover:text-foreground"
        >
          Anuluj
        </button>
        {error && <span className="text-red-500">{error}</span>}
      </div>
    </div>
  );
}
