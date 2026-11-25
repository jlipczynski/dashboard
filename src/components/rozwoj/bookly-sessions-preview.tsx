"use client";

import { useState } from "react";
import type { BooklySession } from "@/lib/bookly-sessions";

type Row = { date: string; title: string; author: string; pages: string; time: string };

const toTime = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

/** "0:31:34" / "31:34" / "1894" → seconds; null when unreadable. */
function parseTime(t: string): number | null {
  const parts = t.trim().split(":");
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.length === 1) return n[0];
  if (n.length === 2) return n[0] * 60 + n[1];
  if (n.length === 3) return n[0] * 3600 + n[1] * 60 + n[2];
  return null;
}

/**
 * Sessions read from Bookly "Reading Sessions" screenshots: fix values or
 * remove rows, then save. Sessions already in the database are skipped.
 */
export function BooklySessionsPreview({
  sessions,
  onSaved,
  onCancel,
}: {
  sessions: BooklySession[];
  onSaved: (msg: string) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    [...sessions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((s) => ({ date: s.date, title: s.title, author: s.author, pages: String(s.pages), time: toTime(s.seconds) }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setError(null);
    const out: BooklySession[] = [];
    for (const r of rows) {
      const pages = Number(r.pages);
      const seconds = parseTime(r.time);
      if (!Number.isInteger(pages) || pages < 0 || seconds === null) {
        return setError(`Popraw wiersz ${r.date} „${r.title}”: strony to liczba całkowita, czas w formacie g:mm:ss`);
      }
      out.push({ date: r.date, title: r.title, author: r.author, pages, seconds });
    }
    setSaving(true);
    try {
      const d = await (
        await fetch("/api/bookly/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessions: out }),
        })
      ).json();
      if (d.error) throw new Error(d.error);
      onSaved(`Zapisano ${d.inserted} sesji, ${d.duplicates} już było`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu");
      setSaving(false);
    }
  };

  const input = "w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground";

  return (
    <div className="mt-3 rounded-xl border border-border p-3">
      <p className="text-xs font-medium text-foreground">Sesje z Bookly ({rows.length}) — sprawdź i zapisz</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">Sesje, które już są w bazie (ta sama data, tytuł, strony i czas), zostaną pominięte.</p>
      <div className="mt-2 max-h-80 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-normal">Data</th>
              <th className="py-1 pr-2 font-normal">Tytuł</th>
              <th className="py-1 pr-2 font-normal">Strony</th>
              <th className="py-1 pr-2 font-normal">Czas</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1 pr-2">
                  <input type="date" value={r.date} onChange={(e) => update(i, { date: e.target.value })} className={input} />
                </td>
                <td className="min-w-40 py-1 pr-2">
                  <input value={r.title} onChange={(e) => update(i, { title: e.target.value })} className={input} title={r.author} />
                </td>
                <td className="w-16 py-1 pr-2">
                  <input inputMode="numeric" value={r.pages} onChange={(e) => update(i, { pages: e.target.value })} className={`${input} tabular-nums`} />
                </td>
                <td className="w-20 py-1 pr-2">
                  <input value={r.time} onChange={(e) => update(i, { time: e.target.value })} className={`${input} tabular-nums`} />
                </td>
                <td className="py-1 text-right">
                  <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-600" title="Usuń wiersz">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={save}
          disabled={saving || rows.length === 0}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz sesje"}
        </button>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          Anuluj
        </button>
      </div>
    </div>
  );
}
