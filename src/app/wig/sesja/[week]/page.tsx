"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { TopNav } from "@/components/dashboard/top-nav";
import { addDaysIso, formatDayMonthPl } from "@/lib/dates";
import { AREAS, RELATION_SUBS, formatScore, weekAreaResult, weekRelationResult, type AreaKey } from "@/lib/wig-score";
import { isMonday, leadKeyFrom, weekEnd, weightProblems } from "@/lib/wig-model";
import { garminCount, wigGet, wigPost, ratingColor, type LeadT, type SourcesT, type WeekData } from "@/components/wig/client";
import { LeadPlanRow, PROPOSALS, RelationReview, ResultRow, type Proposal } from "@/components/wig/LeadEditors";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, CHIP, Card, ErrorBanner, INPUT, LABEL, StatusPill, TEXTAREA, weekStatusLabel } from "@/components/wig/ui";

const STEPS = ["Przegląd", "Refleksja", "Plan", "Potwierdzenie"] as const;
const STEP_KEYS = ["przeglad", "refleksja", "plan", "potwierdzenie"];
const range = (w: string) => `${formatDayMonthPl(w)} – ${formatDayMonthPl(weekEnd(w))}`;
const NUMERIC = AREAS.filter((a) => a.key !== "relacje");

function toInstances(leads: LeadT[]) {
  return leads.map((l) => ({ leadKey: l.leadKey, name: l.name, unit: l.unit, direction: l.direction, target: l.target, targetMax: l.targetMax, weight: l.weight, actual: l.result?.actual ?? null, status: l.result?.status ?? null }));
}

export default function WigSessionPage() {
  return (
    <Suspense fallback={null}>
      <WigSession />
    </Suspense>
  );
}

function WigSession() {
  const params = useParams<{ week: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const week = params.week;
  const reviewWeek = isMonday(week) ? addDaysIso(week, -7) : "";
  const initialStep = Math.max(0, STEP_KEYS.indexOf(sp.get("krok") ?? ""));
  const [step, setStep] = useState(initialStep);
  const [area, setArea] = useState<AreaKey>(((sp.get("obszar") as AreaKey) || "zdrowie"));
  const [plan, setPlan] = useState<WeekData | null>(null);
  const [review, setReview] = useState<WeekData | null>(null);
  const [sources, setSources] = useState<SourcesT>({});
  const [garmin, setGarmin] = useState<{ type: string; date: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([wigGet<WeekData>({ view: "week", week }), wigGet<WeekData>({ view: "week", week: reviewWeek })]);
      setPlan(p);
      setReview(r);
      if (r.row?.planStatus === "zatwierdzony") {
        wigGet<{ sources: SourcesT }>({ view: "sources", week: reviewWeek }).then((s) => setSources(s.sources)).catch(() => {});
        if (r.leads.some((l) => l.source.startsWith("garmin_"))) {
          fetch("/api/garmin").then((x) => x.json()).then((d) => setGarmin(d.activities ?? [])).catch(() => setGarmin([]));
        }
      }
    } catch (e) {
      setError(`Nie wczytano sesji: ${(e as Error).message}`);
    }
    setLoading(false);
  }, [week, reviewWeek]);
  useEffect(() => { if (isMonday(week)) void load(); }, [load, week]);

  const go = (i: number) => {
    setStep(i);
    const q = new URLSearchParams(sp.toString());
    q.set("krok", STEP_KEYS[i]);
    router.replace(`/wig/sesja/${week}?${q}`, { scroll: false });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  if (!isMonday(week)) {
    return <div className="mx-auto max-w-3xl px-4"><TopNav /><p className="mt-8">Nieprawidłowy tydzień w adresie (musi to być poniedziałek, np. 2026-11-23).</p></div>;
  }

  const planStatus = weekStatusLabel(plan?.row ?? null);
  const reviewStatus = weekStatusLabel(review?.row ?? null);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <TopNav />
        <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sesja WIG</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">Plan na {range(week)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Rozliczenie: {range(reviewWeek)} <StatusPill tone={reviewStatus.tone}>{reviewStatus.text}</StatusPill>
              · Plan: <StatusPill tone={planStatus.tone}>{planStatus.text}</StatusPill>
            </p>
          </div>
          <div className="flex gap-1">
            <Link className={BTN_GHOST} href={`/wig/sesja/${addDaysIso(week, -7)}?krok=${STEP_KEYS[step]}`} aria-label="Poprzedni tydzień">←</Link>
            <Link className={BTN_GHOST} href={`/wig/sesja/${addDaysIso(week, 7)}?krok=${STEP_KEYS[step]}`} aria-label="Następny tydzień">→</Link>
          </div>
        </div>

        <ol className="mt-4 grid grid-cols-4 gap-1 text-center text-[11px] sm:text-xs" aria-label="Kroki sesji">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => go(i)} aria-current={i === step ? "step" : undefined}
                className={`w-full truncate rounded-full px-1 py-2 font-semibold ${i === step ? "bg-emerald-700 text-white" : "bg-muted text-muted-foreground"}`}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>

        <ErrorBanner error={error} onClose={() => setError(null)} />
        {loading && <p className="mt-6 text-sm text-muted-foreground">Wczytuję…</p>}

        {!loading && review && plan && (
          <div className="mt-4 space-y-4">
            {step === 0 && <ReviewStep data={review} sources={sources} garmin={garmin} onSaved={load} onError={setError} />}
            {step === 1 && <ReflectionStep data={review} onSaved={load} onError={setError} />}
            {step === 2 && <PlanStep data={plan} prev={review} area={area} setArea={setArea} onSaved={load} onError={setError} />}
            {step === 3 && <ConfirmStep data={plan} onSaved={load} onError={setError} />}
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              {step > 0 ? <button type="button" className={BTN_SECONDARY} onClick={() => go(step - 1)}>← {STEPS[step - 1]}</button> : <span />}
              {step < 3 && <button type="button" className={BTN_PRIMARY} onClick={() => go(step + 1)}>{STEPS[step + 1]} →</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NoPlan({ data }: { data: WeekData }) {
  return (
    <Card>
      <p className="font-semibold text-foreground">Tydzień {range(data.week)} nie ma zatwierdzonego planu.</p>
      <p className="mt-1 text-sm text-muted-foreground">Nie ma czego rozliczać — nie tworzymy ocen ani celów wstecz. Przejdź do kroku „Plan”.</p>
    </Card>
  );
}

function ReviewStep({ data, sources, garmin, onSaved, onError }: { data: WeekData; sources: SourcesT; garmin: { type: string; date: string }[] | null; onSaved: () => void; onError: (m: string) => void }) {
  if (data.row?.planStatus !== "zatwierdzony") return <NoPlan data={data} />;
  const closed = !!data.row.closeStatus;
  const suggestion = (l: LeadT) => {
    if (l.source === "task") {
      const done = l.tasks.length ? l.tasks.every((t) => t.status === "done") : null;
      return { value: done === null ? null : done ? 1 : 0, evidence: done === null ? "zadanie usunięte z Weekly Plannera" : `Weekly Planner: ${done ? "zrobione" : "niezrobione"}`, complete: done !== null };
    }
    if (l.source.startsWith("garmin_")) {
      if (garmin === null) return { value: null, evidence: "Garmin: wczytuję…", complete: false };
      return { value: garminCount(garmin, l.source, l.weekStart, weekEnd(l.weekStart)), evidence: "Garmin (ostatnie 20 aktywności, na żywo — sprawdź)", complete: false };
    }
    return sources[l.source] ?? null;
  };
  return (
    <>
      <Card>
        <p className="text-sm text-muted-foreground">
          Dla każdego LEAD-a wpisz wykonanie, potwierdź 0 albo oznacz brak jako usprawiedliwiony. Wartości ze źródeł to tylko podpowiedź — zapisujesz Ty.
          {closed && " Tydzień jest zamknięty: każda zmiana to korekta z uzasadnieniem (nowa wersja, poprzednia zostaje w historii)."}
        </p>
      </Card>
      {NUMERIC.map((a) => {
        const leads = data.leads.filter((l) => l.area === a.key);
        const res = weekAreaResult(toInstances(leads));
        return (
          <Card key={a.key} data-testid={`review-${a.key}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{a.icon} {a.name}</h2>
              <span className="ml-auto text-sm font-semibold" style={{ color: ratingColor(res.rating) }}>
                {data.row?.areaSkip[a.key] ? `bez celów: ${data.row.areaSkip[a.key]}` : res.rating === null ? (res.unresolved ? `brak danych (${res.unresolved})` : "—") : `ocena ${res.rating}`}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {leads.map((l) => <ResultRow key={`${l.id}-${l.result?.revision ?? 0}`} lead={l} suggestion={suggestion(l)} closed={closed} onSaved={onSaved} onError={onError} />)}
              {leads.length === 0 && !data.row?.areaSkip[a.key] && <p className="text-sm text-muted-foreground">Brak LEAD-ów.</p>}
            </div>
          </Card>
        );
      })}
    </>
  );
}

function ReflectionStep({ data, onSaved, onError }: { data: WeekData; onSaved: () => void; onError: (m: string) => void }) {
  const approved = data.row?.planStatus === "zatwierdzony";
  const closed = !!data.row?.closeStatus;
  const [busy, setBusy] = useState(false);
  const instances = (k: string) => toInstances(data.leads.filter((l) => l.area === k));
  const rel = weekRelationResult(data.relations.map((r) => ({ sub: r.sub, rating: r.rating, excused: r.excused })));

  const close = async () => {
    setBusy(true);
    try {
      await wigPost({ action: "close_week", week: data.week });
      onSaved();
    } catch (e) {
      onError(`Nie zamknięto tygodnia: ${(e as Error).message}`);
    }
    setBusy(false);
  };

  if (!approved) return <NoPlan data={data} />;
  return (
    <>
      {NUMERIC.map((a) => <AreaReflection key={a.key} week={data.week} area={a.key} label={`${a.icon} ${a.name}`} initial={data.row?.reflection[a.key]} closed={closed} onSaved={onSaved} onError={onError} rating={weekAreaResult(instances(a.key)).rating} />)}
      <Card data-testid="reflection-relacje">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">💛 Partnerstwo i relacje — rachunek sumienia</h2>
          <span className="ml-auto text-sm font-semibold" style={{ color: ratingColor(rel.value) }}>{rel.value === null ? "brak samooceny" : `średnio ${formatScore(rel.value)}`}</span>
        </div>
        <div className="mt-3 space-y-2">
          {RELATION_SUBS.map((s) => <RelationReview key={`${s.key}-${data.relations.find((r) => r.sub === s.key)?.revision ?? 0}`} week={data.week} sub={s} current={data.relations.find((r) => r.sub === s.key)} closed={closed} canRate={approved} onSaved={onSaved} onError={onError} />)}
        </div>
      </Card>
      <Card data-testid="close-panel">
        <h2 className="text-lg font-bold">Zamknięcie tygodnia {range(data.week)}</h2>
        {closed ? (
          <div className="mt-2 text-sm">
            <p>Tydzień jest <b>{data.row?.closeStatus === "skorygowana" ? "zamknięty i skorygowany" : "zamknięty"}</b>. Wersje:</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {data.closes.map((c) => <li key={c.version}>v{c.version} · {c.closedAt.slice(0, 16).replace("T", " ")} · wynik tygodnia {formatScore(c.snapshot.weekMain)}{c.reason ? ` · korekta: ${c.reason}` : ""}</li>)}
            </ul>
          </div>
        ) : data.blockers.length ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-amber-800">{data.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Wszystko rozstrzygnięte. Zamknięcie zapisze niezmienną migawkę: plan, wykonanie, wagi, źródła i oceny.</p>
        )}
        {!closed && <button type="button" className={`${BTN_PRIMARY} mt-3`} disabled={busy || data.blockers.length > 0} onClick={close}>Zamknij tydzień</button>}
      </Card>
    </>
  );
}

function AreaReflection({ week, area, label, initial, closed, onSaved, onError, rating }: { week: string; area: AreaKey; label: string; initial?: { worked?: string; didnt?: string; correction?: string }; closed: boolean; onSaved: () => void; onError: (m: string) => void; rating: number | null }) {
  const [f, setF] = useState({ worked: initial?.worked ?? "", didnt: initial?.didnt ?? "", correction: initial?.correction ?? "" });
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);
  const save = async () => {
    if (closed && !reason.trim()) { onError("Tydzień jest zamknięty — wpisz powód korekty refleksji."); return; }
    try {
      await wigPost({ action: "save_reflection", week, area, ...f, reason: reason.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } catch (e) {
      onError(`Nie zapisano refleksji: ${(e as Error).message}`);
    }
  };
  const t = (k: keyof typeof f, l: string) => (
    <label className="block min-w-0">
      <span className={LABEL}>{l}</span>
      <textarea className={TEXTAREA} rows={2} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} onBlur={() => { if (!closed) void save(); }} aria-label={`${label}: ${l}`} />
    </label>
  );
  return (
    <Card data-testid={`reflection-${area}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{label}</h2>
        <span className="ml-auto text-sm font-semibold" style={{ color: ratingColor(rating) }}>{rating === null ? "—" : `ocena ${rating}`}</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {t("worked", "Co działało")}
        {t("didnt", "Co nie działało")}
        {t("correction", "Jedna korekta na następny tydzień")}
      </div>
      {closed && <input className={`${INPUT} mt-2`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Powód korekty (wymagany)" />}
      <div className="mt-2 flex items-center gap-2">
        {closed && <button type="button" className={BTN_SECONDARY} onClick={save}>Zapisz korektę</button>}
        {saved && <span className="text-xs text-emerald-700">✓ zapisano</span>}
      </div>
    </Card>
  );
}

function PlanStep({ data, prev, area, setArea, onSaved, onError }: { data: WeekData; prev: WeekData; area: AreaKey; setArea: (a: AreaKey) => void; onSaved: () => void; onError: (m: string) => void }) {
  const approved = data.row?.planStatus === "zatwierdzony";
  const closed = !!data.row?.closeStatus;
  const ended = data.today > weekEnd(data.week);
  const locked = closed || ended;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const leads = data.leads.filter((l) => l.area === area);
  const sum = leads.reduce((s, l) => s + l.weight, 0);
  const skip = data.row?.areaSkip[area];
  const prevCorrection = prev.row?.reflection[area]?.correction;

  const add = async (p: Proposal | { name: string; unit: string; direction: "at_least"; target: number; source: "task" | "manual"; task?: { project: string; priority: string }; taskId?: string }) => {
    if (approved && !reason.trim()) { onError("Plan jest zatwierdzony — wpisz powód zmiany planu."); return; }
    setBusy(true);
    const used = new Set(data.leads.map((l) => l.leadKey));
    let key = leadKeyFrom(p.name), i = 2;
    while (used.has(key)) key = `${leadKeyFrom(p.name)}-${i++}`;
    try {
      await wigPost({ action: "save_lead", week: data.week, area, leadKey: key, ...p, weight: Math.max(1, Math.min(100, 100 - sum || 10)), position: leads.length, reason: reason.trim() });
      onSaved();
    } catch (e) {
      onError(`Nie dodano „${p.name}”: ${(e as Error).message}`);
    }
    setBusy(false);
  };

  const toggleSkip = async () => {
    const r = skip ? "" : window.prompt("Dlaczego bez celów w tym obszarze w tym tygodniu? (np. urlop, choroba)") ?? "";
    if (!skip && !r.trim()) return;
    try {
      await wigPost({ action: "skip_area", week: data.week, area, reason: r.trim() || (approved ? reason.trim() : "") });
      onSaved();
    } catch (e) {
      onError(`Nie zapisano: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Obszary">
        {AREAS.map((a) => {
          const n = a.key === "relacje" ? data.relations.filter((r) => r.intention).length : data.leads.filter((l) => l.area === a.key).length;
          return (
            <button key={a.key} type="button" role="tab" aria-selected={a.key === area} onClick={() => setArea(a.key)}
              className={`h-9 shrink-0 rounded-full border px-3 text-sm ${a.key === area ? "border-emerald-700 bg-emerald-700 font-semibold text-white" : "border-border bg-card text-muted-foreground"}`}>
              {a.icon} {a.short} <span className="opacity-80">({n})</span>
            </button>
          );
        })}
      </div>

      {locked && <Card><p className="text-sm text-muted-foreground">{closed ? "Tydzień zamknięty — plan zamrożony." : "Ten tydzień już się skończył — nie tworzymy celów wstecz."}</p></Card>}
      {approved && !locked && (
        <Card>
          <label className="block">
            <span className={LABEL}>Plan jest zatwierdzony. Zmiana = rewizja planu z uzasadnieniem (zapisywana w historii):</span>
            <input className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Powód zmiany planu" aria-label="Powód zmiany planu" />
          </label>
        </Card>
      )}
      {prevCorrection && <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">Korekta z poprzedniego tygodnia: <span className="text-foreground">{prevCorrection}</span></p>}

      {area === "relacje" ? (
        <RelacjePlan data={data} locked={locked} onSaved={onSaved} onError={onError} />
      ) : (
        <Card data-testid={`plan-${area}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{AREAS.find((a) => a.key === area)?.name}</h2>
            <span className={`ml-auto text-sm font-semibold ${Math.abs(sum - 100) < 0.01 ? "text-emerald-700" : "text-amber-700"}`} data-testid="weight-sum">
              {skip ? `bez celów: ${skip}` : `wagi: ${Math.round(sum * 100) / 100}% / 100%`}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Ty decydujesz o LEAD-ach, wartościach i wagach — mogą być inne w każdym tygodniu. {area === "praca" && "Liczy się wykonanie zobowiązań, nie samo planowanie."}</p>
          <div className="mt-3 space-y-2">
            {leads.map((l) => <LeadPlanRow key={`${l.id}-${l.weight}-${l.target}-${l.name}`} lead={l} approved={approved} reason={reason.trim()} onSaved={onSaved} onError={onError} disabled={locked} />)}
          </div>
          {!locked && !skip && (area === "praca" ? <PracaAdd data={data} busy={busy} add={add} /> : (
            <div className="mt-3">
              <p className={LABEL}>Propozycje (kliknij, potem dopasuj wartość i wagę):</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {PROPOSALS[area as "zdrowie" | "rozwoj"].filter((p) => !leads.some((l) => l.name === p.name)).map((p) => (
                  <button key={p.name} type="button" className={CHIP} disabled={busy} onClick={() => add(p)}>+ {p.name}</button>
                ))}
                <CustomLead busy={busy} onAdd={(name) => add({ name, unit: "", direction: "at_least", target: 1, source: "manual" })} />
              </div>
            </div>
          ))}
          {!locked && (
            <button type="button" className={`${BTN_GHOST} mt-2 px-0 text-xs`} onClick={toggleSkip}>
              {skip ? "Cofnij „bez celów w tym tygodniu”" : "Bez celów w tym obszarze w tym tygodniu…"}
            </button>
          )}
        </Card>
      )}
    </>
  );
}

function CustomLead({ busy, onAdd }: { busy: boolean; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) return <button type="button" className={CHIP} onClick={() => setOpen(true)}>+ Własny LEAD</button>;
  return (
    <span className="flex w-full flex-wrap gap-2">
      <input className={`${INPUT} flex-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa działania" aria-label="Nazwa własnego LEAD-a" autoFocus />
      <button type="button" className={BTN_SECONDARY} disabled={busy || !name.trim()} onClick={() => { onAdd(name.trim()); setName(""); setOpen(false); }}>Dodaj</button>
    </span>
  );
}

function PracaAdd({ data, busy, add }: { data: WeekData; busy: boolean; add: (p: { name: string; unit: string; direction: "at_least"; target: number; source: "task"; task?: { project: string; priority: string }; taskId?: string }) => void }) {
  const [name, setName] = useState("");
  const [project, setProject] = useState("Ovoc Malinovi");
  const [priority, setPriority] = useState("A");
  const free = data.weekTasks.filter((t) => !t.wig_lead_id);
  const count = data.leads.filter((l) => l.area === "praca").length;
  return (
    <div className="mt-3 space-y-3">
      {count >= 3 && <p className="text-xs text-amber-700">Masz już {count} zobowiązania — specyfikacja zaleca 1–3 na tydzień.</p>}
      <div className="rounded-xl border border-dashed border-stone-300 p-3">
        <p className={LABEL}>Nowe zobowiązanie tygodnia (konkretne i mierzalne — trafi do Weekly Plannera)</p>
        <input className={`${INPUT} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Podpisać umowę z odbiorcą X" aria-label="Nowe zobowiązanie" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select className={INPUT} value={project} onChange={(e) => setProject(e.target.value)} aria-label="Projekt">
            {["Ovoc Malinovi", "Plantacja", "Inne"].map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className={INPUT} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priorytet">
            {["A", "B", "C"].map((p) => <option key={p} value={p}>Priorytet {p}</option>)}
          </select>
        </div>
        <button type="button" className={`${BTN_PRIMARY} mt-2`} disabled={busy || !name.trim()} onClick={() => { add({ name: name.trim(), unit: "zobowiązanie", direction: "at_least", target: 1, source: "task", task: { project, priority } }); setName(""); }}>
          Dodaj zobowiązanie
        </button>
      </div>
      {free.length > 0 && (
        <div>
          <p className={LABEL}>…albo wybierz zadanie z Weekly Plannera tego tygodnia:</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {free.map((t) => (
              <button key={t.id} type="button" className={CHIP} disabled={busy} onClick={() => add({ name: t.task, unit: "zobowiązanie", direction: "at_least", target: 1, source: "task", taskId: t.id })}>
                + {t.priority} · {t.task}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RelacjePlan({ data, locked, onSaved, onError }: { data: WeekData; locked: boolean; onSaved: () => void; onError: (m: string) => void }) {
  return (
    <Card data-testid="plan-relacje">
      <h2 className="text-lg font-bold">💛 Partnerstwo i relacje</h2>
      <p className="mt-1 text-xs text-muted-foreground">Bez punktowania spotkań. Opcjonalnie jedna zamierzona poprawa / działanie na tydzień; w niedzielę rachunek sumienia i samoocena 1–6. Wagi: Monika 40%, Dzieci 35%, Przyjaciele 15%, Pozostali 10%.</p>
      <div className="mt-3 space-y-2">
        {RELATION_SUBS.map((s) => <Intention key={s.key} data={data} sub={s} locked={locked} onSaved={onSaved} onError={onError} />)}
      </div>
    </Card>
  );
}

function Intention({ data, sub, locked, onSaved, onError }: { data: WeekData; sub: (typeof RELATION_SUBS)[number]; locked: boolean; onSaved: () => void; onError: (m: string) => void }) {
  const cur = data.relations.find((r) => r.sub === sub.key);
  const [v, setV] = useState(cur?.intention ?? "");
  const [saved, setSaved] = useState(false);
  const save = async () => {
    if (v === (cur?.intention ?? "")) return;
    try {
      await wigPost({ action: "save_relation", week: data.week, sub: sub.key, intention: v, didWell: cur?.didWell ?? "", didWrong: cur?.didWrong ?? "", impact: cur?.impact ?? "", doDifferently: cur?.doDifferently ?? "", rating: cur?.rating ?? null, excused: cur?.excused ?? false, reason: "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } catch (e) {
      onError(`Nie zapisano (${sub.name}): ${(e as Error).message}`);
    }
  };
  return (
    <label className="block min-w-0">
      <span className={LABEL}>{sub.name} — zamierzona poprawa / działanie {saved && <span className="text-emerald-700">✓ zapisano</span>}</span>
      <input className={INPUT} value={v} onChange={(e) => setV(e.target.value)} onBlur={save} disabled={locked} placeholder="opcjonalnie" aria-label={`Zamiar: ${sub.name}`} />
    </label>
  );
}

function ConfirmStep({ data, onSaved, onError }: { data: WeekData; onSaved: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const approved = data.row?.planStatus === "zatwierdzony";
  const problems = useMemo(() => weightProblems(data.leads.map((l) => ({ area: l.area, weight: l.weight })), data.row?.areaSkip ?? {}), [data]);
  const approve = async () => {
    setBusy(true);
    try {
      await wigPost({ action: "approve_plan", week: data.week });
      onSaved();
    } catch (e) {
      onError(`Nie zatwierdzono planu: ${(e as Error).message}`);
    }
    setBusy(false);
  };
  return (
    <>
      {AREAS.map((a) => (
        <Card key={a.key} data-testid={`confirm-${a.key}`}>
          <h2 className="font-bold">{a.icon} {a.name} <span className="font-normal text-muted-foreground">· {Math.round(a.weight * 100)}% wyniku</span></h2>
          {a.key === "relacje" ? (
            <ul className="mt-2 space-y-0.5 text-sm">
              {RELATION_SUBS.map((s) => <li key={s.key} className="break-words"><b>{s.name}</b>: {data.relations.find((r) => r.sub === s.key)?.intention || <span className="text-muted-foreground">bez zamiaru — samoocena w niedzielę</span>}</li>)}
            </ul>
          ) : data.row?.areaSkip[a.key] ? (
            <p className="mt-1 text-sm text-muted-foreground">Bez celów w tym tygodniu: {data.row.areaSkip[a.key]}</p>
          ) : (
            <ul className="mt-2 space-y-0.5 text-sm">
              {data.leads.filter((l) => l.area === a.key).map((l) => (
                <li key={l.id} className="flex flex-wrap gap-x-2 break-words">
                  <span className="font-semibold">{l.name}</span>
                  <span className="text-muted-foreground">{l.direction === "at_most" ? "limit" : l.direction === "range" ? "zakres" : "cel"} {l.target}{l.targetMax ? `–${l.targetMax}` : ""} {l.unit} · {l.weight}%</span>
                </li>
              ))}
              {data.leads.filter((l) => l.area === a.key).length === 0 && <li className="text-amber-700">brak LEAD-ów</li>}
            </ul>
          )}
        </Card>
      ))}
      <Card data-testid="approve-panel">
        {approved ? (
          <>
            <p className="font-semibold text-emerald-800">✓ Plan na {range(data.week)} zatwierdzony{data.row?.planApprovedAt ? ` (${data.row.planApprovedAt.slice(0, 16).replace("T", " ")})` : ""}.</p>
            <p className="mt-1 text-sm text-muted-foreground">Migawka planu jest zapisana. Zobowiązania z Pracy są w Weekly Plannerze. Wykonanie wpisujesz w ciągu tygodnia na ekranach obszarów, a w niedzielę rozliczasz tydzień tutaj.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className={BTN_SECONDARY} href="/weekly">Weekly Planner</Link>
              <Link className={BTN_SECONDARY} href="/wig">Przegląd WIG</Link>
            </div>
          </>
        ) : (
          <>
            {problems.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-800">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            ) : (
              <p className="text-sm text-muted-foreground">Po zatwierdzeniu plan zostaje zamrożony (migawka). Późniejsze zmiany tylko z uzasadnieniem.</p>
            )}
            <button type="button" className={`${BTN_PRIMARY} mt-3`} disabled={busy || problems.length > 0 || data.today > weekEnd(data.week)} onClick={approve}>Zatwierdź plan tygodnia</button>
          </>
        )}
      </Card>
    </>
  );
}
