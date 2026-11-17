import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FinanseNav, FINANSE_NAV, tabFromQuery, navKeyForTab } from "../components/finanse/FinanseNav";

afterEach(cleanup);

describe("FinanseNav — one click to every Finanse screen (existing pages only)", () => {
  it("links: Przegląd, Transakcje, Kategorie, Import (+ Dashboard, Budżet, Reguły i tagi)", () => {
    render(<FinanseNav active="dashboard" />);
    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href("Przegląd")).toBe("/finanse/przeglad");
    expect(href("Transakcje")).toBe("/finanse?tab=historia");
    expect(href("Kategorie")).toBe("/finanse/kategorie");
    expect(href("Import")).toBe("/finanse?tab=import");
    expect(href("Dashboard")).toBe("/finanse/dashboard");
    expect(href("Budżet")).toBe("/finanse?tab=budzet");
    expect(href("Reguły i tagi")).toBe("/finanse?tab=reguly");
  });

  it("every target is an existing page (no new screens)", () => {
    const pages = new Set(["/finanse", "/finanse/dashboard", "/finanse/przeglad", "/finanse/kategorie"]);
    for (const item of FINANSE_NAV) expect(pages.has(item.href.split("?")[0])).toBe(true);
  });

  it("marks the current screen with aria-current", () => {
    render(<FinanseNav active="przeglad" />);
    expect(screen.getByRole("link", { name: "Przegląd" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Kategorie" }).getAttribute("aria-current")).toBeNull();
  });

  it("on /finanse the tab items switch the tab in place; other items stay links", () => {
    const onTab = vi.fn();
    render(<FinanseNav active="import" onTab={onTab} />);
    fireEvent.click(screen.getByRole("button", { name: "Transakcje" }));
    fireEvent.click(screen.getByRole("button", { name: "Reguły i tagi" }));
    expect(onTab).toHaveBeenNthCalledWith(1, "historia");
    expect(onTab).toHaveBeenNthCalledWith(2, "kategorie");
    expect(screen.getByRole("link", { name: "Przegląd" }).getAttribute("href")).toBe("/finanse/przeglad");
    expect(screen.getByRole("button", { name: "Import" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("tab helpers", () => {
  it("tabFromQuery maps URL values (incl. old 'kategorie') and ignores the rest", () => {
    expect(tabFromQuery("historia")).toBe("historia");
    expect(tabFromQuery("Transakcje")).toBe("historia");
    expect(tabFromQuery("budzet")).toBe("budzet");
    expect(tabFromQuery("import")).toBe("import");
    expect(tabFromQuery("reguly")).toBe("kategorie");
    expect(tabFromQuery("kategorie")).toBe("kategorie");
    expect(tabFromQuery("xyz")).toBeNull();
    expect(tabFromQuery(null)).toBeNull();
  });
  it("navKeyForTab highlights 'Reguły i tagi' for the old Kategorie tab", () => {
    expect(navKeyForTab("kategorie")).toBe("reguly");
    expect(navKeyForTab("historia")).toBe("historia");
  });
});
