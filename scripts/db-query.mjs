#!/usr/bin/env node
// Uruchamia SQL na bazie Supabase przez DATABASE_POOLER_URL / DATABASE_URL z .env.local (pg, bez psql).
// Nigdy nie wypisuje DATABASE_URL ani hasla.
//
// Uzycie:
//   node scripts/db-query.mjs "SELECT count(*) FROM weekly_tasks"
//   node scripts/db-query.mjs -f zapytanie.sql
//   node scripts/db-query.mjs --out backups/plik.json "SELECT * FROM ..."   # zapis wyniku do pliku
//   node scripts/db-query.mjs --write -f zmiana.sql                         # INSERT/UPDATE/DELETE/DDL
//
// Domyslnie sesja jest READ ONLY (Postgres odrzuci kazdy zapis).
// --write wolno uzyc dopiero po "OK" Jana (patrz CLAUDE.md, sekcja o bazie).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

const args = process.argv.slice(2);
let write = false;
let out = null;
let sql = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--write") write = true;
  else if (args[i] === "--out") out = args[++i];
  else if (args[i] === "-f") sql = readFileSync(args[++i], "utf8");
  else sql = args[i];
}
if (!sql) {
  console.error("Brak SQL. Uzycie: node scripts/db-query.mjs [--write] [--out plik] (\"SQL\" | -f plik.sql)");
  process.exit(2);
}

// Dane logowania (haslo) zawsze z DATABASE_URL.
// Bezposredni host db.<ref>.supabase.co jest tylko IPv6 — z wielu sieci sie nie rozwiazuje,
// wiec polaczenie idzie przez host/uzytkownika poolera z DATABASE_POOLER_URL (IPv4),
// ale z haslem z DATABASE_URL (haslo w DATABASE_POOLER_URL bywa nieaktualne).
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
  await client.query(write ? "BEGIN" : "BEGIN READ ONLY");
  const res = await client.query(sql);
  await client.query("COMMIT");

  const results = Array.isArray(res) ? res : [res];
  for (const r of results) {
    if (r.command === "SELECT" || r.rows?.length) {
      if (out) {
        mkdirSync(dirname(join(root, out)), { recursive: true });
        writeFileSync(join(root, out), JSON.stringify(r.rows, null, 2));
        console.log(`${r.rows.length} wierszy zapisano do ${out}`);
      } else {
        console.table(r.rows);
      }
    } else {
      console.log(`${r.command}: ${r.rowCount ?? 0} wierszy`);
    }
  }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  // Komunikat bledu z pg nie zawiera connection stringa; nie logujemy obiektu klienta.
  console.error(`BLAD: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
