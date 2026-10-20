"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Collapsible section; open/closed state remembered per browser. */
export function Collapsible({
  id,
  title,
  summary,
  actions,
  children,
}: {
  id: string;
  title: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const key = `zdrowie_open_${id}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(key) === "1");
    } catch {
      // ignore
    }
  }, [key]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={toggle} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <span className={`text-xs text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
          <span className="font-semibold text-foreground">{title}</span>
          {summary && <span className="truncate text-xs text-muted-foreground">{summary}</span>}
        </button>
        {actions}
      </div>
      {open && <div className="border-t border-border px-4 pb-4">{children}</div>}
    </div>
  );
}
