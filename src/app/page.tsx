import { pillars } from "@/lib/data";
import { DashboardHeader } from "@/components/dashboard/header";
import { PillarCard } from "@/components/dashboard/pillar-card";

export default function Home() {
  const overallScore = Math.round(
    pillars.reduce((sum, p) => sum + p.score, 0) / pillars.length
  );

  const onTrack = pillars.filter((p) => p.score >= 65).length;
  const atRisk = pillars.filter((p) => p.score >= 40 && p.score < 65).length;
  const offTrack = pillars.filter((p) => p.score < 40).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHeader />

        {/* Summary bar */}
        <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
              {overallScore}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Ogólny wynik</p>
              <p className="text-xs text-muted-foreground">średnia z {pillars.length} filarów</p>
            </div>
          </div>
          <div className="ml-auto flex gap-3">
            {onTrack > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                ✓ {onTrack} Na dobrej drodze
              </span>
            )}
            {atRisk > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                ⚠ {atRisk} Wymaga uwagi
              </span>
            )}
            {offTrack > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                ✗ {offTrack} Poniżej celu
              </span>
            )}
          </div>
        </div>

        {/* Pillar cards */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <PillarCard key={pillar.id} pillar={pillar} />
          ))}
        </div>

        {/* Footer quote */}
        <p className="mt-10 text-center text-sm text-muted-foreground italic">
          &ldquo;Dyscyplina to robienie tego, co trzeba, kiedy trzeba, nawet gdy nie chce się tego robić.&rdquo;
        </p>
      </div>
    </div>
  );
}
