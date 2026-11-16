import { describe, it, expect } from "vitest";
import { similarSelection, addDismissed, parseDismissed, isCashHash, type SimilarCandidate } from "../lib/finanse-similar";

const T = "cat-target";
const OTHER = "cat-investment";
const target = { categoryId: T, subcategoryId: null, tag: null };
const c = (id: string, p: Partial<SimilarCandidate> = {}): SimilarCandidate => ({ id, categoryId: null, opaque: false, ...p });

describe("similarSelection", () => {
  it("checks rows without a category; lists different-category rows unchecked", () => {
    const r = similarSelection([c("cel1", { categoryId: OTHER }), c("alimenty"), c("cel2", { categoryId: OTHER })], target);
    expect(r.ids).toEqual(["cel1", "alimenty", "cel2"]);
    expect(r.selected).toEqual(["alimenty"]);
    expect(r.conflicting).toEqual(["cel1", "cel2"]);
  });

  it("after applying (candidates already have the target) → empty list", () => {
    const r = similarSelection([c("a", { categoryId: T }), c("b", { categoryId: T, tag: "  " })], target);
    expect(r).toEqual({ ids: [], selected: [], conflicting: [] });
  });

  it("only the tag or only the subcategory differs → still listed (and checked)", () => {
    const t = { categoryId: T, subcategoryId: "sub1", tag: "dom" };
    const r = similarSelection(
      [
        c("same", { categoryId: T, subcategoryId: "sub1", tag: "dom" }),
        c("tag", { categoryId: T, subcategoryId: "sub1", tag: "ogród" }),
        c("sub", { categoryId: T, subcategoryId: "sub2", tag: "dom" }),
        c("noTag", { categoryId: T, subcategoryId: "sub1", tag: null }),
      ],
      t
    );
    expect(r.ids).toEqual(["tag", "sub", "noTag"]);
    expect(r.selected).toEqual(["tag", "sub", "noTag"]);
  });

  it("cash entries are never listed", () => {
    const r = similarSelection([c("cash", { isCash: true }), c("bank")], target);
    expect(r.ids).toEqual(["bank"]);
  });

  it("opaque intermediary rows are never listed", () => {
    const r = similarSelection([c("payu", { opaque: true }), c("shop")], target);
    expect(r.ids).toEqual(["shop"]);
  });

  it("dismissed rows do not come back", () => {
    const r = similarSelection([c("no"), c("yes"), c("conf", { categoryId: OTHER })], target, new Set(["no", "conf"]));
    expect(r.ids).toEqual(["yes"]);
  });
});

describe("dismissed storage helpers", () => {
  it("addDismissed merges per source without duplicates", () => {
    let m = addDismissed({}, "src", ["a", "b"]);
    m = addDismissed(m, "src", ["b", "c"]);
    m = addDismissed(m, "other", []);
    expect(m).toEqual({ src: ["a", "b", "c"] });
  });

  it("parseDismissed tolerates garbage", () => {
    expect(parseDismissed(null)).toEqual({});
    expect(parseDismissed("not json")).toEqual({});
    expect(parseDismissed("[1,2]")).toEqual({});
    expect(parseDismissed('{"s":["a",3],"t":"x"}')).toEqual({ s: ["a"] });
  });

  it("isCashHash", () => {
    expect(isCashHash("cash:123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isCashHash("abc123")).toBe(false);
    expect(isCashHash(null)).toBe(false);
  });
});
