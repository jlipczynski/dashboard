import Anthropic from "@anthropic-ai/sdk";

// Reads a Bookly "Reading Report" infographic with Claude vision.

export type ParsedBooklyReport = {
  is_bookly_report: boolean;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  minutes: number;
  pages: number;
  reading_days: number;
  books_finished: number;
  finished_titles: string[];
};

const SUPPORTED = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedMediaType = (typeof SUPPORTED)[number];

export function isSupportedImage(mime: string): mime is SupportedMediaType {
  return (SUPPORTED as readonly string[]).includes(mime);
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_bookly_report",
    "period_from",
    "period_to",
    "minutes",
    "pages",
    "reading_days",
    "books_finished",
    "finished_titles",
  ],
  properties: {
    is_bookly_report: { type: "boolean" },
    period_from: { type: "string", description: "Start of the report period, YYYY-MM-DD" },
    period_to: { type: "string", description: "End of the report period, YYYY-MM-DD" },
    minutes: { type: "integer", description: "TOTAL READ TIME converted to minutes (e.g. 18h 21m = 1101)" },
    pages: { type: "integer", description: "PAGES READ" },
    reading_days: { type: "integer", description: "READING DAYS — the first number of 'X of Y'" },
    books_finished: { type: "integer", description: "TOTAL BOOKS FINISHED" },
    finished_titles: {
      type: "array",
      items: { type: "string" },
      description: "Titles of finished books shown on the covers, if readable",
    },
  },
} as const;

const PROMPT = `This image should be a "Reading Report" infographic from the Bookly app.
Extract the numbers exactly as shown:
- the report period (e.g. "1 Oct 2026 - 20 Oct 2026") as period_from / period_to in YYYY-MM-DD
- TOTAL READ TIME converted to whole minutes
- PAGES READ
- READING DAYS: the first number of "X of Y"
- TOTAL BOOKS FINISHED
- titles of the finished books shown on the covers (best effort; empty list if unreadable)
If the image is not a Bookly reading report, set is_bookly_report to false and use 0 / empty values.`;

export async function parseBooklyImage(base64: string, mediaType: SupportedMediaType): Promise<ParsedBooklyReport> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
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

  const parsed = JSON.parse(text.text) as ParsedBooklyReport;
  if (!parsed.is_bookly_report) throw new Error("To nie wyglada na raport Bookly");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.period_from) || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.period_to)) {
    throw new Error("Nie udalo sie odczytac zakresu dat");
  }
  return parsed;
}
