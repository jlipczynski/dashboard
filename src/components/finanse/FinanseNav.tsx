"use client";

import Link from "next/link";

// Links shared by every Finanse screen, so each part is one click away. On a phone the chips wrap
// into a second row (nothing hidden behind sideways scrolling). No new screens: items point at the existing pages and at the existing
// tabs of /finanse (selected with ?tab=…).

/** Internal tab keys of /finanse (src/app/finanse/page.tsx). */
export type FinanseTab = "import" | "historia" | "budzet" | "kategorie";

export type NavKey = "dashboard" | "przeglad" | "historia" | "budzet" | "kategorie-strona" | "import" | "reguly" | "wiedza";

type Item = { key: NavKey; label: string; href: string; tab?: FinanseTab };

export const FINANSE_NAV: Item[] = [
  { key: "przeglad", label: "Przegląd", href: "/finanse/przeglad" },
  { key: "historia", label: "Transakcje", href: "/finanse?tab=historia", tab: "historia" },
  { key: "kategorie-strona", label: "Kategorie", href: "/finanse/kategorie" },
  { key: "import", label: "Import", href: "/finanse?tab=import", tab: "import" },
  { key: "dashboard", label: "Dashboard", href: "/finanse/dashboard" },
  { key: "budzet", label: "Budżet", href: "/finanse?tab=budzet", tab: "budzet" },
  // The old "Kategorie" tab of /finanse holds rules and tags — renamed so it is not confused with /finanse/kategorie.
  { key: "reguly", label: "Reguły i tagi", href: "/finanse?tab=reguly", tab: "kategorie" },
  { key: "wiedza", label: "Wiedza coacha", href: "/finanse/wiedza" },
];

/** ?tab= value → internal tab of /finanse (null = keep the default). "kategorie" kept for old links. */
export function tabFromQuery(value: string | null | undefined): FinanseTab | null {
  switch ((value ?? "").toLowerCase()) {
    case "historia":
    case "transakcje":
      return "historia";
    case "budzet":
      return "budzet";
    case "import":
      return "import";
    case "reguly":
    case "kategorie":
      return "kategorie";
    default:
      return null;
  }
}

/** Nav key highlighted for an internal tab of /finanse. */
export function navKeyForTab(tab: FinanseTab): NavKey {
  return tab === "kategorie" ? "reguly" : tab;
}

/**
 * @param active  highlighted item
 * @param onTab   on /finanse itself: switch the tab in place (no page reload) instead of navigating
 */
export function FinanseNav({ active, onTab }: { active: NavKey; onTab?: (tab: FinanseTab) => void }) {
  const base = "whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors";
  const on = "bg-emerald-700 font-semibold text-white";
  const off = "border border-border bg-card text-muted-foreground hover:text-foreground";
  return (
    <nav aria-label="Finanse" className="mt-3">
      <ul className="flex flex-wrap gap-1.5">
        {FINANSE_NAV.map((item) => {
          const isActive = item.key === active;
          const cls = `${base} ${isActive ? on : off}`;
          return (
            <li key={item.key}>
              {onTab && item.tab ? (
                <button type="button" onClick={() => onTab(item.tab!)} aria-current={isActive ? "page" : undefined} className={cls}>
                  {item.label}
                </button>
              ) : (
                <Link href={item.href} aria-current={isActive ? "page" : undefined} className={cls}>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
