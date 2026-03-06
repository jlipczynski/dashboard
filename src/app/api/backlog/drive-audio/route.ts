import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/google-auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken

  if (!accessToken) {
    return NextResponse.json({ error: "Nie zalogowany do Google" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get("fileId")

  if (!fileId) {
    return NextResponse.json({ error: "Brak fileId" }, { status: 400 })
  }

  // Get file metadata for mimeType
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType,name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!metaRes.ok) {
    return NextResponse.json({ error: "Nie mozna pobrac metadanych pliku" }, { status: metaRes.status })
  }

  const meta = await metaRes.json()

  // Download file content
  const audioRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!audioRes.ok) {
    return NextResponse.json({ error: "Nie mozna pobrac pliku audio" }, { status: audioRes.status })
  }

  const audioBuffer = await audioRes.arrayBuffer()

  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": meta.mimeType || "audio/mpeg",
      "Content-Length": audioBuffer.byteLength.toString(),
      "Content-Disposition": `inline; filename="${meta.name || "audio"}"`,
      "Cache-Control": "private, max-age=3600",
    },
  })
}
