"use client";

import { useCallback, useEffect, useState } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { wigGet, wigPost, type ContextT } from "@/components/wig/client";
import { BTN_PRIMARY, BTN_SECONDARY, Card, ErrorBanner, INPUT, LABEL, StatusPill } from "@/components/wig/ui";
import { AREAS, type AreaKey } from "@/lib/wig-score";
import { quarterOf } from "@/lib/wig-model";
import { todayWarsaw } from "@/lib/dates";

const STATUS = [
  { key: "planowany", label: "planowany", tone: "muted" },
  { key: "w_toku", label: "w toku", tone: "amber" },
  { key: "zrobiony", label: "zrobiony", tone: "green" },
  { key: "porzucony", label: "porzucony", tone: "muted" },
] as const;
type Rock = ContextT["rocks"][number];
const empty = (): Omit<Rock, "id"> & { id?: string } => ({ quarter: quarterOf(todayWarsaw()), area: "praca", title: "", owner: "Jan", milestone: "", due: "", status: "planowany", wig: "" });

/** ROCKS: quarterly key projects / milestones — separate from weekly LEADs, not part of the 1–6 score. */
export default function RocksPage() {
  const [rocks, setRocks] = useState<Rock[]>([]);
  const [edit, setEdit] = useState<ReturnType<typeof empty> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => wigGet<ContextT>({ view: "context" }).then((c) => setRocks(c.rocks)).catch((e) => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    try { await wigPost({ action: "save_rock", ...edit }); setEdit(null); void load(); } catch (e) { setError(`Nie zapisano ROCK-a: ${(e as Error).message}`); }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Usunąć ten ROCK?")) return;
    try { await wigPost({ action: "delete_rock", id }); void load(); } catch (e) { setError(`Nie usunięto: ${(e as Error).message}`); }
  };
  const quarters = [...new Set(rocks.map((r) => r.quarter))];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <TopNav />
        <h1 className="mt-5 text-2xl font-bold">ROCKS — kluczowe projekty kwartału</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kamienie milowe kwartalne, osobne od tygodniowych LEAD-ów. Zadania w Weekly Plannerze mogą się do nich odwoływać.</p>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {!edit && <button type="button" className={`${BTN_PRIMARY} mt-4`} onClick={() => setEdit(empty())}>+ Nowy ROCK</button>}
        {edit && (
          <Card className="mt-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2"><span className={LABEL}>Nazwa</span><input className={INPUT} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} aria-label="Nazwa ROCK-a" /></label>
              <label><span className={LABEL}>Kwartał</span><input className={INPUT} value={edit.quarter} onChange={(e) => setEdit({ ...edit, quarter: e.target.value })} aria-label="Kwartał" /></label>
              <label><span className={LABEL}>Obszar</span>
                <select className={INPUT} value={edit.area} onChange={(e) => setEdit({ ...edit, area: e.target.value as AreaKey })} aria-label="Obszar">{AREAS.map((a) => <option key={a.key} value={a.key}>{a.short}</option>)}</select>
              </label>
              <label className="col-span-2"><span className={LABEL}>Kamień milowy</span><input className={INPUT} value={edit.milestone} onChange={(e) => setEdit({ ...edit, milestone: e.target.value })} aria-label="Kamień milowy" /></label>
              <label><span className={LABEL}>Termin</span><input className={INPUT} type="date" value={edit.due ?? ""} onChange={(e) => setEdit({ ...edit, due: e.target.value })} aria-label="Termin" /></label>
              <label><span className={LABEL}>Właściciel</span><input className={INPUT} value={edit.owner} onChange={(e) => setEdit({ ...edit, owner: e.target.value })} aria-label="Właściciel" /></label>
              <label><span className={LABEL}>Status</span>
                <select className={INPUT} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} aria-label="Status">{STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
              </label>
              <label><span className={LABEL}>Powiązany WIG</span><input className={INPUT} value={edit.wig} onChange={(e) => setEdit({ ...edit, wig: e.target.value })} aria-label="WIG" /></label>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={!edit.title.trim()} onClick={save}>Zapisz</button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setEdit(null)}>Anuluj</button>
            </div>
          </Card>
        )}
        {quarters.map((q) => (
          <Card key={q} className="mt-4">
            <h2 className="font-bold">{q}</h2>
            <ul className="mt-2 divide-y divide-border">
              {rocks.filter((r) => r.quarter === q).map((r) => {
                const st = STATUS.find((s) => s.key === r.status) ?? STATUS[0];
                return (
                  <li key={r.id} className="py-2 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <span>{AREAS.find((a) => a.key === r.area)?.icon}</span>
                      <span className="min-w-0 break-words font-semibold">{r.title}</span>
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                      <span className="ml-auto flex gap-3 text-xs">
                        <button type="button" className="text-emerald-700" onClick={() => setEdit({ ...r, due: r.due ?? "" })}>edytuj</button>
                        <button type="button" className="text-muted-foreground hover:text-red-600" onClick={() => remove(r.id)}>usuń</button>
                      </span>
                    </p>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">{[r.milestone, r.due ? `termin ${r.due}` : "", r.owner, r.wig ? `WIG: ${r.wig}` : ""].filter(Boolean).join(" · ")}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
