import { NextResponse } from "next/server";
import { loadCoachState } from "@/lib/finanse-coach-server";

export const dynamic = "force-dynamic";

// GET /api/finanse/coach/status — month vs the WIG limit, big expenses to discuss,
// planned purchases, this week's review and the last commitment.
export async function GET() {
  try {
    return NextResponse.json(await loadCoachState(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
