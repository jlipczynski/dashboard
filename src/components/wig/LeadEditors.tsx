"use client";
// Editors used by the session wizard and the area view: plan a LEAD, record its execution, Relacje self-review.
import { useState } from "react";
import { DIRECTION_LABEL, SOURCE_LABEL, STATUS_LABEL, type LeadSource } from "@/lib/wig-model";
import { capped, formatPct, ratingFromRealization, realization, RELATION_SUBS } from "@/lib/wig-score";
import { wigPost, type LeadT, type RelationT } from "./client";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, TEXTAREA, StatusPill, fmtNum } from "./ui";

export type Proposal = { name: string; unit: string; direction: "at_least" | "at_most" | "range"; target: number; targetMax?: number; source: LeadSource; notes?: string };
/** Editable proposals for the first week (spec §10) — nothing is saved until Jan clicks one. No running, no English. */
export const PROPOSALS: Record<"zdrowie" | "rozwoj", Proposal[]> = {
  zdrowie: [
    { name: "Rehabilitacja", unit: "dni", direction: "at_least", target: 6, source: "rehab_days" },
    { name: "Siłownia", unit: "treningi", direction: "at_least", target: 2, source: "garmin_strength" },
    { name: "Kalorie (limit tygodnia)", unit: "kcal", direction: "at_most", target: 14000, source: "calories_week", notes: "np. 7 × 2000 kcal" },
    { name: "Spacer / aktywność", unit: "min", direction: "at_least", target: 150, source: "manual" },
    { name: "Rower", unit: "treningi", direction: "at_least", target: 1, source: "garmin_cycling" },
    { name: "Fizjoterapia", unit: "wizyty", direction: "at_least", target: 1, source: "manual" },
  ],
  rozwoj: [
    { name: "Czytanie", unit: "min", direction: "at_least", target: 210, source: "reading_minutes" },
    { name: "Msza św.", unit: "razy", direction: "at_least", target: 1, source: "manual" },
    { name: "Nowy Testament", unit: "rozdziały", direction: "at_least", target: 5, source: "manual" },
    { name: "Audiobooki", unit: "min", direction: "at_least", target: 120, source: "audiobook_minutes" },
    { name: "Pisanie", unit: "min", direction: "at_least", target: 60, source: "manual" },
    { name: "Edukacja / kurs", unit: "min", direction: "at_least", target: 60, source: "manual" },
  ],
};

const SOURCES_FOR: Record<string, LeadSource[]> = {
  zdrowie: ["manual", "rehab_days", "calories_week", "garmin_strength", "garmin_cycling", "garmin_running"],
  rozwoj: ["manual", "reading_minutes", "audiobook_minutes"],
  praca: ["task", "manual"],
};

/** One LEAD in the plan. Saves on "Zapisz" (draft autosave on blur when the plan is still a draft). */
export function LeadPlanRow({ lead, approved, reason, onSaved, onError, disabled }: { lead: LeadT; approved: boolean; reason: string; onSaved: () => void; onError: (m: string) => void; disabled?: boolean }) {
  const [f, setF] = useState({ name: lead.name, unit: lead.unit, direction: lead.direction, target: String(lead.target), targetMax: lead.targetMax === null ? "" : String(lead.targetMax), weight: String(lead.weight), source: lead.source, notes: lead.notes });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = f.name !== lead.name || f.unit !== lead.unit || f.direction !== lead.direction || f.target !== String(lead.target) || f.targetMax !== (lead.targetMax === null ? "" : String(lead.targetMax)) || f.weight !== String(lead.weight) || f.source !== lead.source || f.notes !== lead.notes;

  const save = async () => {
    if (!dirty || busy) return;
    if (approved && !reason) { onError("Plan jest zatwierdzony — wpisz powód zmiany planu (pole nad listą)."); return; }
    setBusy(true);
    try {
      await wigPost({ action: "save_lead", id: lead.id, week: lead.weekStart, area: lead.area, leadKey: lead.leadKey, ...f, position: lead.position, reason });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } catch (e) {
      onError(`Nie zapisano „${f.name}”: ${(e as Error).message}`);
    }
    setBusy(false);
  };
  const remove = async () => {
    if (approved && !reason) { onError("Plan jest zatwierdzony — wpisz powód zmiany planu (pole nad listą)."); return; }
    setBusy(true);
    try {
      await wigPost({ action: "delete_lead", id: lead.id, reason });
      onSaved();
    } catch (e) {
      onError(`Nie usunięto „${lead.name}”: ${(e as Error).message}`);
    }
    setBusy(false);
  };
  const blurSave = () => { if (!approved) void save(); };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="rounded-xl border border-border bg-background p-3" data-testid="lead-row">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem]">
        <label className="min-w-0">
          <span className={LABEL}>LEAD (działanie)</span>
          <input className={INPUT} value={f.name} onChange={set("name")} onBlur={blurSave} disabled={disabled} aria-label="Nazwa LEAD-a" />
        </label>
        <label className="min-w-0">
          <span className={LABEL}>Waga w obszarze</span>
          <span className="flex items-center gap-1">
            <input className={INPUT} inputMode="decimal" value={f.weight} onChange={set("weight")} onBlur={blurSave} disabled={disabled} aria-label="Waga %" />
            <span className="text-sm text-muted-foreground">%</span>
          </span>
        </label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="min-w-0">
          <span className={LABEL}>Kierunek</span>
          <select className={INPUT} value={f.direction} onChange={set("direction")} onBlur={blurSave} disabled={disabled || lead.area === "praca"} aria-label="Kierunek miary">
            {Object.entries(DIRECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className={LABEL}>{f.direction === "range" ? "Od" : f.direction === "at_most" ? "Limit" : "Cel"}</span>
          <input className={INPUT} inputMode="decimal" value={f.target} onChange={set("target")} onBlur={blurSave} disabled={disabled} aria-label="Wartość docelowa" />
        </label>
        {f.direction === "range" ? (
          <label className="min-w-0">
            <span className={LABEL}>Do</span>
            <input className={INPUT} inputMode="decimal" value={f.targetMax} onChange={set("targetMax")} onBlur={blurSave} disabled={disabled} aria-label="Górna granica" />
          </label>
        ) : null}
        <label className="min-w-0">
          <span className={LABEL}>Jednostka</span>
          <input className={INPUT} value={f.unit} onChange={set("unit")} onBlur={blurSave} disabled={disabled} aria-label="Jednostka" />
        </label>
        <label className="col-span-2 min-w-0 sm:col-span-1">
          <span className={LABEL}>Źródło danych</span>
          <select className={INPUT} value={f.source} onChange={set("source")} onBlur={blurSave} disabled={disabled} aria-label="Źródło danych">
            {(SOURCES_FOR[lead.area] ?? ["manual"]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-2 block min-w-0">
        <span className={LABEL}>Notatka (opcjonalnie)</span>
        <input className={INPUT} value={f.notes} onChange={set("notes")} onBlur={blurSave} disabled={disabled} aria-label="Notatka" />
      </label>
      {lead.tasks.length > 0 && (
        <p className="mt-2 truncate text-xs text-muted-foreground">Weekly Planner: {lead.tasks.map((t) => `${t.task} (${t.project}, ${t.priority})`).join(", ")}</p>
      )}
      {!disabled && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(dirty || approved) && <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy || !dirty}>Zapisz</button>}
          {saved && <span className="text-xs text-emerald-700">✓ zapisano</span>}
          <button type="button" className={`${BTN_GHOST} ml-auto`} onClick={remove} disabled={busy}>Usuń</button>
        </div>
      )}
    </div>
  );
}

/** Execution of one LEAD: value / confirmed zero / excused, with the source suggestion. */
export function ResultRow({ lead, suggestion, closed, onSaved, onError }: { lead: LeadT; suggestion?: { value: number | null; evidence: string; complete: boolean } | null; closed: boolean; onSaved: () => void; onError: (m: string) => void }) {
  const cur = lead.result;
  // Until Jan types, the field shows the saved value or else the (asynchronously loaded) source suggestion.
  const [typed, setActual] = useState<string | null>(null);
  const actual = typed ?? (cur?.actual !== null && cur?.actual !== undefined ? String(cur.actual) : suggestion?.value !== null && suggestion?.value !== undefined ? String(suggestion.value) : "");
  const [evidence, setEvidence] = useState(cur?.evidence ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"value" | "excused">(cur?.status === "excused" ? "excused" : "value");

  const a = actual.trim() === "" ? null : Number(actual.replace(",", "."));
  const r = a === null || !Number.isFinite(a) ? null : realization({ direction: lead.direction, target: lead.target, targetMax: lead.targetMax, actual: a });

  const save = async (status: "measured" | "manual" | "zero_confirmed" | "excused") => {
    if (closed && !reason.trim()) { onError(`„${lead.name}”: tydzień jest zamknięty — wpisz powód korekty.`); return; }
    setBusy(true);
    try {
      await wigPost({ action: "save_result", leadId: lead.id, actual: status === "excused" ? null : a, status, evidence: status === "measured" && suggestion ? suggestion.evidence : evidence, sourceValue: suggestion?.value ?? null, reason: reason.trim() });
      setReason("");
      onSaved();
    } catch (e) {
      onError(`Nie zapisano wykonania „${lead.name}”: ${(e as Error).message}`);
    }
    setBusy(false);
  };
  const fromSource = suggestion && suggestion.value !== null && a === suggestion.value && lead.source !== "manual";

  return (
    <div className="rounded-xl border border-border bg-background p-3" data-testid="result-row">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 break-words font-semibold text-foreground">{lead.name}</span>
        <span className="text-xs text-muted-foreground">
          {DIRECTION_LABEL[lead.direction]} {fmtNum(lead.target)}{lead.direction === "range" ? `–${fmtNum(lead.targetMax)}` : ""} {lead.unit} · waga {fmtNum(lead.weight)}%
        </span>
        {cur && <StatusPill tone={cur.status === "excused" ? "amber" : "green"}>{STATUS_LABEL[cur.status]}{cur.actual !== null ? `: ${fmtNum(cur.actual)}` : ""}{cur.revision > 1 ? ` · wersja ${cur.revision}` : ""}</StatusPill>}
        {!cur && <StatusPill tone="amber">brak danych</StatusPill>}
      </div>
      {suggestion && (
        <p className="mt-1 break-words text-xs text-muted-foreground">
          Źródło: {suggestion.evidence}{suggestion.complete ? "" : " · niepełne — sprawdź"}
        </p>
      )}
      {lead.tasks.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Zadanie: {lead.tasks.map((t) => `${t.task} — ${t.status === "done" ? "zrobione" : "niezrobione"}`).join(", ")}</p>}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {mode === "value" ? (
          <>
            <label className="w-32 min-w-0">
              <span className={LABEL}>Wykonanie ({lead.unit || "liczba"})</span>
              <input className={INPUT} inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} aria-label={`Wykonanie: ${lead.name}`} />
            </label>
            <span className="pb-2 text-xs text-muted-foreground">
              {r === null ? "" : `${formatPct(r)}${r > 1.5 ? ` (liczone ${formatPct(capped(r))})` : ""} → ocena ${ratingFromRealization(capped(r))}`}
            </span>
          </>
        ) : (
          <label className="min-w-0 flex-1">
            <span className={LABEL}>Powód usprawiedliwienia</span>
            <input className={INPUT} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="np. choroba, zalecenie lekarza" aria-label={`Powód: ${lead.name}`} />
          </label>
        )}
      </div>
      {mode === "value" && lead.source === "manual" && (
        <input className={`${INPUT} mt-2`} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Dowód / notatka (opcjonalnie)" aria-label={`Dowód: ${lead.name}`} />
      )}
      {closed && <input className={`${INPUT} mt-2`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Powód korekty (wymagany — tydzień zamknięty)" aria-label={`Powód korekty: ${lead.name}`} />}
      <div className="mt-2 flex flex-wrap gap-2">
        {mode === "value" ? (
          <>
            <button type="button" className={BTN_PRIMARY} disabled={busy || a === null || !(a >= 0)} onClick={() => save(fromSource ? "measured" : "manual")}>Zapisz wykonanie</button>
            <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => save("zero_confirmed")}>0 — potwierdzam</button>
            <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => setMode("excused")}>Usprawiedliwione…</button>
          </>
        ) : (
          <>
            <button type="button" className={BTN_PRIMARY} disabled={busy || !evidence.trim()} onClick={() => save("excused")}>Zapisz jako usprawiedliwione</button>
            <button type="button" className={BTN_GHOST} onClick={() => setMode("value")}>Wróć do wartości</button>
          </>
        )}
      </div>
    </div>
  );
}

/** Relacje: weekly examination of conscience for one sub-area (intention from the plan, review, self-rating 1–6). */
export function RelationReview({ week, sub, current, closed, canRate, onSaved, onError }: { week: string; sub: (typeof RELATION_SUBS)[number]; current: RelationT | undefined; closed: boolean; canRate: boolean; onSaved: () => void; onError: (m: string) => void }) {
  const init = () => ({ didWell: current?.didWell ?? "", didWrong: current?.didWrong ?? "", impact: current?.impact ?? "", doDifferently: current?.doDifferently ?? "" });
  const [f, setF] = useState(init);
  const [rating, setRating] = useState<number | null>(current?.rating ?? null);
  const [excused, setExcused] = useState(current?.excused ?? false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (over?: { rating?: number | null; excused?: boolean }) => {
    if (closed && !reason.trim()) { onError(`${sub.name}: tydzień jest zamknięty — wpisz powód korekty.`); return; }
    setBusy(true);
    const nr = over && "rating" in over ? over.rating : rating;
    const ne = over && "excused" in over ? over.excused : excused;
    try {
      await wigPost({ action: "save_relation", week, sub: sub.key, intention: current?.intention ?? "", ...f, rating: ne ? null : nr, excused: !!ne, reason: reason.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      setReason("");
      onSaved();
    } catch (e) {
      onError(`Nie zapisano (${sub.name}): ${(e as Error).message}`);
    }
    setBusy(false);
  };
  const field = (k: keyof typeof f, label: string) => (
    <label className="block min-w-0">
      <span className={LABEL}>{label}</span>
      <textarea className={TEXTAREA} rows={2} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} aria-label={`${sub.name}: ${label}`} />
    </label>
  );

  return (
    <div className="rounded-xl border border-border bg-background p-3" data-testid={`relation-${sub.key}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold text-foreground">{sub.name}</span>
        <span className="text-xs text-muted-foreground">waga {sub.weight}%</span>
        {current?.rating ? <StatusPill tone="green">samoocena {current.rating}</StatusPill> : current?.excused ? <StatusPill tone="amber">usprawiedliwione</StatusPill> : <StatusPill tone="amber">brak samooceny</StatusPill>}
      </div>
      {current?.intention && <p className="mt-1 break-words text-xs text-muted-foreground">Zamiar z planu: {current.intention}</p>}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {field("didWell", "Co zrobiłem dobrze")}
        {field("didWrong", "Co zrobiłem źle / co mogłem poprawić")}
        {field("impact", "Jaki wpływ to mogło mieć")}
        {field("doDifferently", "Co zrobię inaczej")}
      </div>
      <div className="mt-2">
        <span className={LABEL}>Samoocena moich działań (1–6)</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <button key={v} type="button" disabled={!canRate || busy} onClick={() => { setRating(v); setExcused(false); void save({ rating: v, excused: false }); }}
              className={`h-10 w-10 rounded-full border text-sm font-semibold ${rating === v && !excused ? "border-emerald-700 bg-emerald-700 text-white" : "border-border bg-card text-foreground"}`} aria-label={`${sub.name}: ocena ${v}`} aria-pressed={rating === v && !excused}>
              {v}
            </button>
          ))}
          <button type="button" disabled={!canRate || busy} onClick={() => { setExcused(true); void save({ excused: true }); }} className={`h-10 rounded-full border px-3 text-xs ${excused ? "border-amber-600 bg-amber-50 text-amber-800" : "border-border bg-card text-muted-foreground"}`}>
            usprawiedliwione
          </button>
        </div>
        {!canRate && <p className="mt-1 text-xs text-muted-foreground">Samoocenę wystawisz dla tygodnia z zatwierdzonym planem.</p>}
      </div>
      {closed && <input className={`${INPUT} mt-2`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Powód korekty (wymagany — tydzień zamknięty)" aria-label={`${sub.name}: powód korekty`} />}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => save()}>Zapisz refleksję</button>
        {saved && <span className="text-xs text-emerald-700">✓ zapisano</span>}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">To samoocena moich działań i refleksja — nie ocena drugiej osoby. Widoczne tylko dla Ciebie.</p>
    </div>
  );
}
