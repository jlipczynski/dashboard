"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/weekly", label: "Weekly" },
  { href: "/backlog", label: "Backlog" },
  { href: "/finanse", label: "Finanse" },
];

/** Minimal sticky top menu. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <nav
      className="sticky z-20 -mx-4 border-b border-border bg-background/90 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex h-12 items-center justify-between gap-4">
        <Link href="/" className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground">
          Jan
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 transition-colors ${
                  active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
