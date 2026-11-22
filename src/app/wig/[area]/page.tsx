"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { wigGet, wigPost, ratingColor, type ContextT, type SourcesT, type SummaryT, type WeekData } from "@/components/wig/client";
import { ResultRow } from "@/components/wig/LeadEditors";
import { BTN_PRIMARY, BTN_SECONDARY, Card, ErrorBanner, INPUT, LABEL, StatusPill, fmtNum, weekStatusLabel } from "@/components/wig/ui";
import { AREAS, RELATION_SUBS, formatScore, type AreaKey } from "@/lib/wig-score";
import { formatDayMonthPl } from "@/lib/dates";
import { weekEnd } from "@/lib/wig-model";

export default function WigAreaPage() {
  const { area } = useParams<{ area: string }>();
  const meta = AREAS.find((a) => a.key === area);
  if (!meta) notFound();
  return <AreaView areaKey={meta.key} />;
}

function AreaView({ areaKey }: { areaKey: AreaKey }) {
  const meta = AREAS.find((a) => a.key === areaKey)!;
  const [s, setS] = useState<SummaryT | null>(null);
  const [week, setWeek] = useState<WeekData | null>(null);
  const [ctx, setCtx] = useState<ContextT | null>(null);
  const [sources, setSources] = useState<SourcesT>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sum = await wigGet<SummaryT>({ view: "summary" });
      setS(sum);
      const [w, c] = await Promise.all([wigGet<WeekData>({ view: "week", week: sum.currentWeek }), wigGet<ContextT>({ view: "context" })]);
      setWeek(w);
      setCtx(c);
      if (w.row?.planStatus === "zatwierdzony") wigGet<{ sources: SourcesT }>({ view: "sources", week: sum.currentWeek }).then((x) => setSources(x.sources)).catch(() => {});
    } catch (e) {
      setError(`Nie wczytano: ${(e as Error).message}`);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const win = s?.score.areas.find((a) => a.area === areaKey);
  const planHref = s ? `/wig/sesja/${s.planningWeek}?krok=plan&obszar=${areaKey}` : "/wig";
  const st = weekStatusLabel(week?.row ?? null);
  const leads = week?.leads.filter((l) => l.area === areaKey) ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <TopNav />
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">WIG · obszar · {Math.round(meta.weight * 100)}% wyniku</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{meta.icon} {meta.name}</h1>
          </div>
          <div className="text-right">
            <p className="text-4xl font-black tabular-nums" style={{ color: ratingColor(win?.value ?? null) }} data-testid="area-score">{win ? formatScore(win.value) : "…"}</p>
            <p className="text-[11px] text-muted-foreground">ocena · 4 tygodnie{s ? ` · ${s.score.closedWeeks}/4` : ""}</p>
          </div>
        </div>
        <ErrorBanner error={error} onClose={() => setError(null)} />

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={planHref} className={BTN_PRIMARY} data-testid="area-plan-cta">Zaplanuj tydzień</Link>
          {s && <Link href={`/wig/sesja/${s.planningWeek}`} className={BTN_SECONDARY}>Sesja WIG</Link>}
          <Link href={meta.href} className={BTN_SECONDARY}>Szczegóły {meta.short}</Link>
        </div>

        {ctx && <ContextCard area={areaKey} ctx={ctx} leadKeys={[...new Set((s?.score.areas.find((a) => a.area === areaKey)?.leads ?? []).map((l) => l.leadKey).concat(leads.map((l) => l.leadKey)))]} onSaved={load} onError={setError} />}

        <Card className="mt-4" data-testid="area-week">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">Ten tydzień{s ? `: ${formatDayMonthPl(s.currentWeek)} – ${formatDayMonthPl(weekEnd(s.currentWeek))}` : ""}</h2>
            <StatusPill tone={st.tone}>{st.text}</StatusPill>
          </div>
          {areaKey === "relacje" ? (
            <ul className="mt-2 space-y-1 text-sm">
              {RELATION_SUBS.map((sub) => {
                const r = week?.relations.find((x) => x.sub === sub.key);
                return <li key={sub.key} className="break-words"><b>{sub.name}</b>: {r?.intention || <span className="text-muted-foreground">bez zamiaru</span>}{r?.rating ? ` · samoocena ${r.rating}` : ""}</li>;
              })}
              <li className="text-xs text-muted-foreground">Rachunek sumienia i samoocena — w niedzielnej sesji (krok „Refleksja”).</li>
            </ul>
          ) : week?.row?.planStatus === "zatwierdzony" ? (
            <div className="mt-3 space-y-2">
              {leads.map((l) => <ResultRow key={`${l.id}-${l.result?.revision ?? 0}`} lead={l} suggestion={l.source === "task" ? { value: l.tasks.every((t) => t.status === "done") && l.tasks.length ? 1 : 0, evidence: "Weekly Planner", complete: true } : sources[l.source] ?? null} closed={!!week.row?.closeStatus} onSaved={load} onError={setError} />)}
              {leads.length === 0 && <p className="text-sm text-muted-foreground">{week.row.areaSkip[areaKey] ? `Bez celów w tym tygodniu: ${week.row.areaSkip[areaKey]}` : "Brak LEAD-ów w tym obszarze."}</p>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Plan tego tygodnia nie jest zatwierdzony. {leads.length ? `Szkic: ${leads.map((l) => l.name).join(", ")}.` : ""}</p>
          )}
        </Card>

        <Card className="mt-4" data-testid="area-history">
          <h2 className="font-bold">Historia ocen i wniosków</h2>
          <ul className="mt-2 divide-y divide-border">
            {(s?.history ?? []).filter((h) => h.closeStatus).slice().reverse().map((h) => {
              const val = areaKey === "relacje" ? h.relationValue : h.areaResults?.[areaKey]?.rating ?? null;
              const refl = h.reflection?.[areaKey];
              return (
                <li key={h.weekStart} className="py-2 text-sm">
                  <p className="flex items-center gap-2">
                    <Link href={`/wig/sesja/${h.weekStart}?krok=przeglad`} className="font-semibold">{formatDayMonthPl(h.weekStart)} – {formatDayMonthPl(weekEnd(h.weekStart))}</Link>
                    {h.version && h.version > 1 && <StatusPill tone="blue">skorygowana v{h.version}</StatusPill>}
                    <span className="ml-auto font-bold" style={{ color: ratingColor(val) }}>{formatScore(val)}</span>
                  </p>
                  {refl && (refl.worked || refl.didnt || refl.correction) && (
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {refl.worked && <>✓ {refl.worked} </>}{refl.didnt && <>✗ {refl.didnt} </>}{refl.correction && <>→ {refl.correction}</>}
                    </p>
                  )}
                </li>
              );
            })}
            {s && !s.history.some((h) => h.closeStatus) && <li className="py-2 text-sm text-muted-foreground">Brak zamkniętych tygodni.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function ContextCard({ area, ctx, leadKeys, onSaved, onError }: { area: AreaKey; ctx: ContextT; leadKeys: string[]; onSaved: () => void; onError: (m: string) => void }) {
  const [wig, setWig] = useState(ctx.context[area] ?? "");
  const [lag, setLag] = useState<{ name: string; unit: string; target: string; deadline: string; leadKey: string; startValue: string } | null>(null);
  const [monthly, setMonthly] = useState<{ name: string; unit: string; target: string; leadKey: string } | null>(null);
  const lags = ctx.lags.filter((l) => l.area === area);
  const goals = ctx.monthly.filter((m) => m.area === area);
  const post = async (body: Record<string, unknown>, ok?: () => void) => {
    try { await wigPost(body); ok?.(); onSaved(); } catch (e) { onError(`Nie zapisano: ${(e as Error).message}`); }
  };
  return (
    <Card className="mt-4" data-testid="area-context">
      <label className="block">
        <span className={LABEL}>WIG — najważniejszy cel długoterminowy (opcjonalnie)</span>
        <span className="mt-1 flex gap-2">
          <input className={INPUT} value={wig} onChange={(e) => setWig(e.target.value)} placeholder="np. Zdrowy kręgosłup i 4 treningi tygodniowo do czerwca 2027" aria-label="WIG obszaru" />
          {wig !== (ctx.context[area] ?? "") && <button type="button" className={BTN_SECONDARY} onClick={() => post({ action: "save_context", area, wig })}>Zapisz</button>}
        </span>
      </label>

      <div className="mt-4">
        <p className="text-sm font-semibold">LAG — rezultaty (osobno, nie wchodzą do oceny)</p>
        <ul className="mt-1 space-y-1 text-sm">
          {lags.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline gap-2">
              <span className="min-w-0 break-words">{l.name}</span>
              <span className="text-muted-foreground">{fmtNum(l.current)}{l.target ? ` / ${fmtNum(l.target)}` : ""} {l.unit}{l.deadline ? ` · do ${formatDayMonthPl(l.deadline)} ${l.deadline.slice(0, 4)}` : ""}</span>
              {l.target ? <span className="text-xs text-muted-foreground">({Math.round((l.current / l.target) * 1000) / 10}%)</span> : null}
              <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-red-600" onClick={() => post({ action: "delete_lag", id: l.id })}>usuń</button>
            </li>
          ))}
          {lags.length === 0 && <li className="text-muted-foreground">brak</li>}
        </ul>
        {lag ? (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <input className={`${INPUT} col-span-2 sm:col-span-3`} value={lag.name} onChange={(e) => setLag({ ...lag, name: e.target.value })} placeholder="Nazwa" aria-label="Nazwa LAG-a" />
            <input className={INPUT} value={lag.target} onChange={(e) => setLag({ ...lag, target: e.target.value })} placeholder="Cel" inputMode="decimal" aria-label="Cel LAG-a" />
            <input className={INPUT} value={lag.unit} onChange={(e) => setLag({ ...lag, unit: e.target.value })} placeholder="Jednostka" aria-label="Jednostka LAG-a" />
            <input className={INPUT} type="date" value={lag.deadline} onChange={(e) => setLag({ ...lag, deadline: e.target.value })} aria-label="Termin" />
            <select className={INPUT} value={lag.leadKey} onChange={(e) => setLag({ ...lag, leadKey: e.target.value })} aria-label="Postęp z LEAD-a">
              <option value="">postęp wpisywany ręcznie</option>
              {[...new Set([...leadKeys, lag.leadKey].filter(Boolean))].map((k) => <option key={k} value={k}>suma LEAD-a: {k}</option>)}
            </select>
            <input className={INPUT} value={lag.startValue} onChange={(e) => setLag({ ...lag, startValue: e.target.value })} placeholder="Stan początkowy" inputMode="decimal" aria-label="Stan początkowy" />
            <span className="col-span-2 flex gap-2 sm:col-span-3">
              <button type="button" className={BTN_PRIMARY} disabled={!lag.name.trim()} onClick={() => post({ action: "save_lag", area, ...lag }, () => setLag(null))}>Zapisz LAG</button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setLag(null)}>Anuluj</button>
            </span>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="text-sm font-semibold text-emerald-700" onClick={() => setLag({ name: "", unit: "", target: "", deadline: "", leadKey: "", startValue: "0" })}>+ Dodaj LAG</button>
            {area === "rozwoj" && !lags.some((l) => /testament/i.test(l.name)) && (
              <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setLag({ name: "Nowy Testament — przeczytany do 31.12.2027", unit: "rozdziały", target: "260", deadline: "2027-12-31", leadKey: "nowy-testament", startValue: "0" })}>
                + propozycja: Nowy Testament (260 rozdziałów do 31.12.2027)
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold">Cele miesięczne (kierunek i postęp — bez drugiej oceny)</p>
        <ul className="mt-1 space-y-1 text-sm">
          {goals.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline gap-2">
              <span className="min-w-0 break-words">{m.name}</span>
              <span className="text-muted-foreground">{m.current === null ? "—" : fmtNum(m.current)}{m.target ? ` / ${fmtNum(m.target)}` : ""} {m.unit}</span>
              <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-red-600" onClick={() => post({ action: "delete_monthly", id: m.id })}>usuń</button>
            </li>
          ))}
          {goals.length === 0 && <li className="text-muted-foreground">brak</li>}
        </ul>
        {monthly ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input className={`${INPUT} col-span-2`} value={monthly.name} onChange={(e) => setMonthly({ ...monthly, name: e.target.value })} placeholder="np. 12 treningów siłowych" aria-label="Nazwa celu miesięcznego" />
            <input className={INPUT} value={monthly.target} onChange={(e) => setMonthly({ ...monthly, target: e.target.value })} placeholder="Cel" inputMode="decimal" aria-label="Cel miesięczny" />
            <input className={INPUT} value={monthly.unit} onChange={(e) => setMonthly({ ...monthly, unit: e.target.value })} placeholder="Jednostka" aria-label="Jednostka celu" />
            <select className={`${INPUT} col-span-2`} value={monthly.leadKey} onChange={(e) => setMonthly({ ...monthly, leadKey: e.target.value })} aria-label="Postęp z LEAD-a">
              <option value="">bez automatycznego postępu</option>
              {leadKeys.map((k) => <option key={k} value={k}>suma LEAD-a: {k} (zamknięte tygodnie tego miesiąca)</option>)}
            </select>
            <span className="col-span-2 flex gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={!monthly.name.trim()} onClick={() => post({ action: "save_monthly", area, ...monthly }, () => setMonthly(null))}>Zapisz cel</button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setMonthly(null)}>Anuluj</button>
            </span>
          </div>
        ) : (
          <button type="button" className="mt-2 text-sm font-semibold text-emerald-700" onClick={() => setMonthly({ name: "", unit: "", target: "", leadKey: "" })}>+ Dodaj cel miesięczny</button>
        )}
      </div>
    </Card>
  );
}
