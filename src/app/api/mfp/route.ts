import { NextResponse } from "next/server";
import pg from "pg";

export const dynamic = "force-dynamic";

const dbUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;

async function getClient(): Promise<pg.Client> {
  if (!dbUrl) throw new Error("No DATABASE_URL configured");
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

async function ensureTable(client: pg.Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS nutrition_log (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      date DATE NOT NULL UNIQUE,
      calories INT NOT NULL DEFAULT 0,
      fat_g NUMERIC(6,1) DEFAULT 0,
      saturated_fat_g NUMERIC(6,1) DEFAULT 0,
      cholesterol_mg NUMERIC(6,1) DEFAULT 0,
      sodium_mg NUMERIC(6,1) DEFAULT 0,
      carbs_g NUMERIC(6,1) DEFAULT 0,
      fiber_g NUMERIC(6,1) DEFAULT 0,
      sugar_g NUMERIC(6,1) DEFAULT 0,
      protein_g NUMERIC(6,1) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // RLS + policy (idempotent)
  await client.query(`ALTER TABLE nutrition_log ENABLE ROW LEVEL SECURITY`).catch(() => {});
  await client.query(`
    DO $$ BEGIN
      CREATE POLICY "Allow all on nutrition_log" ON nutrition_log
        FOR ALL USING (true) WITH CHECK (true);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => {});
}

type NutritionRow = {
  date: string;
  calories: number;
  fat_g: number;
  saturated_fat_g: number;
  cholesterol_mg: number;
  sodium_mg: number;
  carbs_g: number;
  fiber_g: number;
  sugar_g: number;
  protein_g: number;
};

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

function parseDate(dateStr: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function parseMfpCsv(csv: string): NutritionRow[] {
  // Strip BOM if present
  if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse headers to find column indices dynamically
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());

  // Build column index map — match partial names for flexibility
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const dateIdx = col("date");
  const calIdx = col("calorie");
  const fatIdx = headers.findIndex(
    (h) => h === "fat" || h === "fat (g)" || h.includes("total fat")
  );
  const satFatIdx = headers.findIndex(
    (h) => h.includes("saturated") && !h.includes("poly") && !h.includes("mono")
  );
  const cholIdx = col("cholesterol");
  const sodiumIdx = col("sodium");
  const carbIdx = col("carbohydrate") !== -1 ? col("carbohydrate") : col("carbs");
  const fiberIdx = col("fiber");
  const sugarIdx = col("sugar");
  const proteinIdx = col("protein");

  if (dateIdx === -1 || calIdx === -1) return [];

  // MFP exports one row per meal (Breakfast, Lunch, Dinner, Snacks)
  // Aggregate all meals into daily totals
  const dailyMap = new Map<string, NutritionRow>();

  const num = (cols: string[], idx: number) => {
    if (idx === -1) return 0;
    const v = cols[idx]?.replace(/,/g, "");
    const n = parseFloat(v || "0");
    return isNaN(n) ? 0 : n;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCsvLine(line);
    if (cols.length < 2) continue;

    const date = parseDate(cols[dateIdx]);
    if (!date) continue;

    const calories = Math.round(num(cols, calIdx));
    // Skip rows with 0 calories (e.g. "Totals" rows or empty meals)
    if (calories === 0 && num(cols, proteinIdx) === 0 && num(cols, fatIdx) === 0) continue;

    const existing = dailyMap.get(date);
    if (existing) {
      existing.calories += calories;
      existing.fat_g += num(cols, fatIdx);
      existing.saturated_fat_g += num(cols, satFatIdx);
      existing.cholesterol_mg += num(cols, cholIdx);
      existing.sodium_mg += num(cols, sodiumIdx);
      existing.carbs_g += num(cols, carbIdx);
      existing.fiber_g += num(cols, fiberIdx);
      existing.sugar_g += num(cols, sugarIdx);
      existing.protein_g += num(cols, proteinIdx);
    } else {
      dailyMap.set(date, {
        date,
        calories,
        fat_g: num(cols, fatIdx),
        saturated_fat_g: num(cols, satFatIdx),
        cholesterol_mg: num(cols, cholIdx),
        sodium_mg: num(cols, sodiumIdx),
        carbs_g: num(cols, carbIdx),
        fiber_g: num(cols, fiberIdx),
        sugar_g: num(cols, sugarIdx),
        protein_g: num(cols, proteinIdx),
      });
    }
  }

  // Round aggregated values to 1 decimal
  const rows = Array.from(dailyMap.values()).map((r) => ({
    ...r,
    fat_g: Math.round(r.fat_g * 10) / 10,
    saturated_fat_g: Math.round(r.saturated_fat_g * 10) / 10,
    cholesterol_mg: Math.round(r.cholesterol_mg * 10) / 10,
    sodium_mg: Math.round(r.sodium_mg * 10) / 10,
    carbs_g: Math.round(r.carbs_g * 10) / 10,
    fiber_g: Math.round(r.fiber_g * 10) / 10,
    sugar_g: Math.round(r.sugar_g * 10) / 10,
    protein_g: Math.round(r.protein_g * 10) / 10,
  }));

  // Sort by date descending
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

// POST: import CSV
export async function POST(req: Request) {
  if (!dbUrl) {
    return NextResponse.json({ error: "No DATABASE_URL configured" }, { status: 500 });
  }

  let client: pg.Client | null = null;
  try {
    const body = await req.json();
    const csv = body.csv as string;
    if (!csv) {
      return NextResponse.json({ error: "No CSV data" }, { status: 400 });
    }

    const rows = parseMfpCsv(csv);
    if (rows.length === 0) {
      const firstLine = csv.trim().split(/\r?\n/)[0]?.slice(0, 200) || "(empty)";
      return NextResponse.json(
        { error: `Nie znaleziono danych. Nagłówki: ${firstLine}` },
        { status: 400 }
      );
    }

    client = await getClient();
    await ensureTable(client);

    // Upsert rows using ON CONFLICT
    const upsertSQL = `
      INSERT INTO nutrition_log (date, calories, fat_g, saturated_fat_g, cholesterol_mg, sodium_mg, carbs_g, fiber_g, sugar_g, protein_g)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (date) DO UPDATE SET
        calories = EXCLUDED.calories,
        fat_g = EXCLUDED.fat_g,
        saturated_fat_g = EXCLUDED.saturated_fat_g,
        cholesterol_mg = EXCLUDED.cholesterol_mg,
        sodium_mg = EXCLUDED.sodium_mg,
        carbs_g = EXCLUDED.carbs_g,
        fiber_g = EXCLUDED.fiber_g,
        sugar_g = EXCLUDED.sugar_g,
        protein_g = EXCLUDED.protein_g;
    `;

    for (const r of rows) {
      await client.query(upsertSQL, [
        r.date,
        r.calories,
        r.fat_g,
        r.saturated_fat_g,
        r.cholesterol_mg,
        r.sodium_mg,
        r.carbs_g,
        r.fiber_g,
        r.sugar_g,
        r.protein_g,
      ]);
    }

    return NextResponse.json({
      imported: rows.length,
      from: rows[rows.length - 1].date,
      to: rows[0].date,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await client?.end().catch(() => {});
  }
}

// GET: fetch nutrition data (last 30 days by default)
export async function GET(req: Request) {
  if (!dbUrl) {
    return NextResponse.json({ error: "No DATABASE_URL configured" }, { status: 500 });
  }

  let client: pg.Client | null = null;
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30", 10);

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split("T")[0];

    client = await getClient();
    await ensureTable(client);

    const { rows } = await client.query(
      `SELECT date, calories, fat_g, saturated_fat_g, cholesterol_mg, sodium_mg, carbs_g, fiber_g, sugar_g, protein_g
       FROM nutrition_log
       WHERE date >= $1
       ORDER BY date DESC`,
      [sinceStr]
    );

    // Format dates as YYYY-MM-DD strings
    const entries = rows.map((r) => ({
      ...r,
      date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date),
      calories: Number(r.calories),
      fat_g: Number(r.fat_g),
      saturated_fat_g: Number(r.saturated_fat_g),
      cholesterol_mg: Number(r.cholesterol_mg),
      sodium_mg: Number(r.sodium_mg),
      carbs_g: Number(r.carbs_g),
      fiber_g: Number(r.fiber_g),
      sugar_g: Number(r.sugar_g),
      protein_g: Number(r.protein_g),
    }));

    return NextResponse.json({ entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await client?.end().catch(() => {});
  }
}
