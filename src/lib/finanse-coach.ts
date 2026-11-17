// "Coach wydatków" (brief Finanse 09) — pure logic, no DB, no AI.
// Monthly cost-of-living limit: an editable value with a status (approved by Jan on 17.11.2026: 20 000 zł,
// all expenses). Until approved it is a working proposal ("Do zatwierdzenia"). "Spent" uses the ONE definition of expenses
// (summarizeExpenses), so the coach, the dashboard and the home card show the same number.
// All sums in grosze (integers).

import { summarizeExpenses, type SummaryCategoryDef } from "./finanse-summary";
import type { DashRow } from "./finanse-dashboard";
import { extractMerchant } from "./finanse-merchant";

export const BIG_EXPENSE_ZL = 1000;

export type GoalStatus = "pending" | "approved";
export type Goal = { monthly_limit: number | string; counts: "all" | "recurring"; status?: GoalStatus };

/** Validates an edit of the limit: a positive amount and/or a status. */
export function validateGoalPatch(input: Record<string, unknown>):
  | { ok: true; value: { monthly_limit?: string; status?: GoalStatus } }
  | { ok: false; error: string } {
  const out: { monthly_limit?: string; status?: GoalStatus } = {};
  if (input.monthlyLimit !== undefined) {
    const v = Number(String(input.monthlyLimit).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(v) || v <= 0 || v > 1_000_000) return { ok: false, error: "Podaj limit większy od zera" };
    out.monthly_limit = (Math.round(v * 100) / 100).toFixed(2);
  }
  if (input.status !== undefined) {
    if (input.status !== "pending" && input.status !== "approved") return { ok: false, error: "Nieznany status" };
    out.status = input.status;
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "Nic do zmiany" };
  return { ok: true, value: out };
}

export type CoachRow = DashRow & { id: string };

export type MonthStatus = {
  spent: number; // net expenses this month (all, incl. one-off)
  spentRecurring: number; // without one-off expenses
  plannedRemaining: number; // planned purchases not bought / dropped yet
  runRateBase: number; // running variable spending so far (see RUN_RATE_*), zł
  dailyRate: number; // runRateBase / dayOfMonth, zł (rounded to the grosz for display)
  runRest: number; // dailyRate × daysLeft — expected running spending until the end of the month
  forecast: number; // counted spend + runRest + plannedRemaining
  limit: number;
  left: number; // limit − forecast (negative = over)
  overBy: number; // max(0, −left)
  dayOfMonth: number;
  daysInMonth: number;
  daysLeft: number; // daysInMonth − dayOfMonth (0 on the last day)
  perDayLeft: number; // left / daysLeft when left > 0 and days are left, else 0
  preliminary: boolean; // dayOfMonth < 5: too little data, the forecast is only indicative
};

/** A single expense at or above this amount is not "running" spending (it would distort the daily rate). */
export const RUN_RATE_MAX_ZL = 1000;
export const PRELIMINARY_BEFORE_DAY = 5;

const toGr = (v: number | string) => Math.round(Number(v) * 100);
const toZl = (gr: number) => gr / 100;
const pad = (n: number) => String(n).padStart(2, "0");

/** First and last day of the month containing `today` (YYYY-MM-DD). */
export function monthBounds(today: string): { from: string; to: string; days: number } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(days)}`, days };
}

/** Net one-off spending in expense categories (and uncategorized outflows), in grosze. */
function oneOffGr(rows: DashRow[], categories: SummaryCategoryDef[]): number {
  const type = new Map(categories.map((c) => [c.id, c.type]));
  let gr = 0;
  for (const r of rows) {
    if (r.deleted_at || !r.one_off) continue;
    const t = r.category_id ? type.get(r.category_id) : undefined;
    const isExpense = t ? t === "expense" : toGr(r.amount) < 0;
    if (isExpense) gr -= toGr(r.amount);
  }
  return gr;
}

/**
 * @param rows             transactions of the current month
 * @param plannedRemaining sum of planned purchases still "planned" (zł)
 * @param today            YYYY-MM-DD (Jan's time zone)
 */
/**
 * Running variable spending of the month so far, in grosze: outflows in "expense" categories from the 1st to
 * `today` that are NOT one-off, NOT ≥ 1 000 zł, NOT in a "fixed" subcategory, and not refunds.
 */
export function runRateBaseGr(rows: DashRow[], categories: SummaryCategoryDef[], subcategories: { id: string; kind?: string | null }[], today: string): number {
  const type = new Map(categories.map((c) => [c.id, c.type]));
  const kind = new Map(subcategories.map((s) => [s.id, s.kind ?? null]));
  const { from } = monthBounds(today);
  let gr = 0;
  for (const r of rows) {
    if (r.deleted_at || r.one_off || r.date < from || r.date > today) continue;
    if (!r.category_id || type.get(r.category_id) !== "expense") continue;
    if (r.subcategory_id && kind.get(r.subcategory_id) === "fixed") continue;
    const a = toGr(r.amount);
    if (a >= 0 || a <= -RUN_RATE_MAX_ZL * 100) continue;
    gr -= a;
  }
  return gr;
}

/**
 * THE month forecast — one function for the dashboard WIG bar, review step 4, the coach and the "tempo" pattern.
 *   forecast = spent + runRest + plannedRemaining,  runRest = runRateBase / dayOfMonth × daysLeft
 * TODO (from January 2027): add fixed costs of the previous month that have not arrived yet this month
 * (now there is data for November only, so they are not added).
 */
export function monthStatus(
  rows: DashRow[],
  categories: SummaryCategoryDef[],
  subcategories: { id: string; kind?: string | null }[],
  plannedRemaining: number,
  goal: Goal,
  today: string
): MonthStatus {
  const spentGr = toGr(summarizeExpenses(rows, categories).total);
  const recurringGr = spentGr - oneOffGr(rows, categories);
  const plannedGr = toGr(plannedRemaining);
  const countedGr = goal.counts === "recurring" ? recurringGr : spentGr;
  const { days: daysInMonth } = monthBounds(today);
  const dayOfMonth = Number(today.slice(8, 10));
  const daysLeft = daysInMonth - dayOfMonth;
  const baseGr = runRateBaseGr(rows, categories, subcategories, today);
  const runRestGr = Math.round((baseGr * daysLeft) / dayOfMonth); // rounded to the grosz at the end
  const forecastGr = countedGr + runRestGr + plannedGr;
  const limitGr = toGr(goal.monthly_limit);
  const leftGr = limitGr - forecastGr;
  return {
    spent: toZl(spentGr),
    spentRecurring: toZl(recurringGr),
    plannedRemaining: toZl(plannedGr),
    runRateBase: toZl(baseGr),
    dailyRate: toZl(Math.round(baseGr / dayOfMonth)),
    runRest: toZl(runRestGr),
    forecast: toZl(forecastGr),
    limit: toZl(limitGr),
    left: toZl(leftGr),
    overBy: toZl(Math.max(0, -leftGr)),
    dayOfMonth,
    daysInMonth,
    daysLeft,
    perDayLeft: leftGr > 0 && daysLeft > 0 ? Math.floor(leftGr / daysLeft) / 100 : 0,
    preliminary: dayOfMonth < PRELIMINARY_BEFORE_DAY,
  };
}

export type BigExpense = {
  id: string;
  date: string;
  amount: number; // positive zł
  payee: string;
  categoryId: string | null;
  categoryName: string | null;
};

// Card payment in any currency: "DOP. MC 000000******0000 PŁATNOŚĆ KARTĄ 1200.06 PLN SHOP CITY" → "SHOP CITY"
const CARD_ANY_CURRENCY = /PŁATNOŚĆ KARTĄ [\d,.]+ [A-Z]{3} (.+)/;

/**
 * Payee shown to Jan and to the AI: counterparty → merchant → shop from a card description → description.
 * Masked card numbers and account numbers are removed.
 */
export function payeeOf(r: { counterparty: string | null; merchant: string | null; description: string }): string {
  // Foreign-currency card payments carry the FX rate first: "1 EUR=4.5457 PLN MIRO.COM …"
  const card = r.description.match(CARD_ANY_CURRENCY)?.[1]?.replace(/^\d+ [A-Z]{3}=[\d.,]+ [A-Z]{3}\s+/, "");
  // A card shop name wins over `merchant`, which for older rows holds the whole bank description.
  const raw = r.counterparty?.trim() || card?.trim() || r.merchant?.trim() || extractMerchant(r.description);
  return raw
    .replace(/\d+\*+\d+/g, "")
    .replace(/\b(?:PL)?\d{2}(?:[  ]?\d{4}){6}\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * Single expense transactions ≥ 1 000 zł (expense categories) without a decision yet, biggest first.
 */
export function bigExpensesToDiscuss(
  rows: CoachRow[],
  categories: SummaryCategoryDef[],
  decidedIds: ReadonlySet<string>
): BigExpense[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return rows
    .filter((r) => {
      if (r.deleted_at || decidedIds.has(r.id)) return false;
      const c = r.category_id ? byId.get(r.category_id) : undefined;
      return c?.type === "expense" && -toGr(r.amount) >= BIG_EXPENSE_ZL * 100;
    })
    .map((r) => {
      const c = r.category_id ? byId.get(r.category_id) : undefined;
      return {
        id: r.id,
        date: r.date,
        amount: toZl(-toGr(r.amount)),
        payee: payeeOf(r),
        categoryId: r.category_id,
        categoryName: c?.name ?? null,
      };
    })
    .sort((a, b) => b.amount - a.amount || a.date.localeCompare(b.date));
}

/** Monday of the week containing `today`. */
export function weekStartOf(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export const NECESSARY = ["yes", "partly", "no"] as const;
export type Necessary = (typeof NECESSARY)[number];

/** Validates a decision for a big expense. */
export function validateDecision(input: Record<string, unknown>):
  | { ok: true; value: { transaction_id: string; necessary: Necessary; recurring: boolean; horizon_until: string | null; plan: string | null } }
  | { ok: false; error: string } {
  const id = input.transactionId;
  if (typeof id !== "string" || !id) return { ok: false, error: "Brak transakcji" };
  if (!NECESSARY.includes(input.necessary as Necessary)) return { ok: false, error: "Wybierz: konieczny tak / częściowo / nie" };
  if (typeof input.recurring !== "boolean") return { ok: false, error: "Odpowiedz, czy wydatek wróci" };
  let horizon: string | null = null;
  if (input.recurring) {
    if (typeof input.horizonUntil !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.horizonUntil)) {
      return { ok: false, error: "Podaj datę „do kiedy” — wydatek wraca" };
    }
    horizon = input.horizonUntil;
  }
  const plan = typeof input.plan === "string" && input.plan.trim() ? input.plan.trim().slice(0, 500) : null;
  if (input.recurring && !plan) return { ok: false, error: "Podaj plan ograniczenia — wydatek wraca" };
  return { ok: true, value: { transaction_id: id, necessary: input.necessary as Necessary, recurring: input.recurring, horizon_until: horizon, plan } };
}

// ── AI coach prompt (no account numbers, no full descriptions: payee, amount, category, date only) ──

export type CoachStep = 2 | 3 | 4 | 5;

export type CoachContext = {
  today: string;
  status: MonthStatus;
  limitApproved?: boolean; // false/undefined → the limit is a working proposal, not Jan's decision
  big?: BigExpense | null; // step 2: the expense being discussed
  planned?: { name: string; amount: number; status: string }[];
  discretionaryTop?: { category: string; subcategory: string; amount: number }[];
  lastCommitment?: string | null;
  recentDecisions?: { payee: string; amount: number; necessary: string; recurring: boolean; plan: string | null }[];
  /** Brief 10: what Jan accepted (finance_coach_insights) + facts from finanse-patterns. */
  knowledge?: { insights: { kind: string; text: string }[]; patterns: string[] };
};

export const COACH_SYSTEM = `Jesteś coachem wydatków Jana. Pomagasz mu kontrolować koszty życia.
Ton: konkretny i wymagający, bez komplementów i bez ogólników. Operuj liczbami z danych.
„Wydane” to stan na dziś, a nie wynik miesiąca: nigdy nie pisz, że wydana kwota to finalne przekroczenie.
O końcu miesiąca mów wyłącznie na podstawie prognozy (wydane + bieżące wydatki do końca miesiąca + planowane zakupy).
Limit miesięczny może być ROBOCZY (niezatwierdzony). Wtedy nie traktuj go jako celu Jana: mów o nim jako o propozycji
i zachęć do decyzji, jaki limit ma obowiązywać. Gdy limit jest zatwierdzony i miesiąc idzie ponad niego,
powiedz to wprost i zapytaj, co Jan obetnie.
Odpowiadasz po polsku, maksymalnie ~120 słów: 1–3 krótkie, konkretne pytania albo jeden challenge.
Nie wymyślaj danych, których nie dostałeś.
Jeśli dostajesz ustalenia Jana (zaakceptowaną wiedzę), odwołuj się do nich, gdy dotyczą tematu
(np. „Ustaliłeś zasadę 48 godzin. Ten zakup…”). Wzorce to fakty z danych: cytuj liczby, nie interpretuj psychologii.
Pisz zwykłym tekstem: bez markdown (żadnych **, #, list z myślnikami), pytania numeruj „1.”, „2.”.`;

const zlText = (v: number) => `${v.toFixed(2).replace(".", ",")} zł`;
const cleanText = (s: string) => s.replace(/\d{2}(?:[  ]?\d{4}){6}/g, "…").slice(0, 60);
const longText = (s: string) => s.replace(/\d{2}(?:[ \u00a0]?\d{4}){6}/g, "…").slice(0, 300);

export function buildCoachPrompt(step: CoachStep, ctx: CoachContext, answer?: string): string {
  const s = ctx.status;
  const limitLabel = ctx.limitApproved ? `Limit (zatwierdzony): ${zlText(s.limit)}.` : `Limit ROBOCZY, niezatwierdzony przez Jana: ${zlText(s.limit)}.`;
  const vsLimit = ctx.limitApproved
    ? s.overBy > 0
      ? `Prognoza ponad limit: PRZEKROCZENIE o ${zlText(s.overBy)} (prognoza, nie wynik końcowy).`
      : `Zostało ${zlText(s.left)} na ${s.daysLeft} dni (${zlText(s.perDayLeft)} dziennie).`
    : s.overBy > 0
      ? `Prognoza jest o ${zlText(s.overBy)} powyżej limitu roboczego.`
      : `Do limitu roboczego brakuje ${zlText(s.left)}.`;
  const lines = [
    `Dziś: ${ctx.today} (${s.dayOfMonth}. dzień z ${s.daysInMonth}). ${limitLabel} Wydane do dziś: ${zlText(s.spent)} (bez jednorazowych ${zlText(s.spentRecurring)}).`,
    `Bieżące wydatki do końca miesiąca: ~${zlText(s.runRest)} (${zlText(s.dailyRate)}/dzień × ${s.daysLeft} dni). Planowane zakupy: ${zlText(s.plannedRemaining)}.`,
    `Prognoza na koniec miesiąca: ${zlText(s.forecast)}${s.preliminary ? " (wstępna — mało danych)" : ""}. ${vsLimit}`,
  ];
  if (step === 2 && ctx.big) {
    lines.push(
      `Krok: omówienie dużego wydatku. Odbiorca: ${cleanText(ctx.big.payee)}, kwota ${zlText(ctx.big.amount)}, kategoria ${ctx.big.categoryName ?? "brak"}, data ${ctx.big.date}.`,
      "Zapytaj, czy był konieczny, co z niego było planowane i czy wróci (do kiedy). Jeśli wraca — o plan ograniczenia."
    );
  }
  if (step === 3) {
    const p = (ctx.planned ?? []).filter((x) => x.status === "planned");
    lines.push(
      `Krok: planowane zakupy w tym miesiącu: ${p.length ? p.map((x) => `${cleanText(x.name)} ${zlText(x.amount)}`).join("; ") : "brak"}.`,
      "Skomentuj sumę względem limitu i dopytaj, czy coś można przesunąć albo z czegoś zrezygnować."
    );
  }
  if (step === 4) {
    const d = ctx.discretionaryTop ?? [];
    lines.push(
      `Krok: prognoza miesiąca. Uznaniowe w tym miesiącu: ${d.length ? d.map((x) => `${x.category}/${x.subcategory} ${zlText(x.amount)}`).join("; ") : "brak danych o rodzaju"}.`,
      "Zapytaj, co konkretnie Jan obetnie do końca miesiąca i o ile złotych."
    );
  }
  if (step === 5) {
    lines.push(
      ctx.lastCommitment
        ? `Poprzednie zobowiązanie: „${cleanText(ctx.lastCommitment)}”. Zapytaj, czy je dotrzymał.`
        : "To pierwszy przegląd z zobowiązaniem.",
      "Pomóż sformułować jedno mierzalne zobowiązanie na ten tydzień."
    );
  }
  const decisions = ctx.recentDecisions ?? [];
  if (decisions.length) {
    lines.push(
      "Wcześniejsze decyzje Jana: " +
        decisions
          .map(
            (d) =>
              `${cleanText(d.payee)} ${zlText(d.amount)} — konieczny: ${d.necessary}${d.recurring ? `, wraca${d.plan ? `, plan: ${cleanText(d.plan)}` : ""}` : ""}`
          )
          .join("; ")
    );
  }
  const k = ctx.knowledge;
  if (k?.insights.length) {
    lines.push("Ustalenia Jana (zaakceptowane): " + k.insights.map((i) => `[${i.kind}] ${longText(i.text)}`).join(" | "));
  }
  if (k?.patterns.length) lines.push("Wzorce w danych (fakty): " + k.patterns.map(longText).join(" | "));
  if (answer?.trim()) lines.push(`Odpowiedź Jana: „${answer.trim().slice(0, 500)}”. Odnieś się do niej konkretnie.`);
  return lines.join("\n");
}
