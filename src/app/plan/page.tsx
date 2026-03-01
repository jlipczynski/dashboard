"use client";

import { BackButton } from "@/components/dashboard/back-button";
import { weeklyTasks, days, priorityConfig, pillars, type Task } from "@/lib/data";
import { useLocalStorage } from "@/lib/storage";

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const p = priorityConfig[task.priority];
  const pillar = pillars.find((pl) => pl.id === task.pillar);

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
        task.done ? "opacity-50" : ""
      }`}
      style={{ backgroundColor: p.bg }}
    >
      <button
        onClick={onToggle}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-xs transition-all ${
          task.done
            ? "border-green-500 bg-green-500 text-white"
            : "border-gray-300 hover:border-gray-400"
        }`}
      >
        {task.done && "✓"}
      </button>

      <span className="text-lg">{p.label.split(" ")[0]}</span>

      <div className="flex-1">
        <p className={`text-sm font-medium ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {pillar && (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: pillar.color }}
            />
          )}
          <span className="text-xs text-muted-foreground">
            {pillar?.name}{task.project ? ` · ${task.project}` : ""}
          </span>
        </div>
      </div>

      <div className="text-right">
        <span className="text-sm font-bold" style={{ color: p.color }}>
          {task.points} pkt
        </span>
      </div>
    </div>
  );
}

export default function PlanPage() {
  const [tasks, setTasks] = useLocalStorage<Task[]>("dashboard_tasks", weeklyTasks);
  const [selectedDay, setSelectedDay] = useLocalStorage("dashboard_plan_day", "wszystkie");

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const filteredTasks =
    selectedDay === "wszystkie"
      ? tasks
      : tasks.filter((t) => t.day === selectedDay);

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const order = { frog: 0, important: 1, nice: 2 };
    return order[a.priority] - order[b.priority];
  });

  const totalPoints = tasks.reduce((s, t) => s + t.points, 0);
  const earnedPoints = tasks.filter((t) => t.done).reduce((s, t) => s + t.points, 0);
  const frogsEaten = tasks.filter((t) => t.priority === "frog" && t.done).length;
  const totalFrogs = tasks.filter((t) => t.priority === "frog").length;
  const completedCount = tasks.filter((t) => t.done).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <BackButton />

        <div className="mt-4 flex items-center gap-3">
          <span className="text-3xl">🐸</span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Plan Tygodnia</h1>
            <p className="text-muted-foreground">Framework &ldquo;Zjedz te zabe&rdquo; — najtrudniejsze najpierw</p>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-primary">{earnedPoints}/{totalPoints}</p>
            <p className="text-xs text-muted-foreground">Punkty</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-red-500">🐸 {frogsEaten}/{totalFrogs}</p>
            <p className="text-xs text-muted-foreground">Zaby zjedzone</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-green-500">{completedCount}/{tasks.length}</p>
            <p className="text-xs text-muted-foreground">Ukonczone</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-foreground">
              {totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0}%
            </p>
            <p className="text-xs text-muted-foreground">Realizacja</p>
          </div>
        </div>

        {/* Day filter */}
        <div className="mt-6 flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedDay("wszystkie")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedDay === "wszystkie"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Wszystkie
          </button>
          {days.map((day) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                selectedDay === day
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {day}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="mt-4 space-y-2">
          {sortedTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-muted-foreground">Brak zadan na ten dzien</p>
            </div>
          ) : (
            sortedTasks.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} />
            ))
          )}
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>🐸 Zaba = najtrudniejsze, zrob NAJPIERW</span>
          <span>⚡ Wazne = priorytet B</span>
          <span>✨ Mile = priorytet C</span>
        </div>
      </div>
    </div>
  );
}
