import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { runMigrationSQL, hasDbUrl } from "@/lib/db";

export const FINANCE_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on finance_categories" ON finance_categories
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS finance_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,
  category_id UUID REFERENCES finance_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on finance_rules" ON finance_rules
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS finance_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  counterparty TEXT,
  amount DECIMAL(12,2) NOT NULL,
  balance DECIMAL(12,2),
  category_id UUID REFERENCES finance_categories(id),
  import_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on finance_transactions" ON finance_transactions
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_category ON finance_transactions (category_id);

INSERT INTO finance_categories (name, type) VALUES
  ('Travel', 'expense'),
  ('Mati USA', 'expense'),
  ('Zwierzaki', 'expense'),
  ('Rozrywka', 'expense'),
  ('Jedzenie na zewnątrz', 'expense'),
  ('Inne', 'expense'),
  ('Food & Drink', 'expense'),
  ('Kids sport', 'expense'),
  ('Transportation', 'expense'),
  ('Kids education', 'expense'),
  ('Housing & Utilities', 'expense'),
  ('Kids other', 'expense'),
  ('Personal Care', 'expense'),
  ('Shopping', 'expense'),
  ('Health Care', 'expense'),
  ('Membership', 'expense'),
  ('Giving', 'expense'),
  ('Maliny', 'income'),
  ('Salary', 'income'),
  ('Investment', 'income')
ON CONFLICT (name) DO NOTHING;
`;

let tablesReady = false;

export async function ensureFinanceTables() {
  if (tablesReady) return;
  if (!supabase) return;

  const { error } = await supabase.from("finance_categories").select("id").limit(1);
  if (!error) {
    tablesReady = true;
    return;
  }

  if (!error.message.includes("does not exist")) {
    tablesReady = true;
    return;
  }

  if (hasDbUrl()) {
    try {
      await runMigrationSQL("010_finance.sql", FINANCE_MIGRATION_SQL);
      tablesReady = true;
    } catch {
      // ignore
    }
  }
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
