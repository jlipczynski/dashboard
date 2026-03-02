import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null;

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
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse headers to find column indices dynamically
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  if (!headers.includes("calories") || !headers.includes("protein")) return [];

  // Build column index map
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const dateIdx = col("date");
  const calIdx = col("calories");
  const fatIdx = col("fat");
  const satFatIdx = headers.findIndex((h) => h.includes("saturated") && !h.includes("poly") && !h.includes("mono"));
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

    const existing = dailyMap.get(date);
    if (existing) {
      existing.calories += Math.round(num(cols, calIdx));
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
        calories: Math.round(num(cols, calIdx)),
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
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const csv = body.csv as string;
    if (!csv) {
      return NextResponse.json({ error: "No CSV data" }, { status: 400 });
    }

    const rows = parseMfpCsv(csv);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found in CSV. Make sure it's a MyFitnessPal Nutrition Summary file." }, { status: 400 });
    }

    // Upsert rows (update existing dates, insert new)
    const { error } = await supabase.from("nutrition_log").upsert(rows, { onConflict: "date" });

    if (error) {
      return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ imported: rows.length, from: rows[rows.length - 1].date, to: rows[0].date });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET: fetch nutrition data (last 30 days by default)
export async function GET(req: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30", 10);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("nutrition_log")
    .select("*")
    .gte("date", sinceStr)
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data || [] });
}
