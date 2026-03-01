import { BackButton } from "@/components/dashboard/back-button";

export default function RozwojPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <BackButton />

        <div className="mt-4 flex items-center gap-3">
          <span className="text-3xl">📚</span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Rozwój Osobisty</h1>
            <p className="text-muted-foreground">Cele i postępy — wkrótce</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <span className="text-5xl">📚</span>
          <h3 className="mt-4 text-lg font-semibold text-foreground">W przygotowaniu</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Nagraj voice note z celami rozwoju osobistego, a ja dobuduję ten panel.
          </p>
        </div>
      </div>
    </div>
  );
}
