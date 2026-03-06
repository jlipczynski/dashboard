import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { BacklogItem } from "@/types/backlog"

export const dynamic = "force-dynamic"

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

export async function POST(req: Request) {
  const { items, audioFileName, transcript } = (await req.json()) as {
    items: BacklogItem[]
    audioFileName: string
    transcript: string
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Brak wpisow do zapisania" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const rows = items.map((item) => ({
    title: item.title,
    description: item.description || null,
    type: item.type,
    pillar: item.pillar || null,
    project: item.project || null,
    priority: item.priority,
    is_wig: item.is_wig,
    due_date: item.due_date || null,
    status: item.status || "backlog",
    audio_filename: audioFileName,
    source_transcript: transcript,
  }))

  const { data, error } = await supabase
    .from("backlog_items")
    .insert(rows)
    .select("id")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    saved: data.length,
    ids: data.map((d) => d.id),
  })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || "backlog"

  const supabase = getSupabaseAdmin()

  let query = supabase
    .from("backlog_items")
    .select("*")
    .order("created_at", { ascending: false })

  if (status !== "all") {
    query = query.eq("status", status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data })
}

export async function PATCH(req: Request) {
  const { id, ...updates } = await req.json()

  if (!id) {
    return NextResponse.json({ error: "Brak id" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from("backlog_items")
    .update(updates)
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { id } = await req.json()

  if (!id) {
    return NextResponse.json({ error: "Brak id" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from("backlog_items")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
