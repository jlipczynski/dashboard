import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

// GET - fetch all processed file IDs
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("backlog_audio_processed")
    .select("file_id, filename, processed_at, items_count")

  if (error) {
    // Table may not exist yet — return empty list instead of 500
    console.error("[audio-processed] GET error:", error.message)
    return NextResponse.json({ processed: [] })
  }

  return NextResponse.json({ processed: data || [] })
}

// POST - mark a file as processed
export async function POST(req: Request) {
  const { file_id, filename, items_count } = await req.json()

  if (!file_id || !filename) {
    return NextResponse.json({ error: "Brak file_id lub filename" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from("backlog_audio_processed")
    .upsert({ file_id, filename, items_count: items_count || 0 })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
