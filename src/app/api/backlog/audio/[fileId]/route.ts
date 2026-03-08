import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/google-auth"

export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken

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
