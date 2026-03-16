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

function taskPoints(task: { priority: string; wig_id: string }) {
  return (PRIORITY_PTS[task.priority] ?? 0) + (task.wig_id ? 2 : 0)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get("week_start")

  if (!weekStart) {
    return NextResponse.json({ error: "Missing week_start" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Calculate oldest week (11 weeks before current)
  const currentDate = new Date(weekStart + "T00:00:00")
  const oldestDate = new Date(currentDate)
  oldestDate.setDate(oldestDate.getDate() - 77) // 11 * 7
  const oldestWeekStart = toDateStr(oldestDate)

  const { data: tasks, error } = await supabase
    .from("weekly_tasks")
    .select("*")
    .gte("week_start", oldestWeekStart)
    .lte("week_start", weekStart)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group tasks by week_start
  const grouped: Record<string, typeof tasks> = {}
  for (const t of tasks || []) {
    const ws = t.week_start
    if (!grouped[ws]) grouped[ws] = []
    grouped[ws].push(t)
  }

  // Compute stats for a given week's tasks
  function computeWeekStats(weekTasks: typeof tasks) {
    const all = weekTasks || []
    let tasksDone = 0
    let tasksTotal = all.length
    let pointsDone = 0
    let pointsTotal = 0
    let abDone = 0
    let abTotal = 0

    for (const t of all) {
      const pts = taskPoints(t)
      pointsTotal += pts
      if (t.status === "done") {
        tasksDone++
        pointsDone += pts
      }
      if (t.priority === "A" || t.priority === "B") {
        abTotal++
        if (t.status === "done") abDone++
      }
    }

    return { tasksDone, tasksTotal, pointsDone, pointsTotal, abDone, abTotal }
  }

  // Current week stats
  const currentStats = computeWeekStats(grouped[weekStart] || [])
  const current = {
    tasks_done: currentStats.tasksDone,
    tasks_total: currentStats.tasksTotal,
    points_done: currentStats.pointsDone,
    points_total: currentStats.pointsTotal,
    ab_done: currentStats.abDone,
    ab_total: currentStats.abTotal,
    ab_success: currentStats.abTotal > 0 && currentStats.abDone === currentStats.abTotal,
  }

  // Build 12-week history (fill missing weeks with zeros)
  const history: { week_start: string; points_done: number; points_total: number; pct: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(currentDate)
    d.setDate(d.getDate() - i * 7)
    const ws = toDateStr(d)
    const weekTasks = grouped[ws] || []
    const stats = computeWeekStats(weekTasks)
    const pct = stats.pointsTotal > 0 ? Math.round((stats.pointsDone / stats.pointsTotal) * 100) : 0
    history.push({ week_start: ws, points_done: stats.pointsDone, points_total: stats.pointsTotal, pct })
  }

  return NextResponse.json({ current, history })
}
