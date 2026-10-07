import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

// Uruchamiany codziennie przez Vercel Cron (patrz vercel.json).
// Jedno lekkie zapytanie wystarcza, zeby Supabase nie zapauzowal projektu
// po ~7 dniach bezczynnosci.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const supabase = getSupabaseAdmin()

  const { count, error } = await supabase
    .from("weekly_tasks")
    .select("*", { count: "exact", head: true })

  if (error) {
    console.error("Keepalive error:", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const result = { ok: true, pinged_at: new Date().toISOString(), weekly_tasks: count ?? 0 }
  console.log("Keepalive OK:", JSON.stringify(result))
  return NextResponse.json(result)
}
