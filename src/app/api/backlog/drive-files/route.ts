import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { createClient } from "@supabase/supabase-js"
import { authOptions } from "@/lib/google-auth"

export const dynamic = "force-dynamic"

const AUDIO_MIME_TYPES = [
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
]

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken

  if (!accessToken) {
    return NextResponse.json({ error: "Nie zalogowany do Google" }, { status: 401 })
  }

  const folderId = process.env.GOOGLE_DRIVE_BACKLOG_FOLDER_ID
  if (!folderId) {
    return NextResponse.json({ error: "Brak GOOGLE_DRIVE_BACKLOG_FOLDER_ID" }, { status: 500 })
  }

  const mimeQuery = AUDIO_MIME_TYPES.map((m) => `mimeType='${m}'`).join(" or ")
  const query = `'${folderId}' in parents and (${mimeQuery}) and trashed=false`

  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,mimeType,createdTime,size)",
    orderBy: "createdTime desc",
    pageSize: "100",
  })

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json(
      { error: `Google Drive API error: ${err}` },
      { status: res.status }
    )
  }

  const data = await res.json()
  const files = data.files || []

  // Filter out already-processed files
  const supabase = getSupabaseAdmin()
  const { data: processed } = await supabase
    .from("backlog_audio_processed")
    .select("file_id")

  const processedIds = new Set((processed || []).map((r: any) => r.file_id))
  const unprocessed = files.filter((f: any) => !processedIds.has(f.id))

  return NextResponse.json({ files: unprocessed })
}
