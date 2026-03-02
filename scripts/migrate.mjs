#!/usr/bin/env node
// Runs SQL migrations from supabase/migrations/ against DATABASE_URL
// Used as part of the build process on Vercel

import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

async function migrate() {
  const dbUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("⚠️  DATABASE_POOLER_URL / DATABASE_URL not set, skipping migrations");
    return;
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("🔗 Connected to database");

  // Create migrations tracking table
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Get already applied migrations
  const { rows: applied } = await client.query("SELECT name FROM _migrations ORDER BY name");
  const appliedSet = new Set(applied.map((r) => r.name));

  // Read migration files
  const migrationsDir = join(rootDir, "supabase", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ranCount = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`⏭️  ${file} (already applied)`);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    try {
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      console.log(`✅ ${file}`);
      ranCount++;
    } catch (err) {
      if (err.message?.includes("already exists")) {
        await client.query("INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
        console.log(`⏭️  ${file} (already exists)`);
      } else {
        console.warn(`⚠️  ${file}: ${err.message} (skipping)`);
      }
    }
  }

  await client.end();
  console.log(`\n🎉 Migrations complete: ${ranCount} new, ${files.length - ranCount} skipped`);
}

migrate().catch((err) => {
  console.warn("⚠️  Migration failed (build continues):", err.message);
  // Don't exit with error — build should continue even if DB is unreachable
});
