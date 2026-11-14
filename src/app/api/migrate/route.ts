import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Endpoint wylaczony. Jedyna sciezka migracji: recznie, po OK Jana:
//   node --env-file=.env.local scripts/migrate.mjs
// Zrodlo migracji: supabase/migrations/*.sql (patrz CLAUDE.md, "Dostep Claude do bazy").
function gone() {
  return NextResponse.json(
    {
      error: "Gone",
      message: "/api/migrate jest wylaczony. Migracje uruchamia sie recznie: node --env-file=.env.local scripts/migrate.mjs",
    },
    { status: 410 }
  )
}

export async function GET() {
  return gone()
}

export async function POST() {
  return gone()
}
