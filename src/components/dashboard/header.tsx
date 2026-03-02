import Link from "next/link";

export function DashboardHeader() {
  return (
    <header className="flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Jan&apos;s Dashboard
        </p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground sm:text-5xl">
          MARZEC 2026
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Twoj osobisty panel zyciowy &mdash; 4DX Framework
        </p>
      </div>
      <Link
        href="/weekly"
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Weekly Planner
      </Link>
    </header>
  );
}
