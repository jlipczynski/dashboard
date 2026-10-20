import { NextResponse } from "next/server";
import { isSupportedImage, parseBooklyImage } from "@/lib/bookly-parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/bookly/parse (multipart, field "file")
 * Reads a Bookly report image and returns the extracted numbers for review — does not save.
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
    const report = await parseBooklyImage(base64, file.type);
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Blad odczytu" }, { status: 500 });
  }
}
