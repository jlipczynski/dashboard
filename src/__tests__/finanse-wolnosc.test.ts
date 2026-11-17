import { describe, it, expect } from "vitest";
import {
  monthlyRate,
  consumeWithdrawal,
  preserveWithdrawal,
  requiredCapitalConsume,
  requiredCapitalPreserve,
  simulate,
  freedom,
  effectiveIncome,
  computeDefaults,
  paramsFromDefaults,
  clampParams,
  validateScenario,
  type FreedomParams,
} from "../lib/finanse-wolnosc";

const base: FreedomParams = {
  capital: 1_000_000,
  expenses: 10_000,
  income: 0,
  rentPart: 0,
  propertyInCapital: false,
  age: 65,
  endAge: 85,
  realReturn: 0.03,
  bequest: 0,
  reinvestSurplus: false,
  strategy: "preserve",
};

describe("rates and the annuity — zero, positive and negative returns", () => {
  it("monthly effective rate r = (1 + R)^(1/12) − 1", () => {
    expect(monthlyRate(0)).toBe(0);
    expect(Math.pow(1 + monthlyRate(0.03), 12)).toBeCloseTo(1.03, 12);
    expect(Math.pow(1 + monthlyRate(-0.02), 12)).toBeCloseTo(0.98, 12);
  });

  it("zero return: capital is simply divided over the months", () => {
    expect(consumeWithdrawal(1_200_000, 0, 240, 0)).toBe(5000);
    expect(consumeWithdrawal(1_200_000, 0, 240, 200_000)).toBeCloseTo(4166.67, 2);
    expect(requiredCapitalConsume(5000, 0, 240, 0)).toBe(1_200_000);
  });

  it("for any return the annuity leaves exactly the chosen end capital", () => {
    for (const R of [-0.03, 0, 0.03]) {
      for (const end of [0, 200_000]) {
        const w = consumeWithdrawal(1_000_000, monthlyRate(R), 240, end);
        expect(simulate(1_000_000, R, 65, 85, w).endCapital).toBeCloseTo(end, 2);
        expect(requiredCapitalConsume(w, monthlyRate(R), 240, end)).toBeCloseTo(1_000_000, 2);
      }
    }
  });

  it("preserve: withdrawing K × r keeps the real capital; with r ≤ 0 nothing can be withdrawn", () => {
    const r = monthlyRate(0.03);
    expect(simulate(1_000_000, 0.03, 65, 85, preserveWithdrawal(1_000_000, r)).endCapital).toBeCloseTo(1_000_000, 4);
    expect(preserveWithdrawal(1_000_000, 0)).toBe(0);
    expect(preserveWithdrawal(1_000_000, monthlyRate(-0.01))).toBe(0);
    expect(requiredCapitalPreserve(5000, 0)).toBe(Infinity);
    expect(requiredCapitalPreserve(0, 0)).toBe(0);
    expect(freedom({ ...base, realReturn: 0 }).preserveImpossible).toBe(true);
  });

  it("negative return without withdrawals: the capital loses value", () => {
    expect(simulate(1_000_000, -0.02, 65, 66, 0).endCapital).toBeCloseTo(980_000, 4);
  });
});

describe("strategies, depletion, bequest, income", () => {
  it("consume allows more than preserve; difference monthly and yearly", () => {
    const res = freedom(base);
    expect(res.canSpend.preserve).toBeCloseTo(2466.27, 2);
    expect(res.canSpend.consume).toBeGreaterThan(res.canSpend.preserve);
    expect(res.difference.yearly).toBeCloseTo(res.difference.monthly * 12, 6);
    expect(freedom({ ...base, strategy: "consume" }).canSpend.chosen).toBe(res.canSpend.consume);
  });

  it("depletion age: 100 000 zł, 0%, 1 000 zł/month from age 47 → runs out at 55 y 4 m", () => {
    const res = freedom({ ...base, capital: 100_000, expenses: 1000, realReturn: 0, age: 47, endAge: 85 });
    expect(res.base.depletedAtAge).toBeCloseTo(47 + 100 / 12, 6);
    expect(res.base.endCapital).toBe(0);
    expect(Math.min(...res.base.points.map((x) => x.capital))).toBe(0); // never below zero
  });

  it("enough for the whole period → no depletion age", () => {
    expect(freedom({ ...base, expenses: 1000 }).base.depletedAtAge).toBeNull();
  });

  it("minimum end capital: how much of the bequest is reached", () => {
    const res = freedom({ ...base, strategy: "consume", bequest: 2_000_000, expenses: 3000 });
    expect(res.bequestRatio).toBeCloseTo(res.base.endCapital / 2_000_000, 10);
    // spending the consume maximum leaves exactly the bequest
    const max = freedom({ ...base, strategy: "consume", bequest: 500_000 });
    expect(freedom({ ...base, bequest: 500_000, expenses: max.canSpend.consume }).base.endCapital).toBeCloseTo(500_000, 2);
  });

  it("income above expenses: nothing withdrawn, surplus shown; reinvested only when chosen", () => {
    const p = { ...base, income: 12_000, rentPart: 0, expenses: 10_000 };
    const res = freedom(p);
    expect(res.need).toBe(0);
    expect(res.surplus).toBe(2000);
    expect(res.incomeCoversExpenses).toBe(true);
    expect(res.base.depletedAtAge).toBeNull();
    const noReinvest = res.base.endCapital;
    const reinvest = freedom({ ...p, reinvestSurplus: true }).base.endCapital;
    expect(reinvest).toBeGreaterThan(noReinvest);
  });

  it("no double counting: rent is dropped when the property is counted as capital", () => {
    expect(effectiveIncome({ income: 8000, rentPart: 8000, propertyInCapital: false })).toBe(8000);
    expect(effectiveIncome({ income: 8000, rentPart: 8000, propertyInCapital: true })).toBe(0);
    expect(effectiveIncome({ income: 10_000, rentPart: 8000, propertyInCapital: true })).toBe(2000);
    const res = freedom({ ...base, income: 8000, rentPart: 8000, propertyInCapital: true });
    expect(res.rentExcluded).toBe(8000);
    expect(res.need).toBe(10_000);
  });

  it("cautious / base / favorable: chosen return ± 2 pp", () => {
    const res = freedom({ ...base, expenses: 3000 });
    expect(res.rates.cautious).toBeCloseTo(0.01, 12);
    expect(res.rates.favorable).toBeCloseTo(0.05, 12);
    expect(res.cautious.endCapital).toBeLessThan(res.base.endCapital);
    expect(res.favorable.endCapital).toBeGreaterThan(res.base.endCapital);
  });

  it("moving sliders never changes the input data (pure functions)", () => {
    const p = Object.freeze({ ...base });
    freedom(p);
    clampParams(p);
    expect(p).toEqual(base);
  });
});

describe("defaults from the dashboard", () => {
  it("no closed month → 'Brak zatwierdzonej bazy' with the approved limit as a working value", () => {
    const d = computeDefaults([{ month: "2026-11", total: 25_423.51, complete: false }], 20_000);
    expect(d.expenses).toMatchObject({ value: 20_000, status: "missing", months: 0 });
    expect(d.expenses.note).toContain("Brak zatwierdzonej bazy");
    expect(d.capital.status).toBe("missing");
    expect(d.income).toMatchObject({ value: 8000, status: "estimate" });
  });

  it("closed complete months → their average, with the count; incomplete months ignored", () => {
    const d = computeDefaults(
      [
        { month: "2026-11", total: 21_000, complete: true },
        { month: "2026-12", total: 19_000, complete: true },
        { month: "2027-01", total: 50_000, complete: false },
      ],
      20_000
    );
    expect(d.expenses).toMatchObject({ value: 20_000, status: "verified", months: 2 });
    expect(d.expenses.note).toBe("średnia z 2 zamkniętych miesięcy");
  });

  it("at most the last 12 closed months", () => {
    const months = Array.from({ length: 14 }, (_, i) => ({ month: `2027-${String(i + 1).padStart(2, "0")}`, total: i < 2 ? 99_999 : 10_000, complete: true }));
    expect(computeDefaults(months, null).expenses).toMatchObject({ value: 10_000, months: 12 });
  });

  it("restoring defaults gives exactly the dashboard values", () => {
    const d = computeDefaults([], 20_000);
    expect(paramsFromDefaults(d)).toEqual({
      capital: 0,
      expenses: 20_000,
      income: 8000,
      rentPart: 8000,
      propertyInCapital: false,
      age: 47,
      endAge: 85,
      realReturn: 0.03,
      bequest: 0,
      reinvestSurplus: false,
      strategy: "preserve",
    });
  });
});

describe("parameters and saved scenarios", () => {
  it("clamps ranges; the end age is at least one year after the current age", () => {
    const c = clampParams({ ...base, age: 70, endAge: 60, realReturn: 0.5, capital: -5 });
    expect(c.endAge).toBe(71);
    expect(c.realReturn).toBe(0.08);
    expect(c.capital).toBe(0);
  });

  it("a scenario keeps all parameters and the data source (save → read gives the same)", () => {
    const v = validateScenario({ name: "  Życie do 95 lat ", params: { ...base, endAge: 95 }, dataSource: { expenses: "missing" } });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.name).toBe("Życie do 95 lat");
      expect(v.value.params).toEqual({ ...base, endAge: 95 });
      expect(v.value.data_source).toEqual({ expenses: "missing" });
      expect(JSON.parse(JSON.stringify(v.value.params))).toEqual(v.value.params);
    }
  });

  it("rejects a missing name or broken parameters", () => {
    expect(validateScenario({ name: "", params: base }).ok).toBe(false);
    expect(validateScenario({ name: "x", params: { ...base, capital: "dużo" } }).ok).toBe(false);
  });
});
