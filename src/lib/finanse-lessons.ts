// Brief Finanse 10, step 3: "Lekcja tygodnia" — one saving principle illustrated with ONE example from Jan's
// own data of the last 7 days, with numbers. Deterministic, no AI. Lessons do not repeat: principles never
// used come first, then the one used longest ago (round-robin); a principle without an example this week is skipped.
// All sums in grosze.

import { payeeOf } from "./finanse-coach";

export type LessonRow = {
  date: string;
  amount: number | string;
  category_id: string | null;
  subcategory_id: string | null;
  merchant: string | null;
  counterparty: string | null;
  description: string;
  one_off?: boolean | null;
  deleted_at?: string | null;
};
export type LessonCategory = { id: string; name: string; type: string };
export type LessonSubcategory = { id: string; kind?: string | null };

export const PRINCIPLES = [
  { key: "koszt_roczny", title: "Koszt roczny małych wydatków" },
  { key: "koszt_alternatywny", title: "Koszt alternatywny" },
  { key: "regula_48h", title: "Zasada 48 godzin" },
  { key: "subskrypcje", title: "Roczny koszt subskrypcji" },
  { key: "najpierw_sobie", title: "Płać najpierw sobie" },
] as const;
export type PrincipleKey = (typeof PRINCIPLES)[number]["key"];

export type Lesson = { principle: PrincipleKey; title: string; text: string; evidence: Record<string, unknown> };

export const LESSON_DAYS = 7;
export const BIG_DISCRETIONARY_ZL = 200;
export const SAFE_WITHDRAWAL = 0.04;
const SUBSCRIPTIONS_CATEGORY = "Subskrypcje";

const toGr = (v: number | string) => Math.round(Number(v) * 100);
const zl = (gr: number) => gr / 100;
const fmt = (gr: number) => {
  const abs = Math.abs(gr);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${gr < 0 ? "-" : ""}${whole},${String(abs % 100).padStart(2, "0")} zł`;
};
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Tx = { date: string; gr: number; payee: string; catType: string | null; catName: string | null; disc: boolean; oneOff: boolean };

/** Order in which principles are tried: never used first (list order), then least recently used. */
export function principleOrder(used: { principle: string; at: string }[]): PrincipleKey[] {
  const last = new Map<string, string>();
  for (const u of used) if (!last.has(u.principle) || last.get(u.principle)! < u.at) last.set(u.principle, u.at);
  return PRINCIPLES.map((p, i) => ({ key: p.key, at: last.get(p.key) ?? "", i }))
    .sort((a, b) => (a.at === b.at ? a.i - b.i : a.at === "" ? -1 : b.at === "" ? 1 : a.at.localeCompare(b.at)))
    .map((p) => p.key);
}

type Builder = (tx: Tx[]) => { text: string; evidence: Record<string, unknown> } | null;

const BUILDERS: Record<PrincipleKey, Builder> = {
  // The same discretionary payee ≥ 2 times in 7 days → the yearly cost at this pace.
  koszt_roczny: (tx) => {
    const by = new Map<string, Tx[]>();
    for (const t of tx) if (t.disc && !t.oneOff && t.gr < 0) by.set(t.payee, [...(by.get(t.payee) ?? []), t]);
    const best = [...by.values()].filter((g) => g.length >= 2).sort((a, b) => b.reduce((s, t) => s - t.gr, 0) - a.reduce((s, t) => s - t.gr, 0))[0];
    if (!best) return null;
    const sum = best.reduce((s, t) => s - t.gr, 0);
    return {
      text: `${best[0].payee}: ${best.length}× w ostatnich 7 dniach, razem ${fmt(sum)}. W tym tempie to ${fmt(sum * 52)} rocznie. Małe, częste kwoty w skali roku robią duże sumy.`,
      evidence: { payee: best[0].payee, count: best.length, total: zl(sum), yearly: zl(sum * 52), dates: best.map((t) => t.date) },
    };
  },
  // The biggest discretionary purchase → what it would cost if it came back every month.
  koszt_alternatywny: (tx) => {
    const big = tx.filter((t) => t.disc && !t.oneOff && t.gr < 0).sort((a, b) => a.gr - b.gr)[0];
    if (!big) return null;
    const p = -big.gr;
    const freedom = Math.round((p * 12) / SAFE_WITHDRAWAL);
    return {
      text: `Największy wydatek uznaniowy tygodnia: ${big.payee}, ${fmt(p)} (${big.date}). Każde ${fmt(p)} wydawane co miesiąc podnosi Liczbę wolności o ${fmt(freedom)} (×12 ÷ 4%). Zanim kupisz, zapytaj: z czego za to rezygnuję?`,
      evidence: { payee: big.payee, amount: zl(p), date: big.date, freedomNumberIncrease: zl(freedom) },
    };
  },
  // Discretionary purchases ≥ 200 zł in 7 days → the 48-hour rule.
  regula_48h: (tx) => {
    const list = tx.filter((t) => t.disc && t.gr <= -BIG_DISCRETIONARY_ZL * 100).sort((a, b) => a.gr - b.gr);
    if (!list.length) return null;
    const sum = list.reduce((s, t) => s - t.gr, 0);
    return {
      text: `W ostatnich 7 dniach ${list.length} ${list.length === 1 ? "zakup uznaniowy" : "zakupy uznaniowe"} ≥ 200 zł, razem ${fmt(sum)} (największy: ${list[0].payee}, ${fmt(-list[0].gr)}). Zasada 48 godzin: wpisz zakup na listę planowanych i wróć po 2 dniach — jeśli nadal jest potrzebny, kup.`,
      evidence: { count: list.length, total: zl(sum), cases: list.map((t) => ({ date: t.date, amount: zl(-t.gr), payee: t.payee })) },
    };
  },
  // A subscription paid this week → its yearly cost.
  subskrypcje: (tx) => {
    const sub = tx.filter((t) => t.catName === SUBSCRIPTIONS_CATEGORY && !t.oneOff && t.gr < 0).sort((a, b) => a.gr - b.gr)[0];
    if (!sub) return null;
    const p = -sub.gr;
    return {
      text: `${sub.payee}: ${fmt(p)} (${sub.date}). Jako opłata miesięczna to ${fmt(p * 12)} rocznie. Raz na kwartał sprawdź każdą subskrypcję: czy z niej korzystasz?`,
      evidence: { payee: sub.payee, amount: zl(p), date: sub.date, yearly: zl(p * 12) },
    };
  },
  // Savings transfers vs discretionary spending in 7 days → pay yourself first.
  najpierw_sobie: (tx) => {
    const saved = tx.filter((t) => t.catType === "transfer" && t.gr < 0).reduce((s, t) => s - t.gr, 0);
    const disc = tx.filter((t) => t.disc && t.gr < 0).reduce((s, t) => s - t.gr, 0);
    if (saved <= 0 && disc <= 0) return null;
    return {
      text: `W ostatnich 7 dniach odłożone (przelewy na cele i własne konta): ${fmt(saved)}, wydatki uznaniowe: ${fmt(disc)}. Płać najpierw sobie: stały przelew na oszczędności zaraz po wpływie, zanim zaczniesz wydawać.`,
      evidence: { saved: zl(saved), discretionary: zl(disc) },
    };
  },
};

/** The lesson of the week for `today` (last 7 days of data), or null when no principle has an example. */
export function buildLesson(input: {
  rows: LessonRow[];
  categories: LessonCategory[];
  subcategories: LessonSubcategory[];
  today: string;
  used: { principle: string; at: string }[];
}): Lesson | null {
  const from = addDays(input.today, -(LESSON_DAYS - 1));
  const cat = new Map(input.categories.map((c) => [c.id, c]));
  const kind = new Map(input.subcategories.map((s) => [s.id, s.kind ?? null]));
  const tx: Tx[] = input.rows
    .filter((r) => !r.deleted_at && r.date >= from && r.date <= input.today)
    .map((r) => {
      const c = r.category_id ? cat.get(r.category_id) : undefined;
      return {
        date: r.date,
        gr: toGr(r.amount),
        payee: payeeOf({ counterparty: r.counterparty, merchant: r.merchant, description: r.description ?? "" }),
        catType: c?.type ?? null,
        catName: c?.name ?? null,
        disc: c?.type === "expense" && !!r.subcategory_id && kind.get(r.subcategory_id) === "discretionary",
        oneOff: !!r.one_off,
      };
    });
  for (const key of principleOrder(input.used)) {
    const res = BUILDERS[key](tx);
    if (!res) continue;
    const title = PRINCIPLES.find((p) => p.key === key)!.title;
    return { principle: key, title, text: res.text, evidence: { principle: key, from, to: input.today, ...res.evidence } };
  }
  return null;
}
