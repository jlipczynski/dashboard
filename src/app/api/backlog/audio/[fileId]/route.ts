import { NextResponse, type NextRequest } from "next/server"
import { getGoogleAccessToken } from "@/lib/google-token"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const accessToken = await getGoogleAccessToken(req)

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { fileId } = await params

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!driveRes.ok) {
    return NextResponse.json(
      { error: "Nie mozna pobrac pliku" },
      { status: driveRes.status }
    )
  }

  return new Response(driveRes.body, {
    headers: {
      "Content-Type": "audio/m4a",
      "Cache-Control": "private, max-age=3600",
    },
  })
}
