import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

const PRIORITY_PTS: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 }

export async function POST(req: Request) {
  const { task_id } = (await req.json()) as { task_id: string }

  if (!task_id) {
    return NextResponse.json({ error: "Missing task_id" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: task, error: fetchErr } = await supabase
    .from("weekly_tasks")
    .select("*")
    .eq("id", task_id)
    .single()

  if (fetchErr || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  const weekDate = new Date(task.week_start + "T00:00:00")
  weekDate.setDate(weekDate.getDate() + 7)
  const nextWeekStart = toDateStr(weekDate)

  // Check for duplicate
  const { data: existing } = await supabase
    .from("weekly_tasks")
    .select("id")
    .eq("task", task.task)
    .eq("week_start", nextWeekStart)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ status: "already_exists" })
  }

  const pts = (PRIORITY_PTS[task.priority] ?? 0) + (task.wig_id ? 2 : 0)

  const { data: newTask, error: insertErr } = await supabase
    .from("weekly_tasks")
    .insert({
      task: task.task,
      project: task.project,
      priority: task.priority,
      sub_priority: task.sub_priority,
      wig_id: task.wig_id,
      deadline: task.deadline,
      person: task.person,
      notes: task.notes,
      status: "todo",
      week_start: nextWeekStart,
      points: pts,
    })
    .select("id")
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ status: "ok", new_task_id: newTask.id })
}
