import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

async function runMigrations(): Promise<{
  ran: string[];
  skipped: string[];
  errors: string[];
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Try service role key first, fall back to anon key
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE key required");
  }

  const supabase = createClient(url, key);

  // Read migration files
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    throw new Error("No migrations directory found at supabase/migrations/");
  }

  const ran: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    const { data, error } = await supabase.rpc("run_migration", {
      p_name: file,
      p_sql: sql,
    });

    if (error) {
      errors.push(`${file}: ${error.message}`);
    } else if (data === "skipped") {
      skipped.push(file);
    } else {
      ran.push(file);
    }
  }

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
