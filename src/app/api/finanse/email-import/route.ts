import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { getToken } from "next-auth/jwt";
import { getSupabaseAdmin, extractMerchant } from "@/lib/finanse-db";
import { isEmailAllowed } from "@/lib/google-auth";
import { refreshGoogleAccessToken } from "@/lib/google-token";
import { loadRefreshToken } from "@/lib/finance-google-store";
import { parseErsteAlert, gmailBodyText, maskAccounts, type ErsteAlert } from "@/lib/erste-alert";
import { classifyIntermediary } from "@/lib/finanse-intermediaries";
import { matchRule, sortRules } from "@/lib/finanse-rules";
import { planEmailMatches, toGrosze, MATCH_WINDOW_DAYS } from "@/lib/finanse-email-match";
import { SUGGEST_BATCH_MAX, buildSuggestPrompt, parseSuggestResponse } from "@/lib/finanse-suggest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Erste "Alerty24" e-mails → transactions (brief Finanse 08).
// GET  + "Authorization: Bearer $CRON_SECRET" → nightly run (Vercel cron)
// GET  with Jan's session                     → status of the last run (for /finanse/przeglad)
// POST with Jan's session                     → run now ("Pobierz alerty teraz")
// New rows: source='email', import_hash='email:'+messageId, reviewed_at=null (to review).
// Nothing here logs tokens, e-mail bodies or account numbers.

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const QUERY = "from:alerty24@erste.pl newer_than:3d";
const MAX_MESSAGES = 200;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const allowedEmails = () =>
  (process.env.ALLOWED_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function hasSession(req: NextRequest): Promise<boolean> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return !!token && isEmailAllowed(token.email as string | undefined);
}

type ImportResult = {
  fetched: number;
  inserted: number;
  matched_rules: number;
  ai_suggested: number;
  unparsed: number;
  linked_existing: number;
  errors: { id?: string; reason: string; subject?: string }[];
};

async function gmailGet<T>(path: string, accessToken: string): Promise<T> {
  const r = await fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`gmail_${r.status}`);
  return (await r.json()) as T;
}

async function runImport(trigger: "cron" | "manual"): Promise<{ status: number; body: unknown }> {
  const admin = getSupabaseAdmin();
  const result: ImportResult = { fetched: 0, inserted: 0, matched_rules: 0, ai_suggested: 0, unparsed: 0, linked_existing: 0, errors: [] };
  const log = async () => {
    await admin.from("finance_email_imports").insert({
      trigger,
      fetched: result.fetched,
      inserted: result.inserted,
      matched_rules: result.matched_rules,
      ai_suggested: result.ai_suggested,
      unparsed: result.unparsed,
      errors: result.errors.length ? result.errors : null,
    });
  };

  // 1. Access token from the stored refresh token
  let stored: Awaited<ReturnType<typeof loadRefreshToken>> = null;
  try {
    stored = await loadRefreshToken(allowedEmails());
  } catch {
    result.errors.push({ reason: "token_decrypt_failed" });
  }
  if (!stored) {
    if (result.errors.length === 0) result.errors.push({ reason: "no_refresh_token — zaloguj się ponownie" });
    await log();
    return { status: 409, body: { error: "Brak zapisanego tokenu Google — wyloguj się i zaloguj ponownie.", ...result } };
  }
  const access = await refreshGoogleAccessToken(stored.refreshToken);
  if (!access.ok) {
    result.errors.push({ reason: "google_refresh_failed" });
    await log();
    return { status: 502, body: { error: "Google nie odświeżył dostępu — zaloguj się ponownie.", ...result } };
  }
  const accessToken = access.accessToken;

  // 2. List alert e-mails from the last 3 days
  const ids: string[] = [];
  try {
    let pageToken: string | undefined;
    do {
      const q = `?q=${encodeURIComponent(QUERY)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const page = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages${q}`, accessToken);
      ids.push(...(page.messages ?? []).map((m) => m.id));
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < MAX_MESSAGES);
  } catch (e) {
    result.errors.push({ reason: e instanceof Error ? e.message : "gmail_list_failed" });
    await log();
    return { status: 502, body: { error: "Nie udało się pobrać listy maili z Gmaila.", ...result } };
  }
  result.fetched = ids.length;

  // 3. Skip messages already in the DB
  const { data: known, error: knownErr } = ids.length
    ? await admin.from("finance_transactions").select("email_message_id").in("email_message_id", ids)
    : { data: [], error: null };
  if (knownErr) {
    result.errors.push({ reason: "db_read_failed" });
    await log();
    return { status: 500, body: { error: knownErr.message, ...result } };
  }
  const knownIds = new Set((known ?? []).map((k) => k.email_message_id as string));
  const fresh = ids.filter((id) => !knownIds.has(id));

  // 4. Parse
  const parsed: { id: string; alert: ErsteAlert }[] = [];
  for (const id of fresh) {
    try {
      const msg = await gmailGet<{ payload?: { headers?: { name: string; value: string }[] } & Parameters<typeof gmailBodyText>[0] }>(
        `/messages/${id}?format=full`,
        accessToken
      );
      const subject = msg.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
      const r = parseErsteAlert(gmailBodyText(msg.payload));
      if (r.ok) parsed.push({ id, alert: r.alert });
      else {
        result.unparsed++;
        result.errors.push({ id, reason: `unparsed: ${r.reason}`, subject: maskAccounts(subject).slice(0, 120) });
      }
    } catch (e) {
      result.errors.push({ id, reason: e instanceof Error ? e.message : "gmail_get_failed" });
    }
  }

  // 5. A bank-CSV row for the same payment may already exist (CSV imported first): link instead of inserting.
  let toInsert = parsed;
  if (parsed.length) {
    const dates = parsed.map((p) => p.alert.date).sort();
    const shift = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
    const { data: bankRows, error } = await admin
      .from("finance_transactions")
      .select("id, date, amount, import_hash")
      .is("email_message_id", null)
      .gte("date", shift(dates[0], -MATCH_WINDOW_DAYS))
      .lte("date", shift(dates[dates.length - 1], MATCH_WINDOW_DAYS));
    if (!error) {
      const candidates = (bankRows ?? [])
        .filter((r) => !String(r.import_hash).startsWith("cash:") && !String(r.import_hash).startsWith("email:"))
        .map((r) => ({ id: r.id as string, date: r.date as string, amountGrosze: toGrosze(r.amount as string) }));
      const plan = planEmailMatches(parsed.map((p) => ({ date: p.alert.date, amountGrosze: p.alert.amountGrosze })), candidates);
      toInsert = [];
      for (let i = 0; i < parsed.length; i++) {
        const d = plan[i];
        if (d.action === "update") {
          const { error: linkErr } = await admin
            .from("finance_transactions")
            .update({ email_message_id: parsed[i].id })
            .eq("id", d.emailId);
          if (!linkErr) result.linked_existing++;
          else toInsert.push(parsed[i]);
        } else toInsert.push(parsed[i]);
      }
    }
  }

  // 6. Categorize: Jan's rules first, then an AI suggestion (Haiku) for the rest
  const { data: rulesData } = await admin
    .from("finance_rules")
    .select("pattern, counterparty_pattern, created_at, category_id, subcategory_id");
  const rules = sortRules((rulesData ?? []) as { pattern: string; counterparty_pattern: string | null; created_at: string | null; category_id: string; subcategory_id: string | null }[]);
  const rows = toInsert.map(({ id, alert }) => {
    const raw = extractMerchant(alert.title);
    const info = classifyIntermediary(alert.title, alert.counterparty, raw);
    const merchant = info.kind === "prefixed" ? info.cleanMerchant : raw;
    const rule = info.kind === "opaque" ? null : matchRule(rules, { description: alert.title, merchant, counterparty: alert.counterparty });
    if (rule) result.matched_rules++;
    return {
      key: id,
      opaque: info.kind === "opaque",
      row: {
        date: alert.date,
        description: alert.title,
        counterparty: alert.counterparty,
        merchant,
        amount: (alert.amountGrosze / 100).toFixed(2),
        balance: alert.balanceGrosze === null ? null : (alert.balanceGrosze / 100).toFixed(2),
        category_id: rule?.category_id ?? null,
        subcategory_id: rule?.subcategory_id ?? null,
        import_hash: `email:${id}`,
        email_message_id: id,
        source: "email",
        reviewed_at: null,
      } as Record<string, string | null>,
    };
  });

  const needAi = rows.filter((r) => !r.row.category_id && !r.opaque);
  if (needAi.length && process.env.ANTHROPIC_API_KEY) {
    const { data: categories } = await admin.from("finance_categories").select("id, name, type").order("name");
    const cats = categories ?? [];
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    for (let i = 0; i < needAi.length; i += SUGGEST_BATCH_MAX) {
      const batch = needAi.slice(i, i + SUGGEST_BATCH_MAX);
      try {
        const message = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: buildSuggestPrompt(
                cats,
                batch.map((b) => ({
                  key: b.key,
                  amount: Number(b.row.amount),
                  merchant: b.row.merchant ?? "",
                  counterparty: b.row.counterparty,
                }))
              ),
            },
          ],
        });
        const raw = message.content.find((c) => c.type === "text")?.text ?? "";
        const res = parseSuggestResponse(raw, batch.length, new Set(cats.map((c) => c.id)));
        if (res.ok) {
          for (const [idx, categoryId] of res.byIndex) {
            batch[idx - 1].row.category_id = categoryId;
            result.ai_suggested++;
          }
        } else result.errors.push({ reason: "ai_parse" });
      } catch {
        result.errors.push({ reason: "ai_failed" });
      }
    }
  }

  // 7. Insert (unique import_hash / email_message_id → a parallel run cannot duplicate)
  if (rows.length) {
    const { data: ins, error } = await admin
      .from("finance_transactions")
      .upsert(rows.map((r) => r.row), { onConflict: "import_hash", ignoreDuplicates: true })
      .select("id");
    if (error) {
      result.errors.push({ reason: "db_insert_failed" });
      await log();
      return { status: 500, body: { error: error.message, ...result } };
    }
    result.inserted = ins?.length ?? 0;
  }

  await log();
  return { status: 200, body: { ok: true, ...result } };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization")) {
    if (!isCron(req)) return json({ error: "Unauthorized" }, 401);
    const r = await runImport("cron");
    return json(r.body, r.status);
  }
  if (!(await hasSession(req))) return json({ error: "Unauthorized" }, 401);
  const admin = getSupabaseAdmin();
  const [last, token] = await Promise.all([
    admin.from("finance_email_imports").select("ran_at, trigger, fetched, inserted, unparsed").order("ran_at", { ascending: false }).limit(1),
    admin.from("finance_google_tokens").select("updated_at").limit(1),
  ]);
  return json({ last: last.data?.[0] ?? null, tokenStored: (token.data?.length ?? 0) > 0 });
}

export async function POST(req: NextRequest) {
  if (!(await hasSession(req))) return json({ error: "Unauthorized" }, 401);
  const r = await runImport("manual");
  return json(r.body, r.status);
}
