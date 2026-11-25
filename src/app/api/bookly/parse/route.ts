import { NextResponse } from "next/server";
import { isSupportedImage, readBooklyImage } from "@/lib/bookly-parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/bookly/parse (multipart, field "file")
 * Reads a Bookly screenshot and returns the extracted data for review — does not save.
 * Response: { kind: "report", report } or { kind: "sessions", sessions }.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Brak pliku" }, { status: 400 });
  }
  if (!isSupportedImage(file.type)) {
    return NextResponse.json({ error: `Nieobslugiwany format: ${file.type || "nieznany"} (JPG/PNG/WEBP)` }, { status: 400 });
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    return NextResponse.json(await readBooklyImage(base64, file.type));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Blad odczytu" }, { status: 500 });
  }
}
