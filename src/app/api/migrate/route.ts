import { NextResponse } from "next/server"
import { MIGRATIONS } from "@/lib/migrations"

export const dynamic = "force-dynamic"

type MigrationResult = {
  ran: string[]
  skipped: string[]
  errors: string[]
  method: "pg" | "management-api"
}

// Extract project ref from NEXT_PUBLIC_SUPABASE_URL
function getProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/)
  return match?.[1] || null
}

// Method 1: Direct pg connection
async function runViaPg(): Promise<MigrationResult> {
  const dbUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL
  if (!dbUrl) throw new Error("No DATABASE_URL configured")

  const pg = await import("pg")
  const client = new pg.default.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  const ran: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now()
      );
    `)

    const { rows: applied } = await client.query("SELECT name FROM _migrations")
    const appliedSet = new Set(applied.map((r: { name: string }) => r.name))

    for (const migration of MIGRATIONS) {
      if (appliedSet.has(migration.name)) {
        skipped.push(migration.name)
        continue
      }

      try {
        await client.query(migration.sql)
        await client.query(
          "INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING",
          [migration.name]
        )
        ran.push(migration.name)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        if (msg.includes("already exists")) {
          await client.query(
            "INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING",
            [migration.name]
          )
          skipped.push(migration.name)
        } else {
          errors.push(`${migration.name}: ${msg}`)
        }
      }
    }
  } finally {
    await client.end()
  }

  return { ran, skipped, errors, method: "pg" }
}

// Method 2: Supabase Management API (no pg needed)
async function runViaManagementApi(): Promise<MigrationResult> {
  const ref = getProjectRef()
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!ref) throw new Error("Cannot extract project ref from NEXT_PUBLIC_SUPABASE_URL")
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN not set — generate at supabase.com/dashboard/account/tokens")

  const ran: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  async function execSQL(sql: string): Promise<unknown[]> {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    )
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`API ${res.status}: ${text}`)
    }
    return await res.json()
  }

  // Ensure tracking table
  await execSQL(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  `)

  // Check applied
  const checkData = await execSQL("SELECT name FROM _migrations")
  const appliedSet = new Set(
    Array.isArray(checkData)
      ? (checkData as { name: string }[]).map((r) => r.name)
      : []
  )

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.name)) {
      skipped.push(migration.name)
      continue
    }

    try {
      await execSQL(migration.sql)
      await execSQL(
        `INSERT INTO _migrations (name) VALUES ('${migration.name}') ON CONFLICT DO NOTHING`
      )
      ran.push(migration.name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      if (msg.includes("already exists")) {
        await execSQL(
          `INSERT INTO _migrations (name) VALUES ('${migration.name}') ON CONFLICT DO NOTHING`
        ).catch(() => null)
        skipped.push(migration.name)
      } else {
        errors.push(`${migration.name}: ${msg}`)
      }
    }
  }

  return { ran, skipped, errors, method: "management-api" }
}

async function runMigrations(): Promise<MigrationResult> {
  // Try pg first
  const hasPgUrl = !!(process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL)
  if (hasPgUrl) {
    try {
      return await runViaPg()
    } catch (pgErr) {
      const pgMsg = pgErr instanceof Error ? pgErr.message : String(pgErr)
      console.warn(`pg migration failed: ${pgMsg}, trying Management API...`)
    }
  }

  // Fallback: Supabase Management API
  return await runViaManagementApi()
}

export async function GET() {
  try {
    const result = await runMigrations()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST() {
  try {
    const result = await runMigrations()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
