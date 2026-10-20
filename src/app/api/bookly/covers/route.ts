import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { lookupCover } from "@/lib/covers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/bookly/covers { titles: string[] }
 * Returns { covers: { [title]: url | null } }. Looks up missing titles
 * (Google Books, then Open Library) and caches the result in book_covers.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const titles: string[] = Array.isArray(body.titles)
    ? [...new Set<string>(body.titles.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim()))].slice(0, 100)
    : [];
  if (titles.length === 0) return NextResponse.json({ covers: {} });

  const covers: Record<string, string | null> = {};
  if (supabase) {
    const { data } = await supabase.from("book_covers").select("title, cover_url").in("title", titles);
    for (const row of (data ?? []) as { title: string; cover_url: string | null }[]) covers[row.title] = row.cover_url;
  }

  // Look up missing titles a few at a time (free APIs rate-limit bursts)
  const missing = titles.filter((t) => !(t in covers));
  const found: { title: string; url: string | null; definitive: boolean }[] = [];
  for (let i = 0; i < missing.length; i += 4) {
    const batch = await Promise.all(missing.slice(i, i + 4).map(async (t) => ({ title: t, ...(await lookupCover(t)) })));
    found.push(...batch);
  }
  for (const f of found) covers[f.title] = f.url;

  // Cache found covers and real "not found" results — never a failed lookup
  const toCache = found.filter((f) => f.url || f.definitive).map((f) => ({ title: f.title, cover_url: f.url }));
  if (supabase && toCache.length > 0) {
    await supabase.from("book_covers").upsert(toCache);
  }

  return NextResponse.json({ covers });
}
