"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { monthStartStr, toDateStr } from "@/lib/rehab";
import {
  BOOKS_PER_YEAR,
  READING_DAILY_MINUTES,
  dailyValues,
  rangeStats,
  yearSummary,
  type BooklyReport,
} from "@/lib/reading";

type SyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "login" }
  | { kind: "noFolder" }
  | { kind: "done"; imported: number; errors: { name: string; error: string }[]; pending: number }
  | { kind: "error"; message: string };

type Draft = {
  period_from: string;
  period_to: string;
  minutes: string;
  pages: string;
  reading_days: string;
  books_finished: string;
  finished_titles: string[];
};

const fmt = (n: number) => n.toLocaleString("pl-PL");
const hm = (min: number) => `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function color(v: number | null): string {
  if (v === null) return "#9ca3af";
  if (v >= 85) return "#22c55e";
  if (v >= 50) return "#f59e0b";
  return "#ef4444";
}

function Bar({ value, max, c }: { value: number; max: number; c: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: c }} />
    </div>
  );
}

export function ReadingWigCard({ onReportsChange }: { onReportsChange?: (reports: BooklyReport[]) => void }) {
  const today = toDateStr(new Date());
  const year = Number(today.slice(0, 4));
  const [reports, setReports] = useState<BooklyReport[]>([]);
  const [sync, setSync] = useState<SyncState>({ kind: "idle" });
  const [parsing, setParsing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showReports, setShowReports] = useState(false);
  const [showTitles, setShowTitles] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadReports = useCallback(async () => {
    try {
      const d = await (await fetch("/api/bookly/reports")).json();
      if (d.reports) setReports(d.reports);
    } catch {
      // ignore
    }
  }, []);

  const runSync = useCallback(async () => {
    setSync({ kind: "syncing" });
    try {
      const res = await fetch("/api/bookly/sync", { method: "POST" });
      const d = await res.json();
      if (res.status === 401 || d.needsLogin) return setSync({ kind: "login" });
      if (d.error) return setSync({ kind: "error", message: d.error });
      if (!d.folderFound) return setSync({ kind: "noFolder" });
      setSync({ kind: "done", imported: d.imported.length, errors: d.errors ?? [], pending: d.pending ?? 0 });
      if (d.imported.length > 0) loadReports();
    } catch (err) {
      setSync({ kind: "error", message: err instanceof Error ? err.message : "Błąd synchronizacji" });
    }
  }, [loadReports]);

  useEffect(() => {
    loadReports();
    runSync();
  }, [loadReports, runSync]);

  useEffect(() => {
    onReportsChange?.(reports);
  }, [reports, onReportsChange]);

  const days = useMemo(() => dailyValues(reports), [reports]);
  const month = rangeStats(days, monthStartStr(today), today, today);
  const y = yearSummary(days, year, today);
  const titles = useMemo(() => {
    // Titles from the widest report of this year
    const inYear = reports.filter((r) => r.period_from.startsWith(String(year)));
    const widest = [...inYear].sort(
      (a, b) => a.period_from.localeCompare(b.period_from) || b.period_to.localeCompare(a.period_to)
    )[0];
    return widest?.finished_titles ?? [];
  }, [reports, year]);

  const booksOnTrack = y.books >= y.booksExpected;

  const onFile = async (file: File) => {
    setParsing(true);
    setDraftError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const d = await (await fetch("/api/bookly/parse", { method: "POST", body: form })).json();
      if (d.error) throw new Error(d.error);
      const r = d.report;
      setDraft({
        period_from: r.period_from,
        period_to: r.period_to,
        minutes: String(r.minutes),
        pages: String(r.pages),
        reading_days: String(r.reading_days),
        books_finished: String(r.books_finished),
        finished_titles: r.finished_titles ?? [],
      });
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Błąd odczytu");
    }
    setParsing(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const saveDraft = async () => {
    if (!draft) return;
    setDraftError(null);
    const body = {
      period_from: draft.period_from,
      period_to: draft.period_to,
      minutes: parseInt(draft.minutes),
      pages: parseInt(draft.pages),
      reading_days: parseInt(draft.reading_days),
      books_finished: parseInt(draft.books_finished),
      finished_titles: draft.finished_titles,
      source: "upload",
    };
    const d = await (
      await fetch("/api/bookly/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json();
    if (d.error) return setDraftError(d.error);
    setDraft(null);
    loadReports();
  };

  const deleteReport = async (id: string) => {
    await fetch(`/api/bookly/reports?id=${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    loadReports();
  };

  const field = (key: keyof Omit<Draft, "finished_titles">, label: string, type = "number") => (
    <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
      {label}
      <input
        type={type}
        value={draft?.[key] ?? ""}
        onChange={(e) => draft && setDraft({ ...draft, [key]: e.target.value })}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
      />
    </label>
  );

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">📖 WIG · Czytanie (Bookly)</p>
          <p className="mt-0.5 text-sm text-foreground">
            Lead: ≥ {READING_DAILY_MINUTES} min dziennie · Lag: {BOOKS_PER_YEAR} książek w {year}
          </p>
        </div>
        {month.coveredUntil && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">dane do {fmtDate(month.coveredUntil)}</span>
        )}
      </div>

      {reports.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Brak raportów Bookly — wgraj raport albo dodaj go do folderu na Drive.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {/* Lead — this month */}
          <div className="rounded-xl bg-muted/50 p-4">
            <p className="text-xs font-medium text-muted-foreground">Lead · ten miesiąc</p>
            {month.avgMinutesPerDay === null ? (
              <p className="mt-2 text-sm text-muted-foreground">Brak raportu za ten miesiąc</p>
            ) : (
              <>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tabular-nums" style={{ color: color(month.leadScore) }}>
                    {month.avgMinutesPerDay}
                  </span>
                  <span className="text-sm text-muted-foreground">min / dzień (cel {READING_DAILY_MINUTES})</span>
                </div>
                <Bar value={month.avgMinutesPerDay} max={READING_DAILY_MINUTES} c={color(month.leadScore)} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Wynik: <span className="font-semibold text-foreground">{month.leadScore}%</span> · czytanie w {month.readingDays} z{" "}
                  {month.coveredDays} dni · {hm(month.minutes)} · {fmt(month.pages)} stron
                </p>
              </>
            )}
          </div>

          {/* Lag — books this year */}
          <div className="rounded-xl bg-muted/50 p-4">
            <p className="text-xs font-medium text-muted-foreground">Lag · książki w {year}</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums" style={{ color: booksOnTrack ? "#22c55e" : "#f59e0b" }}>
                {Math.round(y.books)}
              </span>
              <span className="text-sm text-muted-foreground">/ {BOOKS_PER_YEAR} książek</span>
            </div>
            <Bar value={y.books} max={BOOKS_PER_YEAR} c={booksOnTrack ? "#22c55e" : "#f59e0b"} />
            <p className="mt-2 text-xs text-muted-foreground">
              {booksOnTrack ? "✓ Zgodnie z planem" : "⚠ Za planem"}: na {y.coveredUntil ? fmtDate(y.coveredUntil) : "dziś"} powinno być{" "}
              {y.booksExpected}
              {y.booksProjected !== null && <> · w tym tempie {y.booksProjected} w roku</>}
            </p>
          </div>
        </div>
      )}

      {/* Year summary */}
      {y.coveredDays > 0 && (
        <div className="mt-3 rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Podsumowanie {year}
            {y.coveredUntil && ` (od 01.01 do ${fmtDate(y.coveredUntil)})`}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <div className="text-lg font-semibold tabular-nums text-foreground">{Math.round(y.books)}</div>
              <div className="text-[11px] text-muted-foreground">ukończonych książek</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums text-foreground">{Math.round(y.minutes / 60)} h</div>
              <div className="text-[11px] text-muted-foreground">czytania · śr. {y.avgMinutesPerDay} min/dzień</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums text-foreground">{fmt(y.pages)}</div>
              <div className="text-[11px] text-muted-foreground">stron</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums text-foreground">
                {y.readingDays} / {y.coveredDays}
              </div>
              <div className="text-[11px] text-muted-foreground">dni z czytaniem</div>
            </div>
          </div>
          {y.coveredDays < y.days && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Raporty pokrywają {y.coveredDays} z {y.days} dni roku — wgraj raport od 1 stycznia, aby podsumowanie było pełne.
            </p>
          )}
          {titles.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setShowTitles(!showTitles)} className="text-[11px] text-muted-foreground hover:text-foreground">
                {showTitles ? "▾" : "▸"} Ukończone książki ({titles.length})
              </button>
              {showTitles && (
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-foreground">
                  {titles.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
        <button
          onClick={runSync}
          disabled={sync.kind === "syncing"}
          className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
        >
          {sync.kind === "syncing" ? "Sprawdzam Drive..." : "↻ Synchronizuj z Drive"}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={parsing}
          className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
        >
          {parsing ? "Odczytuję raport..." : "⬆ Wgraj raport"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <span className="text-muted-foreground">
          {sync.kind === "login" && (
            <>
              Drive: <button onClick={() => signIn("google", { callbackUrl: "/rozwoj" })} className="underline hover:text-foreground">zaloguj się do Google</button>, aby pobierać raporty automatycznie
            </>
          )}
          {sync.kind === "noFolder" && <>Drive: brak folderu „Bookly Reports” — utwórz go i zapisuj tam raporty</>}
          {sync.kind === "done" &&
            (sync.imported > 0
              ? `Drive: zaimportowano ${sync.imported} raport(y)${sync.pending > 0 ? `, ${sync.pending} czeka — kliknij ponownie` : ""}`
              : "Drive: brak nowych raportów")}
          {sync.kind === "error" && <span className="text-red-600">Drive: {sync.message}</span>}
        </span>
      </div>
      {sync.kind === "done" && sync.errors.length > 0 && (
        <ul className="mt-1 text-[11px] text-red-600">
          {sync.errors.map((e) => (
            <li key={e.name}>
              {e.name}: {e.error}
            </li>
          ))}
        </ul>
      )}

      {/* Review parsed report before saving */}
      {draftError && <p className="mt-2 text-xs text-red-600">{draftError}</p>}
      {draft && (
        <div className="mt-3 rounded-xl border border-border p-3">
          <p className="text-xs font-medium text-foreground">Sprawdź odczytane dane i zapisz</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {field("period_from", "Od", "date")}
            {field("period_to", "Do", "date")}
            {field("minutes", "Minuty czytania")}
            {field("pages", "Strony")}
            {field("reading_days", "Dni z czytaniem")}
            {field("books_finished", "Ukończone książki")}
          </div>
          {draft.finished_titles.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">Książki: {draft.finished_titles.join(", ")}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={saveDraft} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background">
              Zapisz raport
            </button>
            <button onClick={() => setDraft(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Imported reports */}
      {reports.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowReports(!showReports)} className="text-[11px] text-muted-foreground hover:text-foreground">
            {showReports ? "▾" : "▸"} Zaimportowane raporty ({reports.length})
          </button>
          {showReports && (
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2 font-normal">Okres</th>
                    <th className="py-1 pr-2 font-normal">Czas</th>
                    <th className="py-1 pr-2 font-normal">Strony</th>
                    <th className="py-1 pr-2 font-normal">Dni</th>
                    <th className="py-1 pr-2 font-normal">Książki</th>
                    <th className="py-1 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="whitespace-nowrap py-1 pr-2">
                        {fmtDate(r.period_from)} – {fmtDate(r.period_to)}
                        {r.source === "drive" && <span className="ml-1 text-muted-foreground">(Drive)</span>}
                      </td>
                      <td className="whitespace-nowrap py-1 pr-2 tabular-nums">{hm(r.minutes)}</td>
                      <td className="py-1 pr-2 tabular-nums">{fmt(r.pages)}</td>
                      <td className="py-1 pr-2 tabular-nums">{r.reading_days}</td>
                      <td className="py-1 pr-2 tabular-nums">{r.books_finished}</td>
                      <td className="whitespace-nowrap py-1 text-right">
                        {confirmDelete === r.id ? (
                          <>
                            <button onClick={() => r.id && deleteReport(r.id)} className="text-red-600">usuń</button>{" "}
                            <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground">anuluj</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDelete(r.id ?? null)} className="text-muted-foreground hover:text-red-600">
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Jak liczone?</summary>
        <div className="mt-2 space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <p><span className="font-medium text-foreground">Lead (wynik filaru):</span> średnia minut czytania na dzień w tym miesiącu ÷ {READING_DAILY_MINUTES} min, max 100%. Liczą się tylko dni objęte raportami.</p>
          <p><span className="font-medium text-foreground">Lag:</span> ukończone książki od 1 stycznia vs {BOOKS_PER_YEAR}/rok. „Powinno być” = równe tempo do celu.</p>
          <p><span className="font-medium text-foreground">Raporty mogą się nakładać</span> (np. od początku roku i od początku miesiąca) — nic się nie dubluje. Raporty z tym samym początkiem dają dokładne dane dla każdego odcinka; wewnątrz odcinka minuty i strony są rozłożone równo na dni.</p>
          <p><span className="font-medium text-foreground">Rytm:</span> raz w tygodniu wygeneruj w Bookly raport „od 1 stycznia do dziś” i zapisz go w folderze „Bookly Reports” na Google Drive — strona sama go pobierze.</p>
        </div>
      </details>
    </div>
  );
}
