"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/lib/supabase";

const PILLARS = {
  "Ovoc Malinovi": { color: "#DC2626", icon: "🫐", type: "praca" },
  "Plantacja": { color: "#16A34A", icon: "🌿", type: "praca" },
  "Inne": { color: "#7C3AED", icon: "📁", type: "praca" },
  "Zdrowie": { color: "#EA580C", icon: "💪", type: "życie" },
  "Rozwój": { color: "#2563EB", icon: "📚", type: "życie" },
  "Relacje": { color: "#DB2777", icon: "❤️", type: "życie" },
  "Duchowość": { color: "#059669", icon: "🧘", type: "życie" },
};

const PRIORITY_META = {
  A: { label: "A", desc: "Musisz zrobić", sub: "Poważne konsekwencje", pts: 4, color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  B: { label: "B", desc: "Powinieneś zrobić", sub: "Łagodne konsekwencje", pts: 3, color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  C: { label: "C", desc: "Fajnie byłoby", sub: "Zero konsekwencji", pts: 2, color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  D: { label: "D", desc: "Deleguj", sub: "Oddaj komuś", pts: 1, color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  E: { label: "E", desc: "Eliminuj", sub: "W ogóle nie rób", pts: 0, color: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0" },
};

const SAMPLE_WIGS = [
  { id: "wig1", name: "OS Malinovi 1.0", project: "Ovoc Malinovi" },
  { id: "wig2", name: "Harvest 50", project: "Ovoc Malinovi" },
  { id: "wig3", name: "No Complaints", project: "Ovoc Malinovi" },
  { id: "wig4", name: "Product X", project: "Ovoc Malinovi" },
];

const getWeekDates = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: new Date(monday), end: sunday };
};

const formatDate = (d) => d.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
const getWeekNumber = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
};

const toDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const mapFromDb = (rows) =>
  rows.map((r) => ({
    id: r.id,
    task: r.task,
    project: r.project,
    priority: r.priority,
    subPriority: r.sub_priority,
    wig: r.wig_id || "",
    deadline: r.deadline || "",
    status: r.status,
    person: r.person || "",
    notes: r.notes || "",
    points: r.points || 0,
  }));

export default function WeeklyPlanner() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");


  const [expandedTask, setExpandedTask] = useState(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ goal: "", project: "Ovoc Malinovi", priority: "A" });
  const [error, setError] = useState(null);

  const week = getWeekDates(currentDate);
  const weekNum = getWeekNumber(week.start);
  const weekStart = toDateStr(week.start);

  const fetchGoals = useCallback(async (ws) => {
    if (!supabase) { setLoading(false); setError("Supabase nie jest podłączony — brak NEXT_PUBLIC_SUPABASE_URL lub NEXT_PUBLIC_SUPABASE_ANON_KEY"); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("weekly_tasks")
      .select("*")
      .eq("week_start", ws)
      .order("priority", { ascending: true })
      .order("sub_priority", { ascending: true })
      .order("created_at", { ascending: true });
    if (err) {
      console.error("Goals fetch error:", err);
      setError(`Błąd ładowania celów: ${err.message} (${err.code})`);
      setGoals([]);
    } else {
      setGoals(mapFromDb(data || []));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGoals(weekStart);
  }, [weekStart, fetchGoals]);

  const addGoal = async () => {
    if (!newGoal.goal.trim()) return;
    if (!supabase) { setError("Supabase nie jest podłączony"); return; }
    setError(null);
    const samePriority = goals.filter((g) => g.priority === newGoal.priority);
    const pts = PRIORITY_META[newGoal.priority]?.pts ?? 0;
    const { data, error } = await supabase
      .from("weekly_tasks")
      .insert({ task: newGoal.goal, project: newGoal.project, priority: newGoal.priority, sub_priority: samePriority.length + 1, week_start: weekStart, status: "todo", points: pts })
      .select()
      .single();
    if (error) { setError(`Błąd dodawania celu: ${error.message}`); return; }
    if (data) setGoals((prev) => {
      const updated = [...prev, mapFromDb([data])[0]];
      const pOrder = "ABCDE";
      updated.sort((a, b) => {
        const pDiff = pOrder.indexOf(a.priority || "A") - pOrder.indexOf(b.priority || "A");
        if (pDiff !== 0) return pDiff;
        return (a.subPriority || 99) - (b.subPriority || 99);
      });
      return updated;
    });
    setNewGoal({ goal: "", project: "Ovoc Malinovi", priority: "A" });
    setShowAddGoal(false);
  };

  const toggleGoal = async (id) => {
    const goal = goals.find((g) => g.id === id);
    if (!goal) return;
    const newStatus = goal.status === "done" ? "todo" : "done";
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, status: newStatus } : g)));
    if (supabase) {
      await supabase
        .from("weekly_tasks")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
    }
  };

  const deleteGoal = async (id) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    if (supabase) {
      await supabase.from("weekly_tasks").delete().eq("id", id);
    }
  };

  const navigateWeek = (dir) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };

  const isCurrentWeek = () => {
    const now = new Date();
    const thisWeek = getWeekDates(now);
    return week.start.getTime() === thisWeek.start.getTime();
  };

  const filteredGoals = useMemo(() => {
    let t = [...goals];
    if (filter !== "all") t = t.filter((x) => x.project === filter);
    t.sort((a, b) => {
      const pOrder = "ABCDE";
      const pDiff = pOrder.indexOf(a.priority) - pOrder.indexOf(b.priority);
      if (pDiff !== 0) return pDiff;
      return (a.subPriority || 99) - (b.subPriority || 99);
    });
    return t;
  }, [goals, filter]);

  const stats = useMemo(() => {
    const total = goals.reduce((s, t) => s + PRIORITY_META[t.priority].pts + (t.wig ? 2 : 0), 0);
    const done = goals.filter((t) => t.status === "done").reduce((s, t) => s + PRIORITY_META[t.priority].pts + (t.wig ? 2 : 0), 0);
    const wigTasks = goals.filter((t) => t.wig).length;
    const wigDone = goals.filter((t) => t.wig && t.status === "done").length;
    const wigPts = goals.filter((t) => t.wig && t.status === "done").reduce((s, t) => s + PRIORITY_META[t.priority].pts + 2, 0);
    const doneCount = goals.filter((t) => t.status === "done").length;
    return { total, done, wigTasks, wigDone, wigPts, doneCount, taskCount: goals.length };
  }, [goals]);

  const progressPct = stats.taskCount > 0 ? Math.round((stats.doneCount / stats.taskCount) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF9", color: "#1A1A1A", fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700&family=Space+Mono:wght@400;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #D4D4D4; border-radius: 2px; }
        input, select, textarea { font-family: inherit; }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: "24px 36px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #E5E5E5", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </a>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 3, color: "#A3A3A3", textTransform: "uppercase", marginBottom: 6 }}>Panel życia</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, color: "#171717" }}>Weekly Planner</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <StatPill label="Punkty" value={`${stats.done}/${stats.total}`} accent="#16A34A" />
          <StatPill label="WIG" value={`${stats.wigTasks}/${stats.taskCount}`} accent="#D97706" />
          <StatPill label="Done" value={`${stats.doneCount}/${stats.taskCount}`} accent="#2563EB" />
        </div>
      </div>

      {/* WEEK NAV */}
      <div style={{ padding: "0 36px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigateWeek(-1)} style={navBtnStyle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{ textAlign: "center", minWidth: 240 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#171717" }}>
              {formatDate(week.start)} — {formatDate(week.end)}
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#A3A3A3", letterSpacing: 1, marginTop: 2 }}>
              W{weekNum} · {week.start.getFullYear()}
            </div>
          </div>
          <button onClick={() => navigateWeek(1)} style={navBtnStyle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          {!isCurrentWeek() && (
            <button onClick={() => setCurrentDate(new Date())} style={{ ...navBtnStyle, padding: "6px 14px", width: "auto", fontSize: 11, fontFamily: "'Space Mono', monospace", color: "#16A34A", borderColor: "#BBF7D0", background: "#F0FDF4" }}>{"Dziś"}</button>
          )}
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <FilterChip label="Wszystko" active={filter === "all"} onClick={() => setFilter("all")} color="#525252" />
          {Object.entries(PILLARS).map(([name, p]) => (
            <FilterChip key={name} label={`${p.icon} ${name}`} active={filter === name} onClick={() => setFilter(name)} color={p.color} />
          ))}
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div style={{ padding: "0 36px", marginBottom: 20 }}>
        <div style={{ height: 3, background: "#EDEDED", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg, #16A34A, #4ADE80)", borderRadius: 2, transition: "width 0.5s ease" }} />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ padding: "0 36px 40px", display: "flex", gap: 28 }}>
        {/* TASK LIST */}
        <div style={{ flex: 1 }}>
          {error && (
            <div style={{ padding: "14px 18px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>{error}</div>
              </div>
              <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 16 }}>{"×"}</button>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#A3A3A3", fontSize: 14 }}>
              Ładowanie celów...
            </div>
          ) : (
            <>
              {["A", "B", "C", "D", "E"].map((p) => {
                const groupGoals = filteredGoals.filter((t) => t.priority === p);
                if (groupGoals.length === 0) return null;
                const meta = PRIORITY_META[p];
                return (
                  <div key={p} style={{ marginBottom: 28 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: meta.bg, border: `1.5px solid ${meta.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: meta.color, fontFamily: "'Space Mono', monospace" }}>{p}</div>
                      <span style={{ fontSize: 12, color: "#A3A3A3", fontFamily: "'Space Mono', monospace", letterSpacing: 1, textTransform: "uppercase" }}>{meta.desc}</span>
                      <div style={{ flex: 1, height: 1, background: "#EDEDED" }} />
                      <span style={{ fontSize: 11, color: "#C4C4C4", fontFamily: "'Space Mono', monospace" }}>{meta.pts} pkt</span>
                    </div>
                    {groupGoals.map((t) => (
                      <TaskRow key={t.id} task={t} meta={meta} isFrog={t.priority === "A" && t.subPriority === 1} onToggle={() => toggleGoal(t.id)} expanded={expandedTask === t.id} onExpand={() => setExpandedTask(expandedTask === t.id ? null : t.id)} onDelete={() => deleteGoal(t.id)} onUpdate={(updated) => setGoals(prev => prev.map(g => g.id === updated.id ? { ...g, task: updated.task, project: updated.project, priority: updated.priority, points: updated.points } : g))} />
                    ))}
                  </div>
                );
              })}

              {filteredGoals.length === 0 && !loading && (
                <div style={{ textAlign: "center", padding: 40, color: "#C4C4C4", fontSize: 14 }}>
                  {"Brak celów na ten tydzień. Dodaj pierwszy!"}
                </div>
              )}
            </>
          )}

          {!showAddGoal ? (
            <button onClick={() => setShowAddGoal(true)} style={{ width: "100%", padding: "10px", background: "#FFFFFF", border: "1.5px dashed #BBF7D0", borderRadius: 10, color: "#86EFAC", fontSize: 13, cursor: "pointer", transition: "all 0.2s" }}>+ Dodaj cel</button>
          ) : (
            <div style={{ padding: 16, background: "#FFFFFF", borderRadius: 12, border: "1px solid #E5E5E5", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <input value={newGoal.goal} onChange={(e) => setNewGoal({ ...newGoal, goal: e.target.value })} placeholder="Cel na ten tydzień..." style={inputStyle} autoFocus onKeyDown={(e) => e.key === "Enter" && addGoal()} />
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select value={newGoal.priority} onChange={(e) => setNewGoal({ ...newGoal, priority: e.target.value })} style={selectStyle}>
                  {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{k} — {v.desc}</option>)}
                </select>
                <select value={newGoal.project} onChange={(e) => setNewGoal({ ...newGoal, project: e.target.value })} style={selectStyle}>
                  {Object.keys(PILLARS).map((p) => <option key={p} value={p}>{PILLARS[p].icon} {p}</option>)}
                </select>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button onClick={addGoal} style={{ ...primaryBtnStyle, padding: "7px 18px", fontSize: 12 }}>Dodaj</button>
                  <button onClick={() => setShowAddGoal(false)} style={{ ...secondaryBtnStyle, padding: "7px 18px", fontSize: 12 }}>Anuluj</button>
                </div>
              </div>
            </div>
          )}


          <WeeklyStats weekStart={weekStart} />
        </div>

        {/* SIDEBAR */}
        <div style={{ width: 272, flexShrink: 0 }}>
          <div style={{ background: "#FFFFFF", borderRadius: 16, padding: 24, border: "1px solid #E5E5E5", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 2, color: "#A3A3A3", textTransform: "uppercase", marginBottom: 16 }}>W{weekNum} Score</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 44, fontWeight: 700, color: "#171717", lineHeight: 1, fontFamily: "'Space Mono', monospace" }}>{stats.done}</span>
              <span style={{ fontSize: 20, color: "#D4D4D4", fontFamily: "'Space Mono', monospace" }}>/ {stats.total}</span>
            </div>
            <div style={{ fontSize: 12, color: "#A3A3A3", marginTop: 2 }}>punktów zdobytych{stats.wigPts > 0 ? `, z czego ${stats.wigPts} na WIG-ach` : ""}</div>

            <div style={{ display: "flex", justifyContent: "center", margin: "20px 0 16px" }}>
              <svg width="110" height="110" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="46" fill="none" stroke="#F3F3F3" strokeWidth="7" />
                <circle cx="55" cy="55" r="46" fill="none" stroke="#16A34A" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${progressPct * 2.89} 289`} transform="rotate(-90 55 55)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
                <text x="55" y="50" textAnchor="middle" fill="#171717" fontSize="22" fontWeight="700" fontFamily="'Space Mono', monospace">{progressPct}%</text>
                <text x="55" y="67" textAnchor="middle" fill="#A3A3A3" fontSize="9" fontFamily="'Space Mono', monospace" letterSpacing="1">DONE</text>
              </svg>
            </div>

            <div style={{ borderTop: "1px solid #F3F3F3", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(PILLARS).map(([name, p]) => {
                const count = goals.filter((t) => t.project === name).length;
                if (count === 0) return null;
                const doneCount = goals.filter((t) => t.project === name && t.status === "done").length;
                const pct = Math.round((doneCount / count) * 100);
                return (
                  <div key={name}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
                        <span style={{ fontSize: 12, color: "#737373" }}>{name}</span>
                      </div>
                      <span style={{ fontSize: 11, fontFamily: "'Space Mono', monospace", color: doneCount === count && count > 0 ? "#16A34A" : "#A3A3A3" }}>{doneCount}/{count}</span>
                    </div>
                    <div style={{ height: 2, background: "#F3F3F3", borderRadius: 1, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: p.color, borderRadius: 1, transition: "width 0.4s ease", opacity: 0.6 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: "#FFFFFF", borderRadius: 16, padding: 20, border: "1px solid #E5E5E5", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 2, color: "#A3A3A3", textTransform: "uppercase", marginBottom: 10 }}>WIG Impact</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: "#D97706", fontFamily: "'Space Mono', monospace" }}>
                {stats.taskCount > 0 ? Math.round((stats.wigTasks / stats.taskCount) * 100) : 0}%
              </span>
              <span style={{ fontSize: 12, color: "#A3A3A3" }}>strategicznych</span>
            </div>
            <div style={{ marginTop: 10, height: 4, background: "#FEF3C7", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${stats.taskCount > 0 ? Math.round((stats.wigTasks / stats.taskCount) * 100) : 0}%`, background: "#D97706", borderRadius: 2, transition: "width 0.4s ease" }} />
            </div>
            <div style={{ fontSize: 11, color: "#C4C4C4", marginTop: 8, lineHeight: 1.5 }}>
              {stats.wigTasks > 0 ? `${stats.wigTasks} z ${stats.taskCount} celów na WIG-ach. Reszta = whirlwind.` : "Brak celów powiązanych z WIG-ami."}
            </div>
          </div>

          <div style={{ background: "#FFFFFF", borderRadius: 16, padding: 20, border: "1px solid #E5E5E5", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 2, color: "#A3A3A3", textTransform: "uppercase", marginBottom: 12 }}>Scoring</div>
            {Object.entries(PRIORITY_META).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: v.bg, border: `1.5px solid ${v.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: v.color, fontFamily: "'Space Mono', monospace" }}>{k}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#737373" }}>{v.desc}</div>
                  <div style={{ fontSize: 10, color: "#C4C4C4" }}>{v.sub}</div>
                </div>
                <span style={{ fontSize: 11, color: "#C4C4C4", fontFamily: "'Space Mono', monospace" }}>{v.pts}p</span>
              </div>
            ))}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F3F3F3", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: "#FFFBEB", border: "1.5px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#D97706" }}>{"\u25C6"}</div>
                <span style={{ fontSize: 12, color: "#737373" }}>WIG bonus</span>
                <span style={{ fontSize: 11, color: "#C4C4C4", marginLeft: "auto", fontFamily: "'Space Mono', monospace" }}>+2p</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: "#FFFBEB", border: "1.5px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🐸</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#737373" }}>A-1 = Twoja żaba</div>
                  <div style={{ fontSize: 10, color: "#C4C4C4" }}>Zrób to PIERWSZE rano</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task, meta, onToggle, expanded, onExpand, onDelete, isFrog, onUpdate }) {
  const [rolloverStatus, setRolloverStatus] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTask, setEditTask] = useState(task.task);
  const [editProject, setEditProject] = useState(task.project);
  const [editPriority, setEditPriority] = useState(task.priority);
  const [saving, setSaving] = useState(false);
  const pillar = PILLARS[task.project];
  const wig = SAMPLE_WIGS.find((w) => w.id === task.wig);
  const pts = PRIORITY_META[task.priority].pts + (task.wig ? 2 : 0);
  const isDone = task.status === "done";
  const frogStyle = isFrog && !isDone ? { background: "#FFFBEB", border: "1.5px solid #FDE68A" } : {};

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/weekly/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, task: editTask, project: editProject, priority: editPriority }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        onUpdate(data.updated);
        setIsEditing(false);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleRollover = async () => {
    if (rolloverStatus) return;
    setRolloverStatus("loading");
    try {
      const res = await fetch("/api/weekly/rollover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id }),
      });
      const data = await res.json();
      if (data.status === "already_exists") {
        setRolloverStatus("duplicate");
      } else {
        setRolloverStatus("done");
      }
    } catch {
      setRolloverStatus(null);
      return;
    }
    setTimeout(() => setRolloverStatus(null), 1500);
  };

  return (
    <div style={{ marginBottom: 4 }}>
      <div onClick={onExpand} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: isDone ? "#F7FDF7" : "#FFFFFF", borderRadius: expanded ? "12px 12px 0 0" : 12, cursor: "pointer", border: `1px solid ${expanded ? "#D4D4D4" : "#EDEDED"}`, transition: "all 0.15s", opacity: isDone ? 0.5 : 1, ...frogStyle }}>
        <div onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ width: 20, height: 20, borderRadius: 6, border: isDone ? "none" : `2px solid ${meta.border}`, background: isDone ? meta.color : "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }}>
          {isDone && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
        </div>

        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: meta.color, minWidth: 26, display: "flex", alignItems: "center", gap: 4 }}>
          {isFrog && !isDone && <span title="Eat That Frog! Zrób to PIERWSZE rano.">🐸</span>}
          {task.priority}{task.subPriority ? `-${task.subPriority}` : ""}
        </div>

        <div style={{ flex: 1, fontSize: 14, fontWeight: 450, textDecoration: isDone ? "line-through" : "none", color: isDone ? "#A3A3A3" : "#262626" }}>{task.task}</div>

        {pillar && (
          <div style={{ padding: "3px 10px", borderRadius: 6, background: `${pillar.color}0C`, color: pillar.color, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>
            {pillar.icon} {task.project}
          </div>
        )}

        {wig && (
          <div style={{ padding: "3px 8px", borderRadius: 6, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#D97706", fontSize: 10, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>{"\u25C6"} WIG</div>
        )}

        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: isDone ? "#16A34A" : "#C4C4C4", minWidth: 30, textAlign: "right", fontWeight: isDone ? 600 : 400 }}>{pts}p</div>
      </div>

      {expanded && (
        <div style={{ padding: "12px 14px 14px", background: "#FFFFFF", borderRadius: "0 0 12px 12px", border: "1px solid #D4D4D4", borderTop: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {isEditing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="text" value={editTask} onChange={(e) => setEditTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} style={{ width: "100%", padding: "8px 12px", background: "#FAFAF9", border: "1px solid #E5E5E5", borderRadius: 8, color: "#171717", fontSize: 14, outline: "none" }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={editProject} onChange={(e) => setEditProject(e.target.value)} style={{ padding: "6px 10px", background: "#FAFAF9", border: "1px solid #E5E5E5", borderRadius: 8, color: "#525252", fontSize: 12, outline: "none" }}>
                  {Object.keys(PILLARS).map((p) => <option key={p} value={p}>{PILLARS[p].icon} {p}</option>)}
                </select>
                <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} style={{ padding: "6px 10px", background: "#FAFAF9", border: "1px solid #E5E5E5", borderRadius: 8, color: "#525252", fontSize: 12, outline: "none" }}>
                  {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{k} — {v.desc}</option>)}
                </select>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={handleSave} disabled={saving} style={{ padding: "5px 14px", background: "#16A34A", border: "none", borderRadius: 7, color: "#fff", fontSize: 11, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "'Space Mono', monospace", opacity: saving ? 0.6 : 1 }}>{saving ? "Zapisuję..." : "Zapisz"}</button>
                  <button onClick={() => { setIsEditing(false); setEditTask(task.task); setEditProject(task.project); setEditPriority(task.priority); }} style={{ padding: "5px 14px", background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 7, color: "#737373", fontSize: 11, cursor: "pointer", fontFamily: "'Space Mono', monospace" }}>Anuluj</button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
              {wig && <DetailChip label="WIG" value={wig.name} color="#D97706" />}
              {task.deadline && <DetailChip label="Deadline" value={new Date(task.deadline).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} color="#DC2626" />}
              {task.person && <DetailChip label="Osoba" value={task.person} color="#2563EB" />}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} style={{ padding: "5px 14px", background: "#FFFFFF", border: "1px solid #D4D4D4", borderRadius: 7, color: "#737373", fontSize: 11, cursor: "pointer", fontFamily: "'Space Mono', monospace" }}>Edytuj</button>
                {!isDone && (
                  <button onClick={(e) => { e.stopPropagation(); handleRollover(); }} disabled={rolloverStatus === "loading"} style={{ padding: "5px 14px", background: "#FFFFFF", border: "1px solid #D4D4D4", borderRadius: 7, color: rolloverStatus === "done" ? "#16A34A" : rolloverStatus === "duplicate" ? "#D97706" : "#737373", fontSize: 11, cursor: rolloverStatus ? "default" : "pointer", fontFamily: "'Space Mono', monospace" }}>
                    {rolloverStatus === "done" ? "✓ Przeniesiono" : rolloverStatus === "duplicate" ? "Już istnieje" : rolloverStatus === "loading" ? "..." : "→ Nast. tydzień"}
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ padding: "5px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, color: "#DC2626", fontSize: 11, cursor: "pointer", fontFamily: "'Space Mono', monospace" }}>Usuń</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailChip({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: "#A3A3A3", fontFamily: "'Space Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 12, color, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function StatPill({ label, value, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "#FFFFFF", borderRadius: 10, border: "1px solid #EDEDED" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
      <div>
        <div style={{ fontSize: 9, color: "#A3A3A3", fontFamily: "'Space Mono', monospace", letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#171717", fontFamily: "'Space Mono', monospace" }}>{value}</div>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${active ? color + "33" : "#EDEDED"}`, background: active ? color + "0C" : "#FFFFFF", color: active ? color : "#A3A3A3", fontSize: 12, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap", fontWeight: active ? 500 : 400 }}>{label}</button>
  );
}

function WeeklyStats({ weekStart }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!weekStart) return;
    setLoading(true);
    fetch(`/api/weekly/stats?week_start=${weekStart}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [weekStart]);

  if (loading || !data) return null;

  const { current, history } = data;

  const formatWeekLabel = (ws) => {
    const d = new Date(ws + "T00:00:00");
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const getBarColor = (pct) => pct >= 80 ? "#1D9E75" : pct >= 50 ? "#534AB7" : "#D3D1C7";

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload[0]) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: "#fff", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontFamily: "'Space Mono', monospace", color: "#525252" }}>
        Tydz. {formatWeekLabel(d.week_start)}: {d.points_done} / {d.points_total} pkt ({d.pct}%)
      </div>
    );
  };

  const abBadge = current.ab_total === 0
    ? <span style={{ color: "#A3A3A3", fontSize: 13 }}>—</span>
    : current.ab_success
      ? <span style={{ padding: "4px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, color: "#16A34A", fontSize: 12, fontWeight: 500 }}>✅ Tydzień udany — wszystkie A i B zamknięte</span>
      : <span style={{ padding: "4px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, color: "#D97706", fontSize: 12, fontWeight: 500 }}>⚠️ Pozostało {current.ab_total - current.ab_done} celów A/B</span>;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ background: "#FFFFFF", borderRadius: 14, border: "1px solid #E5E5E5", padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 2, color: "#A3A3A3", textTransform: "uppercase", marginBottom: 14 }}>Podsumowanie tygodnia</div>

        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontSize: 14, color: "#262626" }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>Cele: {current.tasks_done} / {current.tasks_total}</span>
          </div>
          <div style={{ fontSize: 14, color: "#262626" }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>Punkty: {current.points_done} / {current.points_total} pkt</span>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>{abBadge}</div>

        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 2, color: "#A3A3A3", textTransform: "uppercase", marginBottom: 10 }}>Ostatni kwartał</div>

        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={history} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} horizontal={true} strokeDasharray="3 3" stroke="#F3F3F3" />
            <XAxis dataKey="week_start" tick={false} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[25, 50, 75, 100]} tick={false} axisLine={false} tickLine={false} width={1} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
            <Bar dataKey="pct" radius={[3, 3, 0, 0]} maxBarSize={24}>
              {history.map((entry, i) => (
                <Cell
                  key={entry.week_start}
                  fill={getBarColor(entry.pct)}
                  stroke={i === history.length - 1 ? "#3C3489" : "none"}
                  strokeWidth={i === history.length - 1 ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "#A3A3A3", fontFamily: "'Space Mono', monospace" }}>ten tydz.</span>
        </div>
      </div>
    </div>
  );
}

const navBtnStyle = { width: 34, height: 34, borderRadius: 8, border: "1px solid #E5E5E5", background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const inputStyle = { width: "100%", padding: "12px 14px", background: "#FAFAF9", border: "1px solid #E5E5E5", borderRadius: 10, color: "#171717", fontSize: 14, outline: "none" };
const selectStyle = { padding: "8px 12px", background: "#FAFAF9", border: "1px solid #E5E5E5", borderRadius: 8, color: "#525252", fontSize: 12, outline: "none" };
const primaryBtnStyle = { padding: "9px 22px", background: "#16A34A", border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const secondaryBtnStyle = { padding: "9px 22px", background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 9, color: "#737373", fontSize: 13, cursor: "pointer" };
