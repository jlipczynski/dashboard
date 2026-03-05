import { NextResponse } from "next/server";
import { runSQL, querySQL, hasDbUrl } from "@/lib/db";

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

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  if (!hasDbUrl()) return;

  try {
    await runSQL(BOOKS_SQL);
    tableReady = true;
  } catch {
    // table likely already exists
    tableReady = true;
  }
}

// GET /api/books?status=reading
export async function GET(request: Request) {
  if (!hasDbUrl()) {
    return NextResponse.json({ books: [] });
  }

  await ensureTable();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  try {
    let sql = "SELECT * FROM books";
    const params: unknown[] = [];

    if (status) {
      sql += " WHERE status = $1";
      params.push(status);
    }

    sql += " ORDER BY updated_at DESC";

    const books = await querySQL(sql, params);
    return NextResponse.json({ books });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ books: [] });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/books — create a new book
export async function POST(request: Request) {
  if (!hasDbUrl()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  await ensureTable();

  const body = await request.json();
  const { title, total_pages, type, cover_url } = body;

  if (!title || !total_pages) {
    return NextResponse.json({ error: "Missing title or total_pages" }, { status: 400 });
  }

  try {
    const bookType = type === "listening" ? "listening" : "reading";
    const rows = await querySQL(
      `INSERT INTO books (title, total_pages, current_page, status, type, cover_url)
       VALUES ($1, $2, 0, 'reading', $3, $4)
       RETURNING *`,
      [title, Number(total_pages), bookType, cover_url || null]
    );
    return NextResponse.json({ book: rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/books — update a book
export async function PATCH(request: Request) {
  if (!hasDbUrl()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  await ensureTable();

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.title !== undefined) { setClauses.push(`title = $${idx++}`); params.push(updates.title); }
  if (updates.total_pages !== undefined) { setClauses.push(`total_pages = $${idx++}`); params.push(Number(updates.total_pages)); }
  if (updates.status !== undefined) { setClauses.push(`status = $${idx++}`); params.push(updates.status); }
  if (updates.current_page !== undefined) { setClauses.push(`current_page = $${idx++}`); params.push(Number(updates.current_page)); }
  if (updates.cover_url !== undefined) { setClauses.push(`cover_url = $${idx++}`); params.push(updates.cover_url); }
  setClauses.push(`updated_at = $${idx++}`);
  params.push(new Date().toISOString());

  params.push(id);

  try {
    const rows = await querySQL(
      `UPDATE books SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );
    return NextResponse.json({ book: rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/books?id=...
export async function DELETE(request: Request) {
  if (!hasDbUrl()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  await ensureTable();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    await querySQL("DELETE FROM books WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
