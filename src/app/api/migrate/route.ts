import { NextResponse } from "next/server";
import { Client } from "pg";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

async function runMigrations(): Promise<{ ran: string[]; skipped: string[]; errors: string[] }> {
  const dbUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_POOLER_URL or DATABASE_URL not configured");
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  // Create migrations tracking table
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Get already applied migrations
  const { rows: applied } = await client.query("SELECT name FROM _migrations ORDER BY name");
  const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

  // Read migration files
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    await client.end();
    throw new Error("No migrations directory found at supabase/migrations/");
  }

  const ran: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    try {
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      ran.push(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If it's a "already exists" error, mark as applied and continue
      if (msg.includes("already exists")) {
        await client.query("INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
        skipped.push(file);
      } else {
        errors.push(`${file}: ${msg}`);
      }
    }
  }

  await client.end();
  return { ran, skipped, errors };
}

export async function POST() {
  try {
    const result = await runMigrations();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET also runs migrations (convenience)
export async function GET() {
  try {
    const result = await runMigrations();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
