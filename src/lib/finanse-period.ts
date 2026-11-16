// Period presets for finance views ("Ten miesiąc", "Poprzedni", "3 mies.", "Od początku roku", "Własny").
// Same behaviour as the home page card (ExpensesByCategoryCard), shared by /finanse/dashboard.

export type Preset = "month" | "prev" | "3m" | "ytd" | "custom";
export type Period = { preset: Preset; from: string; to: string };

export const PRESETS: { id: Preset; label: string }[] = [
  { id: "month", label: "Ten miesiąc" },
  { id: "prev", label: "Poprzedni" },
  { id: "3m", label: "3 mies." },
  { id: "ytd", label: "Od początku roku" },
  { id: "custom", label: "Własny" },
];

const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
export const MONTHS_LONG = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthEnd = (y: number, m: number) => new Date(y, m + 1, 0); // m: 0-based

export function presetRange(preset: Exclude<Preset, "custom">, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "month":
      return { from: iso(new Date(y, m, 1)), to: iso(monthEnd(y, m)) };
    case "prev":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(monthEnd(y, m - 1)) };
    case "3m":
      return { from: iso(new Date(y, m - 2, 1)), to: iso(monthEnd(y, m)) };
    case "ytd":
      return { from: `${y}-01-01`, to: iso(now) };
  }
}

/** Months (YYYY-MM) covered by from..to, inclusive. */
export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ty = Number(to.slice(0, 4));
  const tm = Number(to.slice(5, 7));
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export const monthLabel = (ym: string) => `${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Heading for a period: "Listopad 2026", or "1.09–16.11.2026". */
export function periodTitle(p: Period): string {
  if (p.preset === "month" || p.preset === "prev") {
    return `${MONTHS_LONG[Number(p.from.slice(5, 7)) - 1]} ${p.from.slice(0, 4)}`;
  }
  const d = (s: string) => `${Number(s.slice(8, 10))}.${s.slice(5, 7)}`;
  return `${d(p.from)}–${d(p.to)}.${p.to.slice(0, 4)}`;
}

export function loadPeriod(key: string): Period {
  try {
    const p = JSON.parse(localStorage.getItem(key) || "null") as Period | null;
    if (p?.preset === "custom" && p.from && p.to) return p;
    if (p?.preset && p.preset !== "custom") return { preset: p.preset, ...presetRange(p.preset) };
  } catch {}
  return { preset: "month", ...presetRange("month") };
}

export function savePeriod(key: string, p: Period) {
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {}
}

// Whole złoty with a non-breaking space every 3 digits ("5 250 zł").
export const formatZl = (v: number) =>
  `${v < 0 ? "−" : ""}${String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} zł`;
