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
  const { items, audioFileName, audioFileId, transcript } = (await req.json()) as {
    items: BacklogItem[]
    audioFileName: string
    audioFileId?: string
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
    audio_file_id: audioFileId || null,
    source_transcript: transcript,
  }))

  const { data, error } = await supabase
    .from("backlog_items")
    .insert(rows)
    .select("id")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Mark audio file as processed
  if (audioFileId) {
    await supabase.from("backlog_audio_processed").upsert({
      file_id: audioFileId,
      filename: audioFileName,
      items_count: data.length,
    })
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

  if (status === "active") {
    query = query.in("status", ["backlog", "this_week"])
  } else if (status !== "all") {
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

  // When moving to this_week, create a weekly_tasks record
  if (updates.status === "this_week") {
    const { data: item } = await supabase
      .from("backlog_items")
      .select("*")
      .eq("id", id)
      .single()

    if (item) {
      const today = new Date()
      const day = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
      const weekStart = monday.toISOString().split("T")[0]

      const projectMap: Record<string, string> = {
        ovoc: "Ovoc Malinovi",
        plantacja: "Plantacja",
        inne: "Inne",
      }
      const pillarToProject: Record<number, string> = {
        1: "Zdrowie",
        2: "Rozwój",
        3: "Relacje",
        4: item.project ? (projectMap[item.project] || "Inne") : "Inne",
        5: "Duchowość",
      }

      const weeklyRow = {
        task: item.title,
        project: item.pillar ? pillarToProject[item.pillar] : "Inne",
        priority: item.priority || "C",
        sub_priority: 1,
        wig_id: item.is_wig ? "wig" : "",
        deadline: item.due_date || null,
        status: "todo",
        week_start: weekStart,
        notes: item.description || "",
        backlog_item_id: item.id,
      }
      console.log("[backlog→weekly] inserting weekly_task:", JSON.stringify(weeklyRow))
      const { error: weeklyError } = await supabase.from("weekly_tasks").insert(weeklyRow)
      if (weeklyError) {
        console.error("[backlog→weekly] insert error:", weeklyError.message)
      }
    }
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
