"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { shortTitle, type BooklySession } from "@/lib/bookly-sessions";
import { addDays } from "@/lib/rehab";

const MONTHS_PL = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const WEEKDAYS_PL = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];

const fmt = (n: number) => n.toLocaleString("pl-PL");
const mins = (sec: number) => Math.round(sec / 60);

/** Stable muted color per title for books without a cover image. */
export function spineColor(title: string): string {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `linear-gradient(160deg, hsl(${h} 45% 45%), hsl(${(h + 30) % 360} 45% 32%))`;
}

function dayLabel(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${WEEKDAYS_PL[new Date(y, m - 1, day).getDay()]} ${String(day).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
}

function monthBounds(ym: string): { from: string; to: string } {
  const from = `${ym}-01`;
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

function Cover({ title, url, size }: { title: string; url: string | null | undefined; size: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-sm border border-border bg-muted"
      style={{ width: size, height: Math.round(size * 1.5) }}
      title={title}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={title} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="h-full w-full" style={{ background: spineColor(title) }} />
      )}
    </div>
  );
}

/**
 * "Dziennik czytania": Bookly sessions month by month — day by day which
 * book, pages and minutes — plus a per-book summary of the month.
 */
export function ReadingLog({ today, reloadKey, onChanged }: { today: string; reloadKey: number; onChanged: () => void }) {
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [sessions, setSessions] = useState<BooklySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { from, to } = monthBounds(month);
    setLoading(true);
    try {
      const d = await (await fetch(`/api/bookly/sessions?from=${from}&to=${to}`)).json();
      setSessions(d.sessions ?? []);
    } catch {
      setSessions([]);
    }
    setLoading(false);
  }, [month]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // Covers by the exact Bookly title (cached server-side in book_covers)
  const titles = useMemo(() => [...new Set(sessions.map((s) => s.title))], [sessions]);
  const titlesKey = titles.join("|");
  useEffect(() => {
    const missing = titles.filter((t) => !(t in covers));
    if (missing.length === 0) return;
    fetch("/api/bookly/covers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles: missing }),
    })
      .then((r) => r.json())
      .then((d) => d.covers && setCovers((c) => ({ ...c, ...d.covers })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titlesKey]);

  const days = useMemo(() => {
    const map = new Map<string, BooklySession[]>();
    for (const s of sessions) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [sessions]);

  const books = useMemo(() => {
    const map = new Map<string, { title: string; days: Set<string>; pages: number; seconds: number }>();
    for (const s of sessions) {
      const b = map.get(s.title) ?? { title: s.title, days: new Set<string>(), pages: 0, seconds: 0 };
      b.days.add(s.date);
      b.pages += s.pages;
      b.seconds += s.seconds;
      map.set(s.title, b);
    }
    return [...map.values()].sort((a, b) => b.seconds - a.seconds);
  }, [sessions]);

  const total = sessions.reduce((a, s) => ({ sec: a.sec + s.seconds, pages: a.pages + s.pages }), { sec: 0, pages: 0 });

  const remove = async (id: string) => {
    await fetch(`/api/bookly/sessions?id=${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    load();
    onChanged();
  };

  const [y, m] = month.split("-").map(Number);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">📖 Dziennik czytania</h3>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-1 text-muted-foreground hover:text-foreground" aria-label="Poprzedni miesiąc">
            ◀
          </button>
          <span className="min-w-32 text-center text-foreground">
            {MONTHS_PL[m - 1]} {y}
          </span>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= thisMonth}
            className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Następny miesiąc"
          >
            ▶
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {days.length} dni z czytaniem · {fmt(mins(total.sec))} min · {fmt(total.pages)} stron
      </p>

      {loading && sessions.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Wczytuję…</p>
      ) : sessions.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Brak sesji Bookly w tym miesiącu — wgraj zrzuty „Reading Sessions” w sekcji Raporty Bookly.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-border">
            {days.map(([date, list]) => {
              const daySec = list.reduce((a, s) => a + s.seconds, 0);
              const dayPages = list.reduce((a, s) => a + s.pages, 0);
              return (
                <li key={date} className="py-2.5">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium text-foreground">{dayLabel(date)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {dayPages} str. · {mins(daySec)} min
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-1.5">
                    {list.map((s) => (
                      <li key={s.id ?? `${s.title}${s.pages}${s.seconds}`} className="flex items-center gap-2.5 text-sm">
                        <Cover title={s.title} url={covers[s.title]} size={32} />
                        <span className="min-w-0 flex-1 truncate text-foreground" title={s.title}>
                          {shortTitle(s.title)}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {s.pages} str. · {mins(s.seconds)} min
                        </span>
                        {s.id &&
                          (confirmDelete === s.id ? (
                            <span className="shrink-0 text-xs">
                              <button onClick={() => remove(s.id!)} className="text-red-600">
                                usuń
                              </button>{" "}
                              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground">
                                anuluj
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(s.id!)}
                              className="shrink-0 text-xs opacity-40 hover:opacity-100"
                              title="Usuń sesję"
                            >
                              🗑
                            </button>
                          ))}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Książki w miesiącu</p>
            <ul className="mt-2 space-y-2">
              {books.map((b) => (
                <li key={b.title} className="flex items-center gap-2.5 text-sm">
                  <Cover title={b.title} url={covers[b.title]} size={32} />
                  <span className="min-w-0 flex-1 truncate text-foreground" title={b.title}>
                    {shortTitle(b.title)}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {b.days.size} {b.days.size === 1 ? "dzień" : "dni"} · {b.pages} str. · {mins(b.seconds)} min
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
