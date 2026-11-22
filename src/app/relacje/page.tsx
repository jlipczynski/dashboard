import { BackButton } from "@/components/dashboard/back-button";
import { WigAreaLink } from "@/components/wig/WigAreaLink";

export default function RelacjePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <BackButton />
        <WigAreaLink area="relacje" />

        <div className="mt-4 flex items-center gap-3">
          <span className="text-3xl">💛</span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Partnerstwo i Relacje</h1>
            <p className="text-muted-foreground">Cotygodniowy rachunek sumienia: Monika, Dzieci, Przyjaciele, Pozostali</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <span className="text-5xl">💛</span>
          <h3 className="mt-4 text-lg font-semibold text-foreground">Relacje w sesji WIG</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Zamiary na tydzień planujesz w sesji WIG, a w niedzielę robisz rachunek sumienia i samoocenę 1–6.
          </p>
        </div>
      </div>
    </div>
  );
}
