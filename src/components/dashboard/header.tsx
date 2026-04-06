import Link from "next/link";

const MONTHS_PL = [
  "STYCZEŃ", "LUTY", "MARZEC", "KWIECIEŃ", "MAJ", "CZERWIEC",
  "LIPIEC", "SIERPIEŃ", "WRZESIEŃ", "PAŹDZIERNIK", "LISTOPAD", "GRUDZIEŃ",
];

export function DashboardHeader() {
  const now = new Date();
  const monthLabel = `${MONTHS_PL[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Jan&apos;s Dashboard
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-foreground sm:text-5xl">
          {monthLabel}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Twoj osobisty panel zyciowy &mdash; 4DX Framework
        </p>
      </div>
      <Link
        href="/weekly"
        className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Weekly Planner
      </Link>
    </header>
  );
}
