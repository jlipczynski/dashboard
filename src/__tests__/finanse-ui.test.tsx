import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  FinPageHeader,
  FinPill,
  FinButton,
  FinStatTile,
  FinCategoryTile,
  FinBadge,
  FinCard,
  pillClass,
  buttonClass,
} from "../components/finanse/ui";

afterEach(cleanup);
const classes = (el: Element) => new Set(el.className.split(/\s+/));

describe("Finanse UI components (brief 13)", () => {
  it("FinPill: active and inactive have the SAME height class (h-9) — the state never changes the size", () => {
    render(
      <>
        <FinPill active href="/a">
          Aktywny
        </FinPill>
        <FinPill href="/b">Nieaktywny</FinPill>
      </>
    );
    const on = classes(screen.getByRole("link", { name: "Aktywny" }));
    const off = classes(screen.getByRole("link", { name: "Nieaktywny" }));
    for (const c of ["h-9", "px-4", "text-sm", "rounded-full", "border", "whitespace-nowrap", "inline-flex"]) {
      expect(on.has(c)).toBe(true);
      expect(off.has(c)).toBe(true);
    }
    expect(on.has("bg-emerald-700")).toBe(true);
    expect(off.has("bg-emerald-700")).toBe(false);
    expect(screen.getByRole("link", { name: "Aktywny" }).getAttribute("aria-current")).toBe("page");
    expect(pillClass(true).match(/\bh-\d+/g)).toEqual(pillClass(false).match(/\bh-\d+/g));
  });

  it("FinButton: variants keep one shape; sizes sm / md / lg are fixed heights; disabled is dimmed", () => {
    render(
      <>
        <FinButton>Główny</FinButton>
        <FinButton variant="secondary" size="sm" disabled>
          Mały
        </FinButton>
      </>
    );
    const main = classes(screen.getByRole("button", { name: "Główny" }));
    expect(main.has("h-10")).toBe(true);
    expect(main.has("bg-emerald-700")).toBe(true);
    const small = screen.getByRole("button", { name: "Mały" });
    expect(classes(small).has("h-8")).toBe(true);
    expect((small as HTMLButtonElement).disabled).toBe(true);
    expect(buttonClass("danger", "lg", true)).toContain("h-12");
    expect(buttonClass("danger", "lg", true)).toContain("w-full");
    for (const v of ["primary", "secondary", "ghost", "danger"] as const) {
      expect(buttonClass(v)).toContain("rounded-xl");
      expect(buttonClass(v)).toContain("inline-flex");
    }
  });

  it("FinStatTile: fixed minimum height, one-line label and value, note clamped to 2 lines; optional link", () => {
    render(<FinStatTile label="Liczba wolności" value="1 489 773 zł" note="koszty bez jednorazowych × 12 ÷ 4%" href="/finanse/wolnosc" cta="Otwórz symulator →" />);
    const tile = screen.getByRole("link");
    expect(classes(tile).has("min-h-[112px]")).toBe(true);
    expect(classes(tile).has("h-full")).toBe(true);
    expect(classes(screen.getByText("Liczba wolności")).has("truncate")).toBe(true);
    expect(classes(screen.getByText("koszty bez jednorazowych × 12 ÷ 4%")).has("line-clamp-2")).toBe(true);
  });

  it("FinCategoryTile: fixed height, full name in title, name up to 2 lines, bar at the bottom", () => {
    render(<FinCategoryTile name="Podatki i opłaty" icon={<span />} share="3,1%" amount="700 zł" barPct={20} color="#123456" active={false} onClick={() => {}} />);
    const btn = screen.getByRole("button");
    expect(classes(btn).has("h-[124px]")).toBe(true);
    expect(btn.getAttribute("title")).toBe("Podatki i opłaty");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(classes(screen.getByText("Podatki i opłaty")).has("line-clamp-2")).toBe(true);
  });

  it("FinBadge stays on one line; FinCard and FinPageHeader render their parts", () => {
    render(
      <>
        <FinBadge>limit zatwierdzony</FinBadge>
        <FinCard title="Sekcja">treść</FinCard>
        <FinPageHeader eyebrow="Finanse · Transakcje" title="Transakcje" subtitle="opis" />
      </>
    );
    const badge = classes(screen.getByText("limit zatwierdzony"));
    expect(badge.has("whitespace-nowrap")).toBe(true);
    expect(badge.has("h-5")).toBe(true);
    expect(screen.getByRole("heading", { level: 2, name: "Sekcja" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Transakcje" })).toBeTruthy();
    expect(screen.getByText("Finanse · Transakcje")).toBeTruthy();
  });
});
