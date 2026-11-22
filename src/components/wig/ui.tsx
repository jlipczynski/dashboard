"use client";
// Small shared UI pieces for WIG screens (existing design: white cards, emerald primary, DM Sans / Space Mono via globals).
import type { ReactNode } from "react";

export const INPUT = "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-emerald-600";
export const TEXTAREA = "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-emerald-600";
export const LABEL = "block text-xs font-medium text-muted-foreground";
export const BTN = "inline-flex h-10 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors disabled:opacity-50";
export const BTN_PRIMARY = `${BTN} bg-emerald-700 text-white hover:bg-emerald-800`;
export const BTN_SECONDARY = `${BTN} border border-border bg-card text-foreground hover:border-stone-400`;
export const BTN_GHOST = `${BTN} text-muted-foreground hover:text-foreground`;
export const CHIP = "inline-flex h-8 shrink-0 items-center rounded-full border border-dashed border-stone-300 bg-card px-3 text-xs text-foreground hover:border-emerald-600";

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string; "data-testid"?: string }) {
  return <div className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`} {...rest}>{children}</div>;
}

export function ErrorBanner({ error, onClose }: { error: string | null; onClose: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="sticky top-14 z-10 mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="min-w-0 flex-1 break-words">{error}</span>
      <button type="button" onClick={onClose} className="shrink-0 font-semibold" aria-label="Zamknij komunikat">✕</button>
    </div>
  );
}

export function StatusPill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "green" | "amber" | "blue" }) {
  const c = { muted: "bg-muted text-muted-foreground", green: "bg-emerald-50 text-emerald-800", amber: "bg-amber-50 text-amber-800", blue: "bg-sky-50 text-sky-800" }[tone];
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${c}`}>{children}</span>;
}

export function weekStatusLabel(row: { planStatus: string; closeStatus: string | null } | null): { text: string; tone: "muted" | "green" | "amber" | "blue" } {
  if (!row) return { text: "brak planu", tone: "muted" };
  if (row.closeStatus === "skorygowana") return { text: "skorygowana", tone: "blue" };
  if (row.closeStatus === "zamknieta") return { text: "zamknięta", tone: "green" };
  if (row.planStatus === "zatwierdzony") return { text: "plan zatwierdzony", tone: "green" };
  return { text: "robocza", tone: "amber" };
}

export const fmtNum = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Math.round(v * 100) / 100).replace(".", ","));
