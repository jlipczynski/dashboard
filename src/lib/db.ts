import pg from "pg";

const dbUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;

function getClientConfig(): pg.ClientConfig {
  if (!dbUrl) throw new Error("No DATABASE_URL configured");

  // Let pg handle URL parsing — avoids double-decoding issues with special chars in password
  return {
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  };
}

export async function runSQL(sql: string): Promise<void> {
  const client = new pg.Client(getClientConfig());

  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function querySQL<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const client = new pg.Client(getClientConfig());

  await client.connect();
  try {
    const { rows } = await client.query(sql, params);
    return rows as T[];
  } finally {
    await client.end();
  }
}

export async function runMigrationSQL(name: string, sql: string): Promise<"ran" | "skipped"> {
  const client = new pg.Client(getClientConfig());

  await client.connect();
  try {
    // Ensure tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Check if already applied
    const { rows } = await client.query("SELECT name FROM _migrations WHERE name = $1", [name]);
    if (rows.length > 0) return "skipped";

    // Run migration
    await client.query(sql);
    await client.query(
      "INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING",
      [name]
    );
    return "ran";
  } finally {
    await client.end();
  }
}

export function hasDbUrl(): boolean {
  return !!dbUrl;
}
