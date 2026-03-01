import Link from "next/link";

export function DashboardHeader() {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Jan&apos;s Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Twój osobisty panel życiowy — 4DX Framework
        </p>
      </div>
      <Link
        href="/plan"
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        🐸 Plan Tygodnia
      </Link>
    </header>
  );
}
