"use client";
// Weekly Planner side panel: the WIG plan of the week shown in the planner (same data source, no copy).
import Link from "next/link";
import { useEffect, useState } from "react";
import { AREAS, RELATION_SUBS } from "@/lib/wig-score";
import { addDaysIso } from "@/lib/dates";
import { wigGet, type WeekData } from "./client";

export default function WigPlanPanel({ weekStart }: { weekStart: string | null }) {
  const [st, setSt] = useState<{ week: string; data: WeekData | null; err: string | null } | null>(null);
  useEffect(() => {
    if (!weekStart) return;
    wigGet<WeekData>({ view: "week", week: weekStart })
      .then((x) => setSt({ week: weekStart, data: { ...x, leads: x.leads ?? [], relations: x.relations ?? [] }, err: null }))
      .catch((e) => setSt({ week: weekStart, data: null, err: e.message }));
  }, [weekStart]);
  const d = st?.week === weekStart ? st.data : null;
  const err = st?.week === weekStart ? st.err : null;
  if (!weekStart) return null;
  const approved = d?.row?.planStatus === "zatwierdzony";
  const box: React.CSSProperties = { background: "#FFF", borderRadius: 14, padding: "16px 18px", border: "1px solid #E5E7EB", marginBottom: 16 };
  return (
    <div style={box} data-testid="wig-plan-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Plan WIG tygodnia</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: approved ? "#047857" : "#B45309" }}>{d ? (d.row ? (d.row.closeStatus ? "zamknięty" : approved ? "zatwierdzony" : "robocza") : "brak") : ""}</span>
      </div>
      {err && <p style={{ fontSize: 12, color: "#DC2626" }} role="alert">Nie wczytano planu WIG: {err}</p>}
      {d && !d.leads.length && !d.relations.some((r) => r.intention) && <p style={{ fontSize: 12, color: "#6B7280" }}>Brak planu WIG na ten tydzień.</p>}
      {d &&
        AREAS.map((a) => {
          const items = a.key === "relacje" ? RELATION_SUBS.map((s) => ({ k: s.key, t: d.relations.find((r) => r.sub === s.key)?.intention ? `${s.name}: ${d.relations.find((r) => r.sub === s.key)?.intention}` : "" })).filter((x) => x.t) : d.leads.filter((l) => l.area === a.key).map((l) => ({ k: l.id, t: `${l.name} — ${l.direction === "at_most" ? "limit " : ""}${l.target}${l.targetMax ? `–${l.targetMax}` : ""} ${l.unit}${l.result ? ` · wykonanie ${l.result.actual ?? "usprawiedliwione"}` : ""}` }));
          if (!items.length) return null;
          return (
            <div key={a.key} style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>{a.icon} {a.short}</div>
              {items.map((i) => <div key={i.k} style={{ fontSize: 12, color: "#111827", overflowWrap: "anywhere" }}>{i.t}</div>)}
            </div>
          );
        })}
      <Link href={approved ? `/wig/sesja/${addDaysIso(weekStart, 7)}?krok=przeglad` : `/wig/sesja/${weekStart}?krok=plan`} style={{ display: "inline-block", marginTop: 10, fontSize: 12, fontWeight: 700, color: "#047857" }}>
        {approved ? "Sesja WIG →" : "Zaplanuj tydzień w WIG →"}
      </Link>
    </div>
  );
}
