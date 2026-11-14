#!/usr/bin/env node
// JEDYNA sciezka migracji: supabase/migrations/*.sql, uruchamiane RECZNIE po OK Jana:
//   node --env-file=.env.local scripts/migrate.mjs
// (nie jest czescia builda; /api/migrate jest wylaczony — 410 Gone)

const dbUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.log("⚠️  No DATABASE_URL set — nothing to do");
  console.log("   Uruchom: node --env-file=.env.local scripts/migrate.mjs");
  process.exit(0);
}

async function migrate() {
  const pg = await import("pg");
  const { readFileSync, readdirSync } = await import("fs");
  const { join, dirname } = await import("path");
  const { fileURLToPath } = await import("url");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const rootDir = join(__dirname, "..");

  const client = new pg.default.Client({
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
  console.warn("⚠️  Migration failed:", err.message);
  process.exitCode = 1;
});
