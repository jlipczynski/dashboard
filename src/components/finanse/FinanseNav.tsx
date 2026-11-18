"use client";

import { useEffect, useRef } from "react";
import { FinPill } from "@/components/finanse/ui";

// Links shared by every Finanse screen, so each part is one click away (brief Finanse 13: Dashboard first,
// no "Budżet"; every item is a FinPill of the same height). On a phone the bar is ONE line that scrolls sideways,
// with the active item scrolled into view. Items point at the existing pages and at the tabs of /finanse (?tab=…).

/** Internal tab keys of /finanse (src/app/finanse/page.tsx). */
export type FinanseTab = "import" | "historia" | "kategorie";

export type NavKey = "dashboard" | "przeglad" | "historia" | "kategorie-strona" | "import" | "reguly" | "wiedza";

type Item = { key: NavKey; label: string; href: string; tab?: FinanseTab };

export const FINANSE_NAV: Item[] = [
  { key: "dashboard", label: "Dashboard", href: "/finanse/dashboard" },
  { key: "przeglad", label: "Przegląd", href: "/finanse/przeglad" },
  { key: "historia", label: "Transakcje", href: "/finanse?tab=historia", tab: "historia" },
  { key: "kategorie-strona", label: "Kategorie", href: "/finanse/kategorie" },
  { key: "import", label: "Import", href: "/finanse?tab=import", tab: "import" },
  // The "kategorie" tab of /finanse holds rules and tags — named so it is not confused with /finanse/kategorie.
  { key: "reguly", label: "Reguły i tagi", href: "/finanse?tab=reguly", tab: "kategorie" },
  { key: "wiedza", label: "Wiedza coacha", href: "/finanse/wiedza" },
];

/** ?tab= value → internal tab of /finanse (null = keep the default). "kategorie" kept for old links. */
export function tabFromQuery(value: string | null | undefined): FinanseTab | null {
  switch ((value ?? "").toLowerCase()) {
    case "historia":
    case "transakcje":
      return "historia";
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
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <nav aria-label="Finanse" className="mt-3">
      <ul ref={ref} className="-mx-4 flex flex-nowrap gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {FINANSE_NAV.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key} className="shrink-0">
              {onTab && item.tab ? (
                <FinPill active={isActive} onClick={() => onTab(item.tab!)}>
                  {item.label}
                </FinPill>
              ) : (
                <FinPill active={isActive} href={item.href}>
                  {item.label}
                </FinPill>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
