#!/usr/bin/env node
// Tylko do odczytu: przepuszcza classifyIntermediary po wszystkich finance_transactions
// i wypisuje liczby (opaque / prefixed / null) z rozbiciem na pośredników.
// Nie wypisuje opisów transakcji ani DATABASE_URL.
//
// Uzycie (Node >= 23, importuje plik .ts bezposrednio):
//   node scripts/check-intermediaries.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { classifyIntermediary } from "../src/lib/finanse-intermediaries.ts";
import { extractMerchant } from "../src/lib/finanse-db.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

// Polaczenie jak w scripts/db-query.mjs: host poolera, haslo z DATABASE_URL.
const env = loadEnv();
const directUrl = process.env.DATABASE_URL || env.DATABASE_URL;
const poolerUrl = process.env.DATABASE_POOLER_URL || env.DATABASE_POOLER_URL;
if (!directUrl) {
  console.error("Brak DATABASE_URL w .env.local (uruchom: vercel env pull .env.local)");
  process.exit(2);
}
let dbUrl = directUrl;
if (poolerUrl) {
  const u = new URL(poolerUrl);
  u.password = new URL(directUrl).password;
  dbUrl = u.toString();
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const { rows } = await client.query(
    "SELECT description, counterparty, merchant FROM finance_transactions"
  );
  await client.query("COMMIT");

  const counts = { opaque: 0, prefixed: 0, null: 0 };
  const byProvider = {};
  for (const r of rows) {
    // merchant w bazie bywa NULL (kolumna z migracji 021) — liczymy go jak import: extractMerchant(description)
    const desc = r.description ?? "";
    const info = classifyIntermediary(desc, r.counterparty, r.merchant || extractMerchant(desc));
    const kind = info.kind ?? "null";
    counts[kind]++;
    if (info.kind) {
      const key = `${info.kind} / ${info.provider}`;
      byProvider[key] = (byProvider[key] ?? 0) + 1;
    }
  }

  console.log(`razem: ${rows.length}`);
  console.log(`opaque = ${counts.opaque}, prefixed = ${counts.prefixed}, null = ${counts.null}`);
  console.table(byProvider);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`BLAD: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
