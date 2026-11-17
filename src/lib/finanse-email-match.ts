// CSV ↔ e-mail matching (brief Finanse 08): a transaction that already came in from an Erste alert
// must not be inserted again when the bank CSV covering that day is imported.
// Candidate = same amount to the grosz, date within ±3 days (operation vs booking date),
// e-mail row not matched by CSV yet. Pure: the API route loads rows and applies the plan.

export const MATCH_WINDOW_DAYS = 3;

export type CsvRowLite = { date: string; amountGrosze: number };
export type EmailRowLite = { id: string; date: string; amountGrosze: number };

export type MatchDecision =
  | { action: "update"; emailId: string } // exactly one candidate → update that row with CSV data
  | { action: "insert" } // no candidate → normal insert
  | { action: "insert_flag"; emailIds: string[] }; // several → insert and flag all for review

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export function withinWindow(a: string, b: string, days = MATCH_WINDOW_DAYS): boolean {
  return Math.abs(dayNumber(a) - dayNumber(b)) <= days;
}

/**
 * One decision per CSV row, in order. An e-mail row used by an "update" is no longer a candidate
 * for later CSV rows (each e-mail row is matched at most once).
 */
export function planEmailMatches(csvRows: CsvRowLite[], emailRows: EmailRowLite[]): MatchDecision[] {
  const claimed = new Set<string>();
  return csvRows.map((c) => {
    const candidates = emailRows.filter(
      (e) => !claimed.has(e.id) && e.amountGrosze === c.amountGrosze && withinWindow(e.date, c.date)
    );
    if (candidates.length === 1) {
      claimed.add(candidates[0].id);
      return { action: "update", emailId: candidates[0].id };
    }
    if (candidates.length === 0) return { action: "insert" };
    return { action: "insert_flag", emailIds: candidates.map((e) => e.id) };
  });
}

export const DUPLICATE_NOTE = "możliwy duplikat e-mail/CSV";

export const toGrosze = (v: number | string) => Math.round(Number(v) * 100);
