// "Moja liczba wolności" — deterministic capital simulator (pure, no DB, no I/O).
// Everything is in TODAY'S purchasing power: the return is REAL, net of taxes and costs.
//   monthly rate         r = (1 + R)^(1/12) − 1
//   end of month         K_next = K × (1 + r) − withdrawal (+ reinvested surplus, if Jan chooses so)
//   withdrawal           max(0, expenses − other income)
// Two strategies of the same model:
//   preserve — spend only what keeps the REAL value of the starting capital (K × r; nothing when r ≤ 0)
//   consume  — an annuity that leaves `bequest` at the target age (handles r > 0, r = 0, r < 0)
// This is a deterministic model, not a guarantee and not a market-risk simulation.

export type Strategy = "preserve" | "consume";
export type ParamStatus = "verified" | "estimate" | "scenario" | "missing";

export type FreedomParams = {
  capital: number; // zł, assets that can really finance life (not the whole net worth)
  expenses: number; // zł / month — current cost of living
  income: number; // zł / month — other durable net income, independent of the simulated capital
  rentPart: number; // zł / month — the part of `income` that is rent from a property
  propertyInCapital: boolean; // the rented property's value is counted in `capital` (to be sold) → its rent is NOT income
  age: number;
  endAge: number;
  realReturn: number; // annual, e.g. 0.03
  bequest: number; // real capital to leave at the end (e.g. to the children)
  reinvestSurplus: boolean; // income above expenses goes into the portfolio
  strategy: Strategy;
};

export const LIMITS = {
  capital: { min: 0, max: 20_000_000 },
  expenses: { min: 0, max: 100_000 },
  income: { min: 0, max: 100_000 },
  age: { min: 40, max: 70 },
  endAge: { min: 65, max: 105 },
  realReturn: { min: -0.05, max: 0.08 },
  bequest: { min: 0, max: 20_000_000 },
} as const;

/** Risk presets (real annual return). Shown explicitly — not probabilities, not guarantees. */
export const RISK_PRESETS = { cautious: 0.01, base: 0.03, favorable: 0.05 } as const;
/** The chart compares the chosen return with ±2 percentage points. */
export const SPREAD = 0.02;

export const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;
const EPS = 1e-12;

/** Other income used in the model: rent is dropped when the property itself is counted as capital (no double counting). */
export function effectiveIncome(p: Pick<FreedomParams, "income" | "rentPart" | "propertyInCapital">): number {
  const rent = Math.min(Math.max(0, p.rentPart), Math.max(0, p.income));
  return Math.max(0, p.income - (p.propertyInCapital ? rent : 0));
}

export const monthsBetween = (age: number, endAge: number) => Math.max(0, Math.round((endAge - age) * 12));

/** Highest monthly withdrawal that keeps the real value of `capital` (0 when r ≤ 0). */
export function preserveWithdrawal(capital: number, r: number): number {
  return r > EPS ? capital * r : 0;
}

/** Annuity: monthly withdrawal for `n` months that leaves `end` (real) — r > 0, r = 0 and r < 0. Never negative. */
export function consumeWithdrawal(capital: number, r: number, n: number, end: number): number {
  if (n <= 0) return 0;
  if (Math.abs(r) < EPS) return Math.max(0, (capital - end) / n);
  const pvEnd = end / Math.pow(1 + r, n);
  return Math.max(0, ((capital - pvEnd) * r) / (1 - Math.pow(1 + r, -n)));
}

/** Capital needed to pay `need` per month while keeping the capital (Infinity when r ≤ 0 and need > 0). */
export function requiredCapitalPreserve(need: number, r: number): number {
  if (need <= 0) return 0;
  return r > EPS ? need / r : Infinity;
}

/** Capital needed to pay `need` per month for `n` months and still leave `end`. */
export function requiredCapitalConsume(need: number, r: number, n: number, end: number): number {
  const pay = Math.max(0, need);
  if (n <= 0) return end;
  if (Math.abs(r) < EPS) return pay * n + end;
  return (pay * (1 - Math.pow(1 + r, -n))) / r + end / Math.pow(1 + r, n);
}

export type SimPoint = { age: number; capital: number; withdrawal: number };
export type Simulation = { points: SimPoint[]; endCapital: number; depletedAtAge: number | null; shortfallMonths: number };

/**
 * Month-by-month projection from `age` to `endAge` with a fixed monthly withdrawal (and, if chosen, a reinvested
 * surplus). Capital never goes below 0: when it runs out, the depletion age is recorded and the rest is a shortfall.
 * `points` holds one point per year (plus the end), each with the monthly withdrawal actually paid then.
 */
export function simulate(capital: number, annualReturn: number, age: number, endAge: number, withdrawal: number, surplus = 0): Simulation {
  const r = monthlyRate(annualReturn);
  const n = monthsBetween(age, endAge);
  let k = Math.max(0, capital);
  let depleted: number | null = null;
  let shortfall = 0;
  const points: SimPoint[] = [{ age, capital: k, withdrawal: Math.min(withdrawal, k) }];
  for (let m = 1; m <= n; m++) {
    const grown = k * (1 + r);
    const paid = Math.min(withdrawal, grown);
    if (paid < withdrawal - EPS) {
      shortfall++;
      if (depleted === null) depleted = age + (m - 1) / 12;
    }
    k = Math.max(0, grown - paid + surplus);
    if (m % 12 === 0 || m === n) points.push({ age: age + m / 12, capital: k, withdrawal: paid });
  }
  return { points, endCapital: k, depletedAtAge: depleted, shortfallMonths: shortfall };
}

export type FreedomResult = {
  r: number;
  months: number;
  income: number; // effective other income
  rentExcluded: number; // rent dropped because the property is counted as capital
  need: number; // monthly withdrawal needed from the portfolio for current expenses
  surplus: number; // income above expenses (shown separately)
  canSpend: { preserve: number; consume: number; chosen: number };
  difference: { monthly: number; yearly: number }; // consume − preserve
  requiredCapital: { preserve: number; consume: number; chosen: number };
  capitalGap: number; // chosen required capital − capital (> 0 = missing)
  preserveImpossible: boolean; // r ≤ 0: the real value of the capital cannot be kept while withdrawing
  incomeCoversExpenses: boolean;
  base: Simulation;
  cautious: Simulation;
  favorable: Simulation;
  rates: { cautious: number; base: number; favorable: number };
  bequestRatio: number | null; // capital at the end ÷ the amount to leave
};

export function freedom(p: FreedomParams): FreedomResult {
  const r = monthlyRate(p.realReturn);
  const n = monthsBetween(p.age, p.endAge);
  const inc = effectiveIncome(p);
  const rentExcluded = Math.max(0, p.income) - inc;
  const need = Math.max(0, p.expenses - inc);
  const surplus = Math.max(0, inc - p.expenses);
  const reinvest = p.reinvestSurplus ? surplus : 0;

  const preserve = preserveWithdrawal(p.capital, r) + inc;
  const consume = consumeWithdrawal(p.capital, r, n, p.bequest) + inc;
  // Preserve: the capital stays intact, so it must also be at least the amount to leave at the end.
  const reqP = Math.max(requiredCapitalPreserve(need, r), Math.max(0, p.bequest));
  const reqC = requiredCapitalConsume(need, r, n, p.bequest);
  const reqChosen = p.strategy === "preserve" ? reqP : reqC;

  const rates = { cautious: p.realReturn - SPREAD, base: p.realReturn, favorable: p.realReturn + SPREAD };
  const base = simulate(p.capital, rates.base, p.age, p.endAge, need, reinvest);
  return {
    r,
    months: n,
    income: inc,
    rentExcluded,
    need,
    surplus,
    canSpend: { preserve, consume, chosen: p.strategy === "preserve" ? preserve : consume },
    difference: { monthly: consume - preserve, yearly: (consume - preserve) * 12 },
    requiredCapital: { preserve: reqP, consume: reqC, chosen: reqChosen },
    capitalGap: reqChosen - p.capital,
    preserveImpossible: r <= EPS && need > 0,
    incomeCoversExpenses: need === 0,
    base,
    cautious: simulate(p.capital, rates.cautious, p.age, p.endAge, need, reinvest),
    favorable: simulate(p.capital, rates.favorable, p.age, p.endAge, need, reinvest),
    rates,
    bequestRatio: p.bequest > 0 ? base.endCapital / p.bequest : null,
  };
}

// ── Defaults from the dashboard data ─────────────────────────────────────────────────────────

export type MonthTotal = { month: string; total: number; complete: boolean }; // complete = ended, all reviewed & categorized
export type DefaultValue = { value: number; status: ParamStatus; note: string };
export type FreedomDefaults = {
  capital: DefaultValue;
  expenses: DefaultValue & { months: number };
  income: DefaultValue;
  rentPart: DefaultValue;
  age: DefaultValue;
  endAge: DefaultValue;
  realReturn: DefaultValue;
  bequest: DefaultValue;
};

export const WORKING = { income: 8000, rentPart: 8000, age: 47, endAge: 85, realReturn: RISK_PRESETS.base } as const;

/**
 * Default slider values. Expenses: average of the last 12 complete, closed months (fewer → the count is shown);
 * no closed month → "Brak zatwierdzonej bazy" with a working value (the approved cost-of-living limit).
 * The current (incomplete) month is never treated as a confirmed monthly cost.
 */
export function computeDefaults(months: MonthTotal[], approvedLimit: number | null): FreedomDefaults {
  const done = months.filter((m) => m.complete).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);
  const expenses =
    done.length > 0
      ? {
          value: Math.round(done.reduce((s, m) => s + m.total, 0) / done.length),
          status: "verified" as const,
          months: done.length,
          note: done.length >= 12 ? "średnia z 12 zamkniętych miesięcy" : `średnia z ${done.length} ${done.length === 1 ? "zamkniętego miesiąca" : "zamkniętych miesięcy"}`,
        }
      : {
          value: approvedLimit ?? 0,
          status: "missing" as const,
          months: 0,
          note: approvedLimit ? "Brak zatwierdzonej bazy — kwota robocza: zatwierdzony limit kosztów życia" : "Brak zatwierdzonej bazy — ustaw kwotę roboczą",
        };
  return {
    capital: { value: 0, status: "missing", note: "Brak zatwierdzonej wartości aktywów — ustaw kapitał roboczo (tylko płynne aktywa)" },
    expenses,
    income: { value: WORKING.income, status: "estimate", note: "Szacunek: najem ok. 8 000 zł/mies. netto (bez zwrotu z portfela)" },
    rentPart: { value: WORKING.rentPart, status: "estimate", note: "Część dochodu z najmu" },
    age: { value: WORKING.age, status: "estimate", note: "Roboczo — brak danych profilu" },
    endAge: { value: WORKING.endAge, status: "scenario", note: "Horyzont planu" },
    realReturn: { value: WORKING.realReturn, status: "estimate", note: "Założenie: realnie, po podatkach i kosztach" },
    bequest: { value: 0, status: "scenario", note: "Ile chcesz zostawić (realnie)" },
  };
}

export function paramsFromDefaults(d: FreedomDefaults, strategy: Strategy = "preserve"): FreedomParams {
  return {
    capital: d.capital.value,
    expenses: d.expenses.value,
    income: d.income.value,
    rentPart: d.rentPart.value,
    propertyInCapital: false,
    age: d.age.value,
    endAge: d.endAge.value,
    realReturn: d.realReturn.value,
    bequest: d.bequest.value,
    reinvestSurplus: false,
    strategy,
  };
}

/** Clamp every parameter to its range; the end age is always at least one year after the current age. */
export function clampParams(p: FreedomParams): FreedomParams {
  const c = (v: number, l: { min: number; max: number }) => Math.min(l.max, Math.max(l.min, Number.isFinite(v) ? v : l.min));
  const age = c(p.age, LIMITS.age);
  return {
    ...p,
    capital: c(p.capital, LIMITS.capital),
    expenses: c(p.expenses, LIMITS.expenses),
    income: c(p.income, LIMITS.income),
    rentPart: Math.min(c(p.rentPart, LIMITS.income), c(p.income, LIMITS.income)),
    age,
    endAge: c(p.endAge, { min: Math.max(LIMITS.endAge.min, age + 1), max: LIMITS.endAge.max }),
    realReturn: c(p.realReturn, LIMITS.realReturn),
    bequest: c(p.bequest, LIMITS.bequest),
    strategy: p.strategy === "consume" ? "consume" : "preserve",
    propertyInCapital: !!p.propertyInCapital,
    reinvestSurplus: !!p.reinvestSurplus,
  };
}

// ── Saved scenarios ──────────────────────────────────────────────────────────────────────────

export const SCENARIO_NAME_MAX = 80;

/** A saved scenario keeps ALL parameters and where the defaults came from; it is never overwritten. */
export function validateScenario(input: Record<string, unknown>):
  | { ok: true; value: { name: string; params: FreedomParams; data_source: Record<string, unknown> } }
  | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, error: "Nazwij wariant" };
  if (name.length > SCENARIO_NAME_MAX) return { ok: false, error: `Nazwa może mieć najwyżej ${SCENARIO_NAME_MAX} znaków` };
  const p = input.params as Record<string, unknown> | undefined;
  const nums = ["capital", "expenses", "income", "rentPart", "age", "endAge", "realReturn", "bequest"] as const;
  if (!p || typeof p !== "object" || nums.some((k) => typeof p[k] !== "number" || !Number.isFinite(p[k] as number))) {
    return { ok: false, error: "Brak parametrów symulacji" };
  }
  const params = clampParams(p as unknown as FreedomParams);
  const ds = input.dataSource;
  const data_source = ds && typeof ds === "object" && !Array.isArray(ds) ? (ds as Record<string, unknown>) : {};
  return { ok: true, value: { name, params, data_source } };
}
