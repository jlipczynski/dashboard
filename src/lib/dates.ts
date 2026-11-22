// Calendar dates for Jan's Dashboard — ONE source for "today" and "start of the week".
// Every date is a "YYYY-MM-DD" string of the calendar in Europe/Warsaw. Arithmetic is done on the
// string through UTC (Date.UTC), so neither the browser's nor the server's time zone (Vercel = UTC)
// nor a DST change can shift a day. Never use `date.toISOString().split("T")[0]` on a local
// midnight: in Poland that gives the PREVIOUS day.

export const TIME_ZONE = "Europe/Warsaw";

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's date in Europe/Warsaw, e.g. "2026-11-22". */
export function todayWarsaw(now: Date = new Date()): string {
  return fmt.format(now);
}

function toUtc(iso: string): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
const fromUtc = (d: Date) => d.toISOString().slice(0, 10); // safe: d is a UTC midnight

/** `iso` + n days (n may be negative). */
export function addDaysIso(iso: string, n: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** Day of the week, Monday = 1 … Sunday = 7. */
export function isoDayOfWeek(iso: string): number {
  return toUtc(iso).getUTCDay() || 7;
}

/** Monday of the week containing `iso` (weeks start on Monday). */
export function weekStartIso(iso: string): string {
  return addDaysIso(iso, 1 - isoDayOfWeek(iso));
}

/** First day of the month of `iso`. */
export function monthStartIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** All dates from the 1st of the month up to and including `iso`. */
export function monthDatesUpTo(iso: string): string[] {
  const out: string[] = [];
  for (let d = monthStartIso(iso); d <= iso; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

/** Mondays of the weeks that contain at least one day of the month up to `iso` (sorted). */
export function weekStartsOfMonthUpTo(iso: string): string[] {
  return Array.from(new Set(monthDatesUpTo(iso).map(weekStartIso))).sort();
}

/** ISO 8601 week number of `iso`. */
export function isoWeekNumber(iso: string): number {
  const thursday = toUtc(addDaysIso(iso, 4 - isoDayOfWeek(iso)));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** "16 listopada" — Polish label of `iso`, independent of the viewer's time zone. */
export function formatDayMonthPl(iso: string): string {
  return toUtc(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" });
}
