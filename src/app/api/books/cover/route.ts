import { NextResponse } from "next/server";
import { findCover } from "@/lib/covers";

// GET /api/books/cover?q=TITLE — search Google Books for a cover image
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });
  }

  return NextResponse.json({ cover_url: await findCover(q) });
}
