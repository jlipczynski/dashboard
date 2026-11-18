// Shared UI for every Finanse screen (brief Finanse 13). One look for headers, pills, buttons, tiles, badges and
// sections, so the module stops looking like several versions glued together. Light theme, DM Sans + Space Mono.
// Fixed heights live in the base classes, so active / inactive / disabled states never change the size.

import Link from "next/link";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ── Page header ───────────────────────────────────────────────────────────── */
export function FinPageHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Pill (navigation, period chips) ───────────────────────────────────────── */
export const PILL_BASE = "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm transition-colors";
export const PILL_ON = "border-emerald-700 bg-emerald-700 font-semibold text-white";
export const PILL_OFF = "border-border bg-card text-muted-foreground hover:text-foreground";
export const pillClass = (active: boolean) => cx(PILL_BASE, active ? PILL_ON : PILL_OFF);

type PillProps = { active?: boolean; children: ReactNode; href?: string; onClick?: () => void; className?: string; title?: string };
export function FinPill({ active = false, children, href, onClick, className, title }: PillProps) {
  const cls = cx(pillClass(active), className);
  if (href && !onClick) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} className={cls} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={active} aria-current={active ? "page" : undefined} className={cls} title={title}>
      {children}
    </button>
  );
}

/* ── Button ────────────────────────────────────────────────────────────────── */
export type FinButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type FinButtonSize = "sm" | "md" | "lg";
const BTN_BASE = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SIZE: Record<FinButtonSize, string> = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-sm" };
const BTN_VARIANT: Record<FinButtonVariant, string> = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800",
  secondary: "border border-border bg-card text-foreground hover:border-stone-300",
  ghost: "text-emerald-700 hover:bg-emerald-50",
  danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
};
export const buttonClass = (variant: FinButtonVariant = "primary", size: FinButtonSize = "md", full = false) =>
  cx(BTN_BASE, BTN_SIZE[size], BTN_VARIANT[variant], full && "w-full");

type FinButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: FinButtonVariant; size?: FinButtonSize; full?: boolean };
export function FinButton({ variant = "primary", size = "md", full = false, className, type = "button", ...rest }: FinButtonProps) {
  return <button type={type} className={cx(buttonClass(variant, size, full), className)} {...rest} />;
}

/** A link that looks like a FinButton. */
export function FinButtonLink({ href, variant = "primary", size = "md", full = false, className, children }: { href: string; variant?: FinButtonVariant; size?: FinButtonSize; full?: boolean; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(buttonClass(variant, size, full), className)}>
      {children}
    </Link>
  );
}

/* ── KPI tile ──────────────────────────────────────────────────────────────── */
export const STAT_TILE = "flex h-full min-h-[112px] flex-col gap-1 rounded-2xl border border-border bg-card p-4 sm:p-5";
export function FinStatTile({ label, value, note, valueClass = "text-foreground", href, cta }: { label: string; value: string; note?: ReactNode; valueClass?: string; href?: string; cta?: string }) {
  const body = (
    <>
      <p className="truncate text-sm font-medium text-muted-foreground" title={label}>
        {label}
      </p>
      <p className={cx("truncate font-mono text-2xl font-bold tabular-nums", valueClass)}>{value}</p>
      {note && <p className="line-clamp-2 text-xs text-muted-foreground">{note}</p>}
      {cta && <p className="mt-auto pt-1 text-xs font-semibold text-emerald-700">{cta}</p>}
    </>
  );
  return href ? (
    <Link href={href} className={cx(STAT_TILE, "transition-colors hover:border-emerald-600")}>
      {body}
    </Link>
  ) : (
    <div className={STAT_TILE}>{body}</div>
  );
}

/* ── Category tile ─────────────────────────────────────────────────────────── */
export const CATEGORY_TILE = "flex h-[124px] w-full flex-col gap-1.5 rounded-2xl border p-4 text-left transition-colors";
export function FinCategoryTile({
  name,
  icon,
  share,
  amount,
  barPct,
  color,
  active,
  onClick,
}: {
  name: string;
  icon: ReactNode;
  share: string;
  amount: string;
  barPct: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      title={name}
      className={cx(CATEGORY_TILE, active ? "border-emerald-600 bg-emerald-50/40" : "border-border bg-card hover:border-stone-300")}
    >
      <span className="flex items-start gap-3">
        <span className="shrink-0">{icon}</span>
        <span className="line-clamp-2 min-w-0 flex-1 font-semibold leading-tight text-foreground">{name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{share}</span>
      </span>
      <span className="truncate font-mono text-xl font-bold tabular-nums text-foreground">{amount}</span>
      <span className="mt-auto h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, barPct))}%`, backgroundColor: color }} />
      </span>
    </button>
  );
}

/* ── Badge ─────────────────────────────────────────────────────────────────── */
export const BADGE = "inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold";
export function FinBadge({ children, className, style, title }: { children: ReactNode; className?: string; style?: CSSProperties; title?: string }) {
  return (
    <span className={cx(BADGE, className ?? "bg-muted text-muted-foreground")} style={style} title={title}>
      {children}
    </span>
  );
}

/* ── Section card ──────────────────────────────────────────────────────────── */
export function FinCard({ title, actions, children, className, ariaLabel }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <section aria-label={ariaLabel} className={cx("rounded-3xl border border-border bg-card p-5 sm:p-6", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="text-lg font-bold text-foreground">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
