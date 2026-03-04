"use client";

import Link from "next/link";
import { type Pillar } from "@/lib/data";

function TrendBadge({ trend }: { trend: Pillar["trend"] }) {
  const config = {
    rising: { label: "W górę", bg: "bg-green-100", text: "text-green-700", icon: "↑" },
    steady: { label: "Stabilnie", bg: "bg-amber-100", text: "text-amber-700", icon: "→" },
    "needs-focus": { label: "Wymaga uwagi", bg: "bg-red-100", text: "text-red-700", icon: "↓" },
  };
  const c = config[trend];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
      {c.icon} {c.label}
    </span>
  );
}

function ProgressRing({ score, color, size = 100 }: { score: number; color: string; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  );
}

export function PillarCard({ pillar }: { pillar: Pillar }) {
  const subs = pillar.subcategories ?? [];
  return (
    <Link href={pillar.href}>
      <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer sm:p-6">
        {/* Background decoration */}
        <div
          className="absolute -right-6 -top-6 text-6xl opacity-10 transition-transform duration-500 group-hover:scale-110 sm:text-8xl"
          aria-hidden
        >
          {pillar.icon}
        </div>

        <div className="relative flex items-center justify-between gap-3 sm:items-start sm:gap-4">
          <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl">{pillar.icon}</span>
              <h3 className="text-base font-semibold text-foreground truncate sm:text-lg">{pillar.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              <TrendBadge trend={pillar.trend} />
              <span className="text-xs text-muted-foreground hidden sm:inline">Szczegoly ›</span>
            </div>
          </div>

          <div className="relative flex shrink-0 items-center justify-center">
            <ProgressRing score={pillar.score} color={pillar.color} size={80} />
            <span
              className="absolute text-lg font-bold sm:text-xl"
              style={{ color: pillar.color }}
            >
              {pillar.score}%
            </span>
          </div>
        </div>

        {/* Subcategory breakdowns */}
        {subs.length > 0 && (
          <div className="relative mt-3 space-y-1.5">
            {subs.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-4 text-center text-sm" title={s.status}>{s.emoji}</span>
                <span className="w-16 truncate text-muted-foreground">{s.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(s.pct, 100)}%`,
                      backgroundColor: s.status === "on-track" ? "#22c55e" : s.status === "warning" ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <span className="w-14 text-right text-muted-foreground tabular-nums">
                  {s.pct}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Bottom gradient line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1"
          style={{
            background: `linear-gradient(90deg, ${pillar.colorFrom}, ${pillar.colorTo})`,
          }}
        />
      </div>
    </Link>
  );
}
