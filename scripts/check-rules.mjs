#!/usr/bin/env node
// Tylko do odczytu (sesja READ ONLY): symulacja "na sucho" nowego dopasowania reguł (brief Finanse 05).
// Przepuszcza wszystkie transakcje z kategorią (bez kosza, bez gotówki, bez pośredników opaque — jak import)
// przez sortRules + matchRule i wypisuje, ile dostałoby INNĄ kategorię niż mają teraz (+ 20 przykładów),
// oraz statystyki per reguła. Reguły przeznaczone do usunięcia w kroku 4 są pomijane.
// Nie wypisuje DATABASE_URL.
//
// Uzycie (importy .ts bez rozszerzeń → przez tsx):
//   npx tsx scripts/check-rules.mjs            # reguły po sprzątaniu z briefu
//   npx tsx scripts/check-rules.mjs --all      # wszystkie obecne reguły

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { sortRules, matchRule } from "../src/lib/finanse-rules.ts";
import { classifyIntermediary } from "../src/lib/finanse-intermediaries.ts";
import { extractMerchant } from "../src/lib/finanse-merchant.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const useAll = process.argv.includes("--all");
// Te same warunki co DELETE w kroku 4 briefu 05 (+ ewentualne dodatkowe wzorce: --drop=OPLATA,INNY)
const dropArg = process.argv.find((a) => a.startsWith("--drop="));
const extraDrop = dropArg ? dropArg.slice(7).split(",").filter(Boolean) : [];
const isDropped = (p) =>
  !useAll && (["JAN", "PRZELEW", "GOTÓWKA:", ...extraDrop].includes(p) || p.startsWith("DOP. MC "));

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

const env = loadEnv();
const directUrl = process.env.DATABASE_URL || env.DATABASE_URL;
const poolerUrl = process.env.DATABASE_POOLER_URL || env.DATABASE_POOLER_URL;
if (!directUrl) {
  console.error("Brak DATABASE_URL w .env.local");
  process.exit(2);
}
let dbUrl = directUrl;
if (poolerUrl) {
  const u = new URL(poolerUrl);
  u.password = new URL(directUrl).password;
  dbUrl = u.toString();
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const hasCp = (
    await client.query(
      "select 1 from information_schema.columns where table_name='finance_rules' and column_name='counterparty_pattern'"
    )
  ).rowCount > 0;
  const { rows: ruleRows } = await client.query(
    `select r.pattern, ${hasCp ? "r.counterparty_pattern" : "null as counterparty_pattern"}, r.created_at::text, c.name as category
       from finance_rules r left join finance_categories c on c.id = r.category_id`
  );
  const { rows: txs } = await client.query(
    `select t.date::text, t.amount::float, t.description, t.counterparty, t.merchant, c.name as category
       from finance_transactions t join finance_categories c on c.id = t.category_id
      where t.deleted_at is null and t.import_hash not like 'cash:%'
      order by t.date`
  );
  await client.query("COMMIT");

  const rules = sortRules(ruleRows.filter((r) => !isDropped(r.pattern)));
  const label = (r) => (r.counterparty_pattern ? `${r.pattern} + ${r.counterparty_pattern}` : r.pattern);
  const perRule = new Map(rules.map((r) => [r, { matched: 0, changed: 0 }]));
  const changed = [];
  let matched = 0;
  let opaque = 0;

  for (const t of txs) {
    const desc = t.description ?? "";
    const info = classifyIntermediary(desc, t.counterparty, t.merchant || extractMerchant(desc));
    if (info.kind === "opaque") {
      opaque++;
      continue; // import skips rules for opaque intermediaries
    }
    const merchant = info.kind === "prefixed" ? info.cleanMerchant : t.merchant || extractMerchant(desc);
    const rule = matchRule(rules, { description: desc, merchant, counterparty: t.counterparty });
    if (!rule) continue;
    matched++;
    const s = perRule.get(rule);
    s.matched++;
    if (rule.category !== t.category) {
      s.changed++;
      changed.push({
        data: t.date,
        kwota: t.amount,
        opis: desc.slice(0, 45),
        odbiorca: (t.counterparty ?? "").slice(0, 25),
        teraz: t.category,
        reguła: rule.category,
        wg: label(rule).slice(0, 45),
      });
    }
  }

  console.log(`Reguły w symulacji: ${rules.length}${useAll ? " (wszystkie)" : ` (pominięte do usunięcia: ${ruleRows.length - rules.length})`}`);
  console.log(`Transakcje z kategorią (bez kosza i gotówki): ${txs.length}, w tym pośrednicy opaque pominięci: ${opaque}`);
  console.log(`Dopasowane przez regułę: ${matched}`);
  console.log(`INNA kategoria niż obecna: ${changed.length}`);
  if (changed.length) {
    console.log("\nPrzykłady (max 20):");
    console.table(changed.slice(0, 20));
  }
  const risky = [...perRule.entries()].filter(([, s]) => s.changed > 0).sort((a, b) => b[1].changed - a[1].changed);
  if (risky.length) {
    console.log("\nReguły zmieniające kategorię (reguła → dopasowane / zmienione):");
    console.table(risky.map(([r, s]) => ({ reguła: label(r).slice(0, 50), kategoria: r.category, dopasowane: s.matched, zmienione: s.changed })));
  }
} finally {
  await client.end();
}
