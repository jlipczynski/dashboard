// Bookly "Reading Sessions": single reading sessions (date, book, pages,
// read time) read from screenshots and stored in bookly_sessions.
//
// A session list is scrolled over several screenshots, so neighbouring
// screenshots repeat a card. The same session = same date, title, pages and
// read time to the second — the unique key of bookly_sessions.

export type BooklySession = {
  id?: string;
  date: string; // YYYY-MM-DD
  title: string;
  author: string;
  pages: number;
  seconds: number;
  source?: string | null;
  created_at?: string;
};

export type SessionDay = {
  date: string;
  sessions: number;
  seconds: number;
  pages: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Case/diacritics-insensitive title key ("Myśl I Bogać Się" = "Myśl i bogać się"). */
export function normTitle(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Why a session can't be saved, or null. `today` (YYYY-MM-DD) rejects future dates. */
export function sessionError(s: Partial<BooklySession>, today: string): string | null {
  if (typeof s.date !== "string" || !DATE_RE.test(s.date) || Number.isNaN(Date.parse(s.date))) return "nieprawidłowa data";
  if (s.date > today) return "data w przyszłości";
  if (typeof s.title !== "string" || s.title.trim() === "") return "brak tytułu";
  if (!Number.isInteger(s.pages) || (s.pages as number) < 0) return "nieprawidłowa liczba stron";
  if (!Number.isInteger(s.seconds) || (s.seconds as number) < 0) return "nieprawidłowy czas";
  return null;
}

/** Same key as the bookly_sessions unique constraint. */
export function sessionKey(s: Pick<BooklySession, "date" | "title" | "pages" | "seconds">): string {
  return `${s.date}|${s.title}|${s.pages}|${s.seconds}`;
}

export function dedupeSessions<T extends BooklySession>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = sessionKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Sessions summed per day, oldest first. */
export function sessionDays(sessions: Pick<BooklySession, "date" | "pages" | "seconds">[]): SessionDay[] {
  const map = new Map<string, SessionDay>();
  for (const s of sessions) {
    const d = map.get(s.date) ?? { date: s.date, sessions: 0, seconds: 0, pages: 0 };
    d.sessions++;
    d.seconds += s.seconds;
    d.pages += s.pages;
    map.set(s.date, d);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** "Flow: The Classic Work…" → "Flow" (the part before ":"). */
export function shortTitle(t: string): string {
  const i = t.indexOf(":");
  return i > 0 ? t.slice(0, i).trim() : t.trim();
}
