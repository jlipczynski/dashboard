import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key);
}

const DEFAULT_CATEGORIES: { name: string; type: "expense" | "income" }[] = [
  { name: "Travel", type: "expense" },
  { name: "Mati USA", type: "expense" },
  { name: "Zwierzaki", type: "expense" },
  { name: "Rozrywka", type: "expense" },
  { name: "Jedzenie na zewnątrz", type: "expense" },
  { name: "Inne", type: "expense" },
  { name: "Food & Drink", type: "expense" },
  { name: "Kids sport", type: "expense" },
  { name: "Transportation", type: "expense" },
  { name: "Kids education", type: "expense" },
  { name: "Housing & Utilities", type: "expense" },
  { name: "Kids other", type: "expense" },
  { name: "Personal Care", type: "expense" },
  { name: "Shopping", type: "expense" },
  { name: "Health Care", type: "expense" },
  { name: "Membership", type: "expense" },
  { name: "Giving", type: "expense" },
  { name: "Maliny", type: "income" },
  { name: "Salary", type: "income" },
  { name: "Investment", type: "income" },
];

let tablesReady = false;

export async function ensureFinanceTables() {
  if (tablesReady) return;

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return;
  }

  const { data, error } = await admin.from("finance_categories").select("id").limit(1);

  if (!error) {
    if (data && data.length === 0) {
      await admin.from("finance_categories").insert(DEFAULT_CATEGORIES);
    }
    // Kolumny (tag/merchant/notes) dodaja migracje w supabase/migrations/ — nie w runtime.
    tablesReady = true;
    return;
  }

  if (!error.message.includes("does not exist")) {
    tablesReady = true;
    return;
  }

  // Brak tabel — NIE tworzymy ich w runtime. Migracje tylko recznie (scripts/migrate.mjs).
}

// ── CSV parser ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseAmount(str: string): number {
  return parseFloat(str.replace(/['"]/g, "").replace(",", ".")) || 0;
}

function parseDate(str: string): string {
  const t = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const [day, month, year] = t.split("-");
  if (!day || !month || !year) return t;
  return `${year}-${month}-${day}`;
}

export function extractMerchant(description: string): string {
  // Card payment: "DOP. MC ... PŁATNOŚĆ KARTĄ 80.49 PLN OPENAI *CHATGPT SUBSCR DUBLIN"
  const cardMatch = description.match(/PŁATNOŚĆ KARTĄ [\d,.]+ PLN (.+)/);
  if (cardMatch) return cardMatch[1].trim();

  // BLIK
  if (description.includes("Zakup BLIK")) {
    const blikMatch = description.match(/Zakup BLIK (.+?) ref:/);
    return blikMatch ? blikMatch[1].trim() : "BLIK";
  }

  // Standing order: "Platnosc powtarzalna {payee} ..."
  const standingMatch = description.match(/Platnosc powtarzalna ([^\s].*?) (sp\b|S\.A\.|ul\.|ref:|$)/i);
  if (standingMatch) return standingMatch[1].trim();

  return description;
}

export function makeImportHash(date: string, description: string, amount: number): string {
  return crypto
    .createHash("sha256")
    .update(`${date}|${description}|${amount}`)
    .digest("hex")
    .slice(0, 32);
}

export type ParsedTransaction = {
  date: string;
  description: string;
  counterparty: string | null;
  merchant: string;
  amount: number;
  balance: number | null;
  importHash: string;
};

export function parseSantanderCSV(content: string): ParsedTransaction[] {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const transactions: ParsedTransaction[] = [];

  // Skip first line — account summary row
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 6) continue;

    const date = parseDate(cols[0]);
    const description = cols[2]?.trim() || "";
    const counterparty = cols[3]?.trim() || null;
    const amountStr = cols[5]?.trim() || "0";
    const balanceStr = cols[6]?.trim() || "";

    const amount = parseAmount(amountStr);
    const balance = balanceStr ? parseAmount(balanceStr) : null;

    if (!date || !description || amount === 0) continue;

    const merchant = extractMerchant(description);
    const importHash = makeImportHash(date, description, amount);

    transactions.push({
      date,
      description,
      counterparty: counterparty || null,
      merchant,
      amount,
      balance,
      importHash,
    });
  }

  return transactions;
}
