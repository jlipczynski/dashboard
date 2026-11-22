"use client";
// Entry from an existing area page into its WIG view (same data source, no copy).
import Link from "next/link";
import type { AreaKey } from "@/lib/wig-score";

export function WigAreaLink({ area }: { area: AreaKey }) {
  return (
    <Link href={`/wig/${area}`} className="ml-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-accent" data-testid="wig-area-link">
      WIG · plan tygodnia →
    </Link>
  );
}
