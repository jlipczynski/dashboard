import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/google-auth";
import { supabase } from "@/lib/supabase";
import { isSupportedImage, parseBooklyImage } from "@/lib/bookly-parse";
import { saveReport } from "@/lib/bookly-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FOLDER_NAME = "Bookly Reports";
/** Max new images read per sync (each is one Claude call). Processed files are
 * remembered in bookly_drive_skipped (reason "imported" or the error). */
const MAX_PER_SYNC = 3;

type DriveFile = { id: string; name: string; mimeType: string; createdTime: string };

async function drive(path: string, token: string) {
  return fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * POST /api/bookly/sync
 * Finds the "Bookly Reports" folder in the signed-in user's Google Drive,
 * reads new report images with Claude and saves them. Already imported
 * (or unreadable) files are skipped.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;
  if (!token) {
    return NextResponse.json({ error: "Nie zalogowany do Google", needsLogin: true }, { status: 401 });
  }
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  // 1. Find the folder by name
  const folderQ = new URLSearchParams({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    pageSize: "5",
  });
  const folderRes = await drive(`files?${folderQ}`, token);
  if (!folderRes.ok) {
    return NextResponse.json({ error: `Google Drive: ${await folderRes.text()}` }, { status: folderRes.status });
  }
  const folders: { id: string }[] = (await folderRes.json()).files ?? [];
  if (folders.length === 0) {
    return NextResponse.json({ folderFound: false, imported: [], pending: 0, errors: [] });
  }

  // 2. List images in the folder(s)
  const parents = folders.map((f) => `'${f.id}' in parents`).join(" or ");
  const filesQ = new URLSearchParams({
    q: `(${parents}) and mimeType contains 'image/' and trashed=false`,
    fields: "files(id,name,mimeType,createdTime)",
    orderBy: "createdTime",
    pageSize: "200",
  });
  const filesRes = await drive(`files?${filesQ}`, token);
  if (!filesRes.ok) {
    return NextResponse.json({ error: `Google Drive: ${await filesRes.text()}` }, { status: filesRes.status });
  }
  const files: DriveFile[] = (await filesRes.json()).files ?? [];

  // 3. Skip already imported / unreadable files
  const [{ data: done }, { data: skipped }] = await Promise.all([
    supabase.from("bookly_reports").select("drive_file_id").not("drive_file_id", "is", null),
    supabase.from("bookly_drive_skipped").select("file_id"),
  ]);
  const known = new Set<string>([
    ...((done ?? []) as { drive_file_id: string }[]).map((r) => r.drive_file_id),
    ...((skipped ?? []) as { file_id: string }[]).map((r) => r.file_id),
  ]);
  const fresh = files.filter((f) => !known.has(f.id));

  const imported: { name: string; period_from: string; period_to: string }[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const f of fresh.slice(0, MAX_PER_SYNC)) {
    try {
      if (!isSupportedImage(f.mimeType)) throw new Error(`Nieobslugiwany format ${f.mimeType} (JPG/PNG/WEBP)`);
      const media = await drive(`files/${f.id}?alt=media`, token);
      if (!media.ok) throw new Error(`Pobieranie: ${media.status}`);
      const base64 = Buffer.from(await media.arrayBuffer()).toString("base64");
      const report = await parseBooklyImage(base64, f.mimeType);
      await saveReport({
        period_from: report.period_from,
        period_to: report.period_to,
        minutes: report.minutes,
        pages: report.pages,
        reading_days: report.reading_days,
        books_finished: report.books_finished,
        finished_titles: report.finished_titles,
        source: "drive",
        drive_file_id: f.id,
      });
      imported.push({ name: f.name, period_from: report.period_from, period_to: report.period_to });
      // Remember every processed file, so a second image of the same period isn't re-read forever
      await supabase.from("bookly_drive_skipped").upsert({ file_id: f.id, name: f.name, reason: "imported" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Blad";
      errors.push({ name: f.name, error: msg });
      await supabase.from("bookly_drive_skipped").upsert({ file_id: f.id, name: f.name, reason: msg });
    }
  }

  return NextResponse.json({
    folderFound: true,
    imported,
    errors,
    pending: Math.max(fresh.length - MAX_PER_SYNC, 0),
  });
}
