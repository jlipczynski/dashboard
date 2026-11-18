import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FinanseNav, FINANSE_NAV, tabFromQuery, navKeyForTab } from "../components/finanse/FinanseNav";

afterEach(cleanup);

describe("FinanseNav — one click to every Finanse screen (existing pages only)", () => {
  it("order: Dashboard first; no 'Budżet' (brief 13)", () => {
    expect(FINANSE_NAV.map((i) => i.label)).toEqual(["Dashboard", "Przegląd", "Transakcje", "Kategorie", "Import", "Reguły i tagi", "Wiedza coacha"]);
    render(<FinanseNav active="dashboard" />);
    expect(screen.queryByRole("link", { name: "Budżet" })).toBeNull();
  });

  it("links to the existing screens", () => {
    render(<FinanseNav active="dashboard" />);
    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href("Przegląd")).toBe("/finanse/przeglad");
    expect(href("Transakcje")).toBe("/finanse?tab=historia");
    expect(href("Kategorie")).toBe("/finanse/kategorie");
    expect(href("Import")).toBe("/finanse?tab=import");
    expect(href("Dashboard")).toBe("/finanse/dashboard");
    expect(href("Reguły i tagi")).toBe("/finanse?tab=reguly");
    expect(href("Wiedza coacha")).toBe("/finanse/wiedza");
  });

  it("every target is an existing page (no new screens)", () => {
    const pages = new Set(["/finanse", "/finanse/dashboard", "/finanse/przeglad", "/finanse/kategorie", "/finanse/wiedza"]);
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
    expect(tabFromQuery("budzet")).toBeNull(); // removed tab: /finanse redirects to the dashboard
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
