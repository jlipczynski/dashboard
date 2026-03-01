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
  return (
    <Link href={pillar.href}>
      <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer">
        {/* Background decoration */}
        <div
          className="absolute -right-6 -top-6 text-8xl opacity-10 transition-transform duration-500 group-hover:scale-110"
          aria-hidden
        >
          {pillar.icon}
        </div>

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{pillar.icon}</span>
              <h3 className="text-lg font-semibold text-foreground">{pillar.name}</h3>
            </div>
            <TrendBadge trend={pillar.trend} />
            <p className="text-sm text-muted-foreground">
              Szczegóły ›
            </p>
          </div>

          <div className="relative flex items-center justify-center">
            <ProgressRing score={pillar.score} color={pillar.color} />
            <span
              className="absolute text-xl font-bold"
              style={{ color: pillar.color }}
            >
              {pillar.score}%
            </span>
          </div>
        </div>

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
