import { describe, it, expect } from "vitest";
import { similarSelection } from "../lib/finanse-similar";

const T = "cat-target";
const OTHER = "cat-investment";

describe("similarSelection", () => {
  it("checks rows without a category and rows with the same category", () => {
    const r = similarSelection(
      [
        { id: "none", categoryId: null, opaque: false },
        { id: "same", categoryId: T, opaque: false },
      ],
      T
    );
    expect(r.ids).toEqual(["none", "same"]);
    expect(r.selected).toEqual(["none", "same"]);
    expect(r.conflicting).toEqual([]);
  });

  it("lists rows with a different category but leaves them unchecked", () => {
    const r = similarSelection(
      [
        { id: "cel1", categoryId: OTHER, opaque: false },
        { id: "alimenty", categoryId: null, opaque: false },
        { id: "cel2", categoryId: OTHER, opaque: false },
      ],
      T
    );
    expect(r.ids).toEqual(["cel1", "alimenty", "cel2"]);
    expect(r.selected).toEqual(["alimenty"]);
    expect(r.conflicting).toEqual(["cel1", "cel2"]);
  });

  it("never lists opaque intermediary rows, whatever their category", () => {
    const r = similarSelection(
      [
        { id: "payu-none", categoryId: null, opaque: true },
        { id: "payu-same", categoryId: T, opaque: true },
        { id: "shop", categoryId: null, opaque: false },
      ],
      T
    );
    expect(r.ids).toEqual(["shop"]);
    expect(r.selected).toEqual(["shop"]);
  });

  it("empty input → empty panel", () => {
    expect(similarSelection([], T)).toEqual({ ids: [], selected: [], conflicting: [] });
  });
});
