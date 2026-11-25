import Anthropic from "@anthropic-ai/sdk";
import { isValidSession, type BooklySession } from "./bookly-sessions";

// Reads a Bookly screenshot with Claude vision. Two kinds are recognised:
//  - "Reading Report" infographic (aggregates for a date range)
//  - "Reading Sessions" list (one card per session: date, book, pages, time)

export type ParsedBooklyReport = {
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  minutes: number;
  pages: number;
  reading_days: number;
  books_finished: number;
  finished_titles: string[];
};

export type ParsedBooklyImage =
  | { kind: "report"; report: ParsedBooklyReport }
  | { kind: "sessions"; sessions: BooklySession[] };

const SUPPORTED = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedMediaType = (typeof SUPPORTED)[number];

export function isSupportedImage(mime: string): mime is SupportedMediaType {
  return (SUPPORTED as readonly string[]).includes(mime);
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "period_from",
    "period_to",
    "minutes",
    "pages",
    "reading_days",
    "books_finished",
    "finished_titles",
    "sessions",
  ],
  properties: {
    kind: { type: "string", enum: ["report", "sessions", "other"] },
    period_from: { type: "string", description: "report only: start of the report period, YYYY-MM-DD" },
    period_to: { type: "string", description: "report only: end of the report period, YYYY-MM-DD" },
    minutes: { type: "integer", description: "report only: TOTAL READ TIME converted to minutes (e.g. 18h 21m = 1101)" },
    pages: { type: "integer", description: "report only: PAGES READ" },
    reading_days: { type: "integer", description: "report only: READING DAYS — the first number of 'X of Y'" },
    books_finished: { type: "integer", description: "report only: TOTAL BOOKS FINISHED" },
    finished_titles: {
      type: "array",
      items: { type: "string" },
      description: "report only: titles of finished books shown on the covers, if readable",
    },
    sessions: {
      type: "array",
      description: "sessions only: every COMPLETE session card, top to bottom",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "title", "author", "pages", "seconds"],
        properties: {
          date: { type: "string", description: "card date, YYYY-MM-DD" },
          title: { type: "string", description: "book title exactly as shown" },
          author: { type: "string", description: "author as shown (may be truncated); empty if not visible" },
          pages: { type: "integer", description: "PAGES READ" },
          seconds: { type: "integer", description: "READ TIME in seconds (e.g. 0h 31m 34s = 1894)" },
        },
      },
    },
  },
} as const;

const PROMPT = `This image is a screenshot from the Bookly app. Decide which kind it is.

kind = "report": a "Reading Report" infographic. Extract exactly as shown:
- the report period (e.g. "1 Oct 2026 - 20 Oct 2026") as period_from / period_to in YYYY-MM-DD
- TOTAL READ TIME converted to whole minutes
- PAGES READ
- READING DAYS: the first number of "X of Y"
- TOTAL BOOKS FINISHED
- titles of the finished books shown on the covers (best effort; empty list if unreadable)
Leave sessions empty.

kind = "sessions": a "READING SESSIONS" list of cards. For every card return date, book title, author, PAGES READ and READ TIME (in seconds).
Include ONLY cards where the date, the title, the PAGES READ number and the READ TIME value are all fully visible.
Skip cards cut off at the top or bottom of the screen (e.g. only numbers without a date, or a date and title without the numbers, or partially hidden by the bottom tab bar).
Several cards may share the same date — list each one. Use 0 / empty values for the report fields.

kind = "other": anything else. Use 0 / empty values everywhere.`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function readBooklyImage(base64: string, mediaType: SupportedMediaType): Promise<ParsedBooklyImage> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Model odmowil odczytu obrazka");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Brak odpowiedzi z modelu");

  const parsed = JSON.parse(text.text) as ParsedBooklyReport & {
    kind: "report" | "sessions" | "other";
    sessions: Partial<BooklySession>[];
  };

  if (parsed.kind === "sessions") {
    const sessions = (parsed.sessions ?? [])
      .map((s) => ({ ...s, title: (s.title ?? "").trim(), author: (s.author ?? "").trim() }))
      .filter(isValidSession);
    if (sessions.length === 0) throw new Error("Nie znaleziono pełnych kart sesji na zrzucie");
    return { kind: "sessions", sessions };
  }
  if (parsed.kind !== "report") throw new Error("To nie wyglada na raport ani liste sesji Bookly");
  if (!DATE_RE.test(parsed.period_from) || !DATE_RE.test(parsed.period_to)) {
    throw new Error("Nie udalo sie odczytac zakresu dat");
  }
  const { period_from, period_to, minutes, pages, reading_days, books_finished, finished_titles } = parsed;
  return {
    kind: "report",
    report: { period_from, period_to, minutes, pages, reading_days, books_finished, finished_titles: finished_titles ?? [] },
  };
}

/** Report screenshots only (Drive sync saves without review, sessions need it). */
export async function parseBooklyImage(base64: string, mediaType: SupportedMediaType): Promise<ParsedBooklyReport> {
  const res = await readBooklyImage(base64, mediaType);
  if (res.kind !== "report") {
    throw new Error("Zrzut listy sesji — wgraj go recznie na /rozwoj (wymaga sprawdzenia przed zapisem)");
  }
  return res.report;
}
