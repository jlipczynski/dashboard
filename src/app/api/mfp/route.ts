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

function parseMfpCsv(csv: string): NutritionRow[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  // MFP Nutrition Summary CSV has headers like:
  // Date,Calories,Fat (g),Saturated Fat,Cholesterol,Sodium (mg),Carbohydrates (g),Fiber,Sugar,Protein (g)
  const header = lines[0].toLowerCase();
  const isNutritionSummary = header.includes("calories") && header.includes("protein");
  if (!isNutritionSummary) return [];

  const rows: NutritionRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted CSV fields
    const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map((c) =>
      c.replace(/^"(.*)"$/, "$1").trim()
    );
    if (!cols || cols.length < 2) continue;

    // Parse date - MFP uses various formats, try common ones
    const dateStr = cols[0];
    let date: string;
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      date = dateStr;
    } else {
      // Try parsing with Date constructor (handles MM/DD/YYYY etc.)
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) continue;
      date = d.toISOString().split("T")[0];
    }

    const num = (idx: number) => {
      const v = cols[idx]?.replace(/,/g, "");
      const n = parseFloat(v || "0");
      return isNaN(n) ? 0 : n;
    };

    rows.push({
      date,
      calories: Math.round(num(1)),
      fat_g: num(2),
      saturated_fat_g: num(3),
      cholesterol_mg: num(4),
      sodium_mg: num(5),
      carbs_g: num(6),
      fiber_g: num(7),
      sugar_g: num(8),
      protein_g: num(9),
    });
  }
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
