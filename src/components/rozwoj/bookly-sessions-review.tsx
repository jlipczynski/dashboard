"use client";

import { useMemo, useState } from "react";
import {
  booksInDays,
  buildDayReports,
  dedupeSessions,
  gapDays,
  normTitle,
  sessionDays,
  type BooklySession,
} from "@/lib/bookly-sessions";
import type { BooklyReport } from "@/lib/reading";

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

const mins = (sec: number) => Math.round(sec / 60);

/**
 * Review of sessions read from Bookly "Reading Sessions" screenshots.
 * Duplicates (overlapping screenshots) are removed; each day is saved as a
 * one-day report. The oldest day is unchecked by default — the last
 * screenshot usually cuts it off, so it may be incomplete.
 */
export function BooklySessionsReview({
  rawSessions,
  existing,
  onSaved,
  onCancel,
}: {
  rawSessions: BooklySession[];
  existing: BooklyReport[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const sessions = useMemo(() => dedupeSessions(rawSessions), [rawSessions]);
  const days = useMemo(() => sessionDays(sessions), [sessions]);
  const gaps = useMemo(() => gapDays(days), [days]);
  const oldest = days[0]?.date;

  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(days.filter((d) => days.length === 1 || d.date !== oldest).map((d) => d.date))
  );
  const [finished, setFinished] = useState<Set<string>>(new Set());
  const [gapsAsZero, setGapsAsZero] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenDays = days.filter((d) => included.has(d.date));
  const books = booksInDays(chosenDays);
  const total = chosenDays.reduce((a, d) => ({ sec: a.sec + d.seconds, pages: a.pages + d.pages }), { sec: 0, pages: 0 });
  const zeroDays = gapsAsZero ? gaps.filter((g) => chosenDays.length > 0 && g > chosenDays[0].date && g < chosenDays[chosenDays.length - 1].date) : [];
  const calendarDays = chosenDays.length + zeroDays.length;

  const existingDay = useMemo(() => {
    const s = new Set<string>();
    for (const r of existing) if (r.period_from === r.period_to) s.add(r.period_from);
    return s;
  }, [existing]);

  const toggleDay = (date: string) => {
    const next = new Set(included);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    setIncluded(next);
  };
  const toggleBook = (title: string) => {
    const k = normTitle(title);
    const next = new Set(finished);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setFinished(next);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const finishedTitles = books.filter((b) => finished.has(normTitle(b.title))).map((b) => b.title);
    const reports = buildDayReports(chosenDays, finishedTitles, zeroDays);
    try {
      const d = await (
        await fetch("/api/bookly/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reports }),
        })
      ).json();
      if (d.error) throw new Error(d.error);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu");
      setSaving(false);
    }
  };

  const dupes = rawSessions.length - sessions.length;

  return (
    <div className="mt-3 rounded-xl border border-border p-3">
      <p className="text-xs font-medium text-foreground">Sesje z Bookly — sprawdź i zapisz</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {sessions.length} sesji z {days.length} dni{dupes > 0 && ` · pominięto ${dupes} duplikat(y) z nakładających się zrzutów`}. Każdy dzień zapisze się jako osobny raport
        dzienny — ponowny import tych samych dni nadpisze je, nic się nie zdubluje.
      </p>

      <div className="mt-2 max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-normal" />
              <th className="py-1 pr-2 font-normal">Dzień</th>
              <th className="py-1 pr-2 font-normal">Sesje</th>
              <th className="py-1 pr-2 font-normal">Minuty</th>
              <th className="py-1 pr-2 font-normal">Strony</th>
              <th className="py-1 font-normal">Książki</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.date} className={`border-t border-border ${included.has(d.date) ? "" : "text-muted-foreground line-through"}`}>
                <td className="py-1 pr-2">
                  <input type="checkbox" checked={included.has(d.date)} onChange={() => toggleDay(d.date)} />
                </td>
                <td className="whitespace-nowrap py-1 pr-2">
                  {fmtDate(d.date)}
                  {d.date === oldest && days.length > 1 && <span className="ml-1 text-amber-600 no-underline">może być niepełny</span>}
                  {existingDay.has(d.date) && included.has(d.date) && <span className="ml-1 text-muted-foreground">(nadpisze)</span>}
                </td>
                <td className="py-1 pr-2 tabular-nums">{d.sessions}</td>
                <td className="py-1 pr-2 tabular-nums">{mins(d.seconds)}</td>
                <td className="py-1 pr-2 tabular-nums">{d.pages}</td>
                <td className="py-1 text-muted-foreground">{d.titles.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {oldest && days.length > 1 && (
        <p className="mt-1 text-[11px] text-amber-700">
          Najstarszy dzień ({fmtDate(oldest)}) jest odznaczony — ostatni zrzut zwykle go ucina. Zaznacz go, jeśli na zrzucie widać wszystkie jego sesje.
        </p>
      )}

      {gaps.length > 0 && (
        <label className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={gapsAsZero} onChange={(e) => setGapsAsZero(e.target.checked)} className="mt-0.5" />
          <span>
            Dni bez sesji ({gaps.map(fmtDate).join(", ")}): zapisz jako 0 min. Zaznacz tylko, jeśli zrzuty pokazują ciągłą listę — inaczej te dni zostaną „brak danych”.
          </span>
        </label>
      )}

      {books.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] text-muted-foreground">Które książki skończyłeś? (liczy się w dniu ostatniej sesji)</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {books.map((b) => {
              const on = finished.has(normTitle(b.title));
              return (
                <button
                  key={b.title}
                  onClick={() => toggleBook(b.title)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${on ? "border-green-600 bg-green-50 text-green-700" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {on ? "✓ " : ""}
                  {b.title} <span className="opacity-60">· {fmtDate(b.lastDate)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-foreground">
        Zapisze: <span className="font-semibold">{chosenDays.length}</span> dni z czytaniem
        {zeroDays.length > 0 && <> + {zeroDays.length} dni z 0 min</>} · <span className="font-semibold">{mins(total.sec)}</span> min ·{" "}
        <span className="font-semibold">{total.pages}</span> stron
        {calendarDays > 0 && <> · śr. {Math.round(mins(total.sec) / calendarDays)} min/dzień</>} · ukończone:{" "}
        <span className="font-semibold">{books.filter((b) => finished.has(normTitle(b.title))).length}</span>
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={save}
          disabled={saving || chosenDays.length === 0}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : `Zapisz ${chosenDays.length + zeroDays.length} dni`}
        </button>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          Anuluj
        </button>
      </div>
    </div>
  );
}
