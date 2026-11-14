import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

// Warstwa danych dla WeeklyPlanner (lista / dodawanie / odhaczanie / usuwanie).
// Server-only: service role key. Dostep chroni middleware (sesja + ALLOWED_EMAILS).
// Logika (punkty, sub_priority) zostaje w komponencie — ten route tylko zapisuje/czyta 1:1.

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = ["todo", "done"]

// Lista zadan tygodnia — ta sama kolejnosc co wczesniej w komponencie.
export async function GET(req: Request) {
  const weekStart = new URL(req.url).searchParams.get("week_start")
  if (!weekStart || !DATE_RE.test(weekStart)) {
    return NextResponse.json({ error: "Missing or invalid week_start" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("weekly_tasks")
    .select("*")
    .eq("week_start", weekStart)
    .order("priority", { ascending: true })
    .order("sub_priority", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("weekly/tasks GET error:", error)
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }
  return NextResponse.json({ tasks: data ?? [] })
}

// Nowe zadanie — dokladnie te pola, ktore wczesniej wstawial komponent.
export async function POST(req: Request) {
  const body = (await req.json()) as {
    task?: string
    project?: string
    priority?: string
    sub_priority?: number
    week_start?: string
    status?: string
    points?: number
  }

  if (!body.task || !body.project || !body.priority || !body.week_start || !DATE_RE.test(body.week_start)) {
    return NextResponse.json({ error: "Missing task, project, priority or week_start" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("weekly_tasks")
    .insert({
      task: body.task,
      project: body.project,
      priority: body.priority,
      sub_priority: body.sub_priority,
      week_start: body.week_start,
      status: body.status ?? "todo",
      points: body.points,
    })
    .select()
    .single()

  if (error) {
    console.error("weekly/tasks POST error:", error)
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }
  return NextResponse.json({ task: data })
}

// Odhaczenie / odznaczenie zadania.
export async function PATCH(req: Request) {
  const { id, status } = (await req.json()) as { id?: string; status?: string }
  if (!id || !status || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Missing id or invalid status" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from("weekly_tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) {
    console.error("weekly/tasks PATCH error:", error)
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }
  return NextResponse.json({ status: "ok" })
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("weekly_tasks").delete().eq("id", id)

  if (error) {
    console.error("weekly/tasks DELETE error:", error)
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }
  return NextResponse.json({ status: "ok" })
}
