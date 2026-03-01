"use client";

import Link from "next/link";

export function BackButton() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      ← Powrót do panelu
    </Link>
  );
}
