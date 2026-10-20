"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { monthStartStr, toDateStr } from "@/lib/rehab";
import { dailyValues, rangeStats, yearSummary, type BooklyReport, type ReadingSettings } from "@/lib/reading";

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

const MONTHS_PL = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const monthName = (d: string) => MONTHS_PL[Number(d.slice(5, 7)) - 1];

/** Stable muted color per title for books without a cover image. */
function spineColor(title: string): string {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `linear-gradient(160deg, hsl(${h} 45% 45%), hsl(${(h + 30) % 360} 45% 32%))`;
}

function BigRing({ value, color: c, label, size = 132 }: { value: number; color: string; label: string; size?: number }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const v = Math.min(Math.max(value, 0), 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={c}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v / 100)}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums" style={{ color: c }}>
          {v}
          <span className="text-xl">%</span>
        </span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

function EditableNumber({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        className="font-semibold text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
        title="Kliknij, aby zmienić"
      >
        {value}
      </button>
    );
  }
  const commit = () => {
    const n = parseInt(draft);
    if (Number.isInteger(n) && n > 0) onSave(n);
    setEditing(false);
  };
  return (
    <input
      autoFocus
      type="number"
      min={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-14 rounded border border-border bg-background px-1 text-sm"
    />
  );
}

export function ReadingWigCard({
  settings,
  onSettingsChange,
  onReportsChange,
}: {
  settings: ReadingSettings;
  onSettingsChange: (s: ReadingSettings) => void;
  onReportsChange?: (reports: BooklyReport[]) => void;
}) {
  const today = toDateStr(new Date());
  const year = Number(today.slice(0, 4));
  const [reports, setReports] = useState<BooklyReport[]>([]);
  const [sync, setSync] = useState<SyncState>({ kind: "idle" });
  const [parsing, setParsing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showReports, setShowReports] = useState(false);
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
  const month = rangeStats(days, monthStartStr(today), today, today, settings.dailyMinutes);
  const y = yearSummary(days, year, today, settings);
  const titles = useMemo(() => {
    // Titles from the widest report of this year
    const inYear = reports.filter((r) => r.period_from.startsWith(String(year)));
    const widest = [...inYear].sort(
      (a, b) => a.period_from.localeCompare(b.period_from) || b.period_to.localeCompare(a.period_to)
    )[0];
    return widest?.finished_titles ?? [];
  }, [reports, year]);

  const booksOnTrack = y.books >= y.booksExpected;
  const booksBehind = Math.round(y.booksExpected - y.books);

  // Covers for the shelf (cached server-side in book_covers)
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  const titlesKey = titles.join("|");
  useEffect(() => {
    if (titles.length === 0) return;
    fetch("/api/bookly/covers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles }),
    })
      .then((r) => r.json())
      .then((d) => d.covers && setCovers(d.covers))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titlesKey]);
  const [showImport, setShowImport] = useState(false);

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
    <div className="mt-6 space-y-4">
      {/* ── Hero: yearly WIG ─────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">🎯 WIG · Czytanie {year}</p>
            <p className="mt-0.5 text-sm text-foreground">
              <EditableNumber value={settings.booksPerYear} onSave={(v) => onSettingsChange({ ...settings, booksPerYear: v })} /> książek do 31.12.{year}
            </p>
          </div>
          {y.coveredUntil && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">dane do {fmtDate(y.coveredUntil)}</span>
          )}
        </div>

        {reports.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Brak raportów Bookly — wgraj raport poniżej albo zapisz go w folderze „Bookly Reports” na Drive.</p>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
            <BigRing value={y.targetPct} color={booksOnTrack ? "#22c55e" : "#f59e0b"} label="celu rocznego" />
            <div className="w-full flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums text-foreground">{Math.round(y.books)}</span>
                <span className="text-lg text-muted-foreground">/ {y.booksTarget} książek</span>
              </div>
              {/* Progress with "plan for today" marker */}
              <div className="relative mt-3 h-3 rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${y.targetPct}%`, backgroundColor: booksOnTrack ? "#22c55e" : "#f59e0b" }}
                />
                <div
                  className="absolute -top-1 h-5 w-0.5 bg-foreground"
                  style={{ left: `${Math.min((y.booksExpected / Math.max(y.booksTarget, 1)) * 100, 100)}%` }}
                  title={`Plan na dziś: ${y.booksExpected}`}
                />
              </div>
              <p className="mt-1 text-right text-[11px] text-muted-foreground">▲ plan na {y.coveredUntil ? fmtDate(y.coveredUntil) : "dziś"}: {y.booksExpected}</p>
              <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${booksOnTrack ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                {booksOnTrack ? "✓ Zgodnie z planem" : `⚠ Za planem o ${booksBehind} ${booksBehind === 1 ? "książkę" : "książek"}`}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {y.booksProjected !== null && <>W tym tempie: <span className="font-semibold text-foreground">{y.booksProjected}</span> w roku. </>}
                {y.booksPerWeekNeeded !== null && y.books < y.booksTarget && (
                  <>Żeby dojść do {y.booksTarget}: <span className="font-semibold text-foreground">{y.booksPerWeekNeeded.toLocaleString("pl-PL")}</span> książki / tydzień.</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Lead — what scores the Rozwój pillar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">
            Lead · {monthName(today)}:{" "}
            {month.avgMinutesPerDay === null ? (
              <span>brak raportu za ten miesiąc</span>
            ) : (
              <>
                <span className="font-semibold tabular-nums" style={{ color: color(month.leadScore) }}>{month.avgMinutesPerDay} min/dzień</span>
                {" "}· czytanie w {month.readingDays} z {month.coveredDays} dni
              </>
            )}
          </span>
          <span className="text-muted-foreground">
            cel:{" "}
            <EditableNumber value={settings.dailyMinutes} onSave={(v) => onSettingsChange({ ...settings, dailyMinutes: v })} /> min/dzień
            {month.leadScore !== null && (
              <> · wynik filaru: <span className="font-semibold" style={{ color: color(month.leadScore) }}>{month.leadScore}%</span></>
            )}
          </span>
        </div>
      </section>

      {/* ── Shelf ─────────────────────────────────────────── */}
      {y.coveredDays > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-foreground">📚 Półka {year}</h3>
            <span className="text-xs text-muted-foreground">
              {Math.round(y.books)} książek · {Math.round(y.minutes / 60)} h · {fmt(y.pages)} stron · {y.readingDays} dni z czytaniem
              {y.avgMinutesPerDay !== null && ` · śr. ${y.avgMinutesPerDay} min/dzień`}
            </span>
          </div>
          {titles.length > 0 ? (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3 lg:grid-cols-8">
              {titles.map((t) => (
                <div key={t} className="group" title={t}>
                  <div className="aspect-[2/3] overflow-hidden rounded-md border border-border bg-muted shadow-sm transition-transform group-hover:-translate-y-0.5">
                    {covers[t] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={covers[t]!} alt={t} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div
                        className="flex h-full items-center justify-center p-1.5 text-center text-[10px] font-semibold leading-tight text-white"
                        style={{ background: spineColor(t) }}
                      >
                        {t}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Raporty nie zawierają tytułów książek.</p>
          )}
          {y.coveredDays < y.days && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Raporty pokrywają {y.coveredDays} z {y.days} dni roku — wgraj raport od 1 stycznia, aby podsumowanie było pełne.
            </p>
          )}
        </section>
      )}

      {/* ── Bookly reports: import + list ──────────────────── */}
      <section className="rounded-2xl border border-border bg-card px-5 py-3 shadow-sm sm:px-6">
        <button onClick={() => setShowImport(!showImport)} className="flex w-full items-center gap-2 text-left text-sm">
          <span className={`text-xs text-muted-foreground transition-transform ${showImport ? "rotate-90" : ""}`}>▶</span>
          <span className="font-semibold text-foreground">Raporty Bookly</span>
          <span className="truncate text-xs text-muted-foreground">
            {reports.length} zaimportowane
            {sync.kind === "done" && sync.imported > 0 && ` · ${sync.imported} nowe z Drive`}
            {sync.kind === "login" && " · zaloguj Google, aby pobierać z Drive"}
            {sync.kind === "noFolder" && " · brak folderu na Drive"}
            {sync.kind === "error" && " · błąd synchronizacji"}
          </span>
        </button>
        {showImport && (
          <div className="pb-2">
          {/* Import */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
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
              <p><span className="font-medium text-foreground">Lead (wynik filaru):</span> średnia minut czytania na dzień w tym miesiącu ÷ {settings.dailyMinutes} min, max 100%. Liczą się tylko dni objęte raportami.</p>
              <p><span className="font-medium text-foreground">Lag:</span> ukończone książki od 1 stycznia vs {settings.booksPerYear}/rok. „Powinno być” = równe tempo do celu.</p>
              <p><span className="font-medium text-foreground">Raporty mogą się nakładać</span> (np. od początku roku i od początku miesiąca) — nic się nie dubluje. Raporty z tym samym początkiem dają dokładne dane dla każdego odcinka; wewnątrz odcinka minuty i strony są rozłożone równo na dni.</p>
              <p><span className="font-medium text-foreground">Rytm:</span> raz w tygodniu wygeneruj w Bookly raport „od 1 stycznia do dziś” i zapisz go w folderze „Bookly Reports” na Google Drive — strona sama go pobierze.</p>
            </div>
          </details>
          </div>
        )}
      </section>
    </div>
  );
}
