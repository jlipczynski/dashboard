import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

const PRIORITY_PTS: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 }

export async function PATCH(req: Request) {
  const body = await req.json()
  const { id, task, project, priority } = body as {
    id: string
    task?: string
    project?: string
    priority?: string
  }

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Build update object with only provided fields
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (task !== undefined) update.task = task
  if (project !== undefined) update.project = project
  if (priority !== undefined) update.priority = priority

  // If priority changes, recalculate points (need to check wig_id from DB)
  if (priority !== undefined) {
    const { data: existing } = await supabase
      .from("weekly_tasks")
      .select("wig_id")
      .eq("id", id)
      .single()

    const wigBonus = existing?.wig_id ? 2 : 0
    update.points = (PRIORITY_PTS[priority] ?? 0) + wigBonus
  }

  const { data, error } = await supabase
    .from("weekly_tasks")
    .update(update)
    .eq("id", id)
    .select("id, task, project, priority, points")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: "ok", updated: data })
}
