import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runSQL, runMigrationSQL, hasDbUrl } from "@/lib/db";

const BOOKS_SQL = `
CREATE TABLE IF NOT EXISTS books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  total_pages INT NOT NULL DEFAULT 0,
  current_page INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'reading' CHECK (status IN ('reading', 'finished', 'archived')),
  type TEXT NOT NULL DEFAULT 'reading' CHECK (type IN ('reading', 'listening')),
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on books" ON books
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_books_status ON books (status);
CREATE INDEX IF NOT EXISTS idx_books_type ON books (type);

CREATE TABLE IF NOT EXISTS book_readings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  page_from INT NOT NULL DEFAULT 0,
  page_to INT NOT NULL,
  pages_read INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE book_readings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Allow all on book_readings" ON book_readings
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_book_readings_book_date ON book_readings (book_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_book_readings_date ON book_readings (date DESC);
`;

const BOOKS_TYPE_COVER_SQL = `
ALTER TABLE books ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'reading' CHECK (type IN ('reading', 'listening'));
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_url TEXT;
CREATE INDEX IF NOT EXISTS idx_books_type ON books (type);
`;

let tableReady = false;

async function ensureTable() {
  if (tableReady || !supabase) return;

  const { error } = await supabase.from("books").select("id").limit(1);
  if (!error) {
    // Table exists — ensure type/cover_url columns exist (migration 009)
    if (hasDbUrl()) {
      try {
        await runMigrationSQL("009_books_type_cover.sql", BOOKS_TYPE_COVER_SQL);
      } catch {
        // columns likely already exist
      }
    }
    tableReady = true;
    return;
  }

  if (!error.message.includes("does not exist") && !error.message.includes("schema cache")) {
    tableReady = true;
    return;
  }

  // Table missing — force-create via direct Postgres (bypass _migrations check
  // since the migration may be recorded but table was never actually created)
  if (hasDbUrl()) {
    try {
      await runSQL(BOOKS_SQL);
      await runSQL(BOOKS_TYPE_COVER_SQL);
      // Record in _migrations so future runs skip correctly
      await runMigrationSQL("008_books.sql", "SELECT 1");
      await runMigrationSQL("009_books_type_cover.sql", "SELECT 1");
      tableReady = true;
    } catch {
      // ignore — will fail on next query with clear error
    }
  }
}

// GET /api/books?status=reading
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ books: [] });
  }

  await ensureTable();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("books")
    .select("*")
    .order("updated_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    if (error.message.includes("does not exist")) {
      return NextResponse.json({ books: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ books: data });
}

// POST /api/books — create a new book
export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  await ensureTable();

  const body = await request.json();
  const { title, total_pages, type, cover_url } = body;

  if (!title || !total_pages) {
    return NextResponse.json({ error: "Missing title or total_pages" }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    title,
    total_pages: Number(total_pages),
    current_page: 0,
    status: "reading",
  };
  if (type === "reading" || type === "listening") insert.type = type;
  if (cover_url) insert.cover_url = cover_url;

  const { data, error } = await supabase
    .from("books")
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ book: data });
}

// PATCH /api/books — update a book
export async function PATCH(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  await ensureTable();

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const allowed: Record<string, unknown> = {};
  if (updates.title !== undefined) allowed.title = updates.title;
  if (updates.total_pages !== undefined) allowed.total_pages = Number(updates.total_pages);
  if (updates.status !== undefined) allowed.status = updates.status;
  if (updates.current_page !== undefined) allowed.current_page = Number(updates.current_page);
  if (updates.cover_url !== undefined) allowed.cover_url = updates.cover_url;
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("books")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ book: data });
}

// DELETE /api/books?id=...
export async function DELETE(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  await ensureTable();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase.from("books").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
