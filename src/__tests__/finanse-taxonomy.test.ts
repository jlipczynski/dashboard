import { describe, it, expect } from "vitest";
import {
  validateCategoryPatch,
  validateSubcategoryPatch,
  deleteGuard,
  mergePlan,
  reorder,
} from "../lib/finanse-taxonomy";

const ICONS = ["home", "paw"];

describe("validateCategoryPatch", () => {
  it("accepts known fields, trims the name, uppercases the colour, ignores unknown fields", () => {
    const r = validateCategoryPatch({ name: "  Zwierzęta  domowe ", color: "#9b7a52", icon: "paw", type: "expense", id: "x", foo: 1 }, ICONS);
    expect(r).toEqual({ ok: true, value: { name: "Zwierzęta domowe", color: "#9B7A52", icon: "paw", type: "expense" } });
  });
  it("rejects empty name, unknown type/icon, bad colour, non-integer order, empty patch", () => {
    expect(validateCategoryPatch({ name: "   " }, ICONS).ok).toBe(false);
    expect(validateCategoryPatch({ type: "loan" }, ICONS).ok).toBe(false);
    expect(validateCategoryPatch({ icon: "rocket" }, ICONS).ok).toBe(false);
    expect(validateCategoryPatch({ color: "red" }, ICONS).ok).toBe(false);
    expect(validateCategoryPatch({ sort_order: 1.5 }, ICONS).ok).toBe(false);
    expect(validateCategoryPatch({}, ICONS)).toEqual({ ok: false, error: "Nic do zmiany" });
  });
});

describe("validateSubcategoryPatch", () => {
  it("kind can be set or cleared; unknown kind rejected", () => {
    expect(validateSubcategoryPatch({ kind: "discretionary" })).toEqual({ ok: true, value: { kind: "discretionary" } });
    expect(validateSubcategoryPatch({ kind: null })).toEqual({ ok: true, value: { kind: null } });
    expect(validateSubcategoryPatch({ kind: "luxury" }).ok).toBe(false);
  });
  it("move needs a target category id", () => {
    expect(validateSubcategoryPatch({ category_id: "" }).ok).toBe(false);
    expect(validateSubcategoryPatch({ category_id: "c2" })).toEqual({ ok: true, value: { category_id: "c2" } });
  });
});

describe("deleteGuard", () => {
  it("allows only when nothing refers to the item — trash counts too", () => {
    expect(deleteGuard({ transactions: 0, trashed: 0, rules: 0, subcategories: 0 })).toEqual({ ok: true });
    const r = deleteGuard({ transactions: 0, trashed: 1, rules: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("Ma 1 transakcji (w tym 1 w koszu) — najpierw scal");
    const d = deleteGuard({ transactions: 120, trashed: 0, rules: 5, subcategories: 12 });
    if (!d.ok) expect(d.reason).toBe("Ma 120 transakcji, 5 reguł, 12 podkategorii — najpierw scal");
  });
});

describe("mergePlan", () => {
  const a = { id: "a", name: "TEST scalanie" };
  const b = { id: "b", name: "Restauracje i kawiarnie" };
  it("summary with counts", () => {
    const r = mergePlan("subcategory", a, b, { transactions: 0, trashed: 0, rules: 0 });
    expect(r.ok && r.value.summary).toBe(
      "Przeniosę 0 transakcji i 0 reguł z „TEST scalanie” do „Restauracje i kawiarnie”, potem usunę podkategorię „TEST scalanie”."
    );
    const c = mergePlan("category", { id: "x", name: "Stara" }, { id: "y", name: "Nowa" }, { transactions: 3, trashed: 1, rules: 2, subcategories: 2 });
    expect(c.ok && c.value.summary).toContain("Przeniosę 4 transakcji (w tym 1 w koszu) i 2 reguł oraz 2 podkategorii");
  });
  it("rejects self-merge and missing items", () => {
    expect(mergePlan("category", a, a, { transactions: 0, trashed: 0, rules: 0 }).ok).toBe(false);
    expect(mergePlan("category", a, undefined, { transactions: 0, trashed: 0, rules: 0 }).ok).toBe(false);
  });
});

describe("reorder", () => {
  const items = [
    { id: "dom", name: "Dom", sort_order: 10 },
    { id: "dzieci", name: "Dzieci", sort_order: 20 },
    { id: "jedzenie", name: "Jedzenie", sort_order: 30 },
  ];
  it("swaps with the neighbour and renumbers 10, 20, 30", () => {
    expect(reorder(items, "jedzenie", "up")).toEqual([
      { id: "dom", sort_order: 10 },
      { id: "jedzenie", sort_order: 20 },
      { id: "dzieci", sort_order: 30 },
    ]);
  });
  it("first item up / last item down → order unchanged", () => {
    expect(reorder(items, "dom", "up").map((x) => x.id)).toEqual(["dom", "dzieci", "jedzenie"]);
    expect(reorder(items, "jedzenie", "down").map((x) => x.id)).toEqual(["dom", "dzieci", "jedzenie"]);
  });
});
