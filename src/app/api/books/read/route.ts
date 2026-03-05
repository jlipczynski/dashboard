import { NextResponse } from "next/server";
import { querySQL, hasDbUrl } from "@/lib/db";

// POST /api/books/read — log a reading session
// Body: { book_id, page_number, date }
export async function POST(request: Request) {
  if (!hasDbUrl()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { book_id, page_number, date } = body;

  if (!book_id || page_number === undefined || !date) {
    return NextResponse.json({ error: "Missing book_id, page_number, or date" }, { status: 400 });
  }

  const pageNum = Number(page_number);

  try {
    // Get current book state
    const books = await querySQL(
      "SELECT * FROM books WHERE id = $1",
      [book_id]
    );

    if (books.length === 0) {
      return NextResponse.json({ error: "Ksiazka nie znaleziona" }, { status: 404 });
    }

    const book = books[0] as Record<string, unknown>;
    const pageFrom = Number(book.current_page);
    const pagesRead = pageNum - pageFrom;

    if (pagesRead <= 0) {
      await querySQL(
        "UPDATE books SET current_page = $1, updated_at = $2 WHERE id = $3",
        [pageNum, new Date().toISOString(), book_id]
      );
      return NextResponse.json({ ok: true, pages_read: 0, corrected: true });
    }

    // 1. Create book_readings entry
    await querySQL(
      `INSERT INTO book_readings (book_id, date, page_from, page_to, pages_read)
       VALUES ($1, $2, $3, $4, $5)`,
      [book_id, date, pageFrom, pageNum, pagesRead]
    );

    // 2. Update book's current_page (and auto-finish if at end)
    const newStatus = pageNum >= Number(book.total_pages) ? "finished" : "reading";
    await querySQL(
      "UPDATE books SET current_page = $1, status = $2, updated_at = $3 WHERE id = $4",
      [pageNum, newStatus, new Date().toISOString(), book_id]
    );

    // 3. Add pages/minutes to rozwoj_entries for this date
    const area = book.type === "listening" ? "sluchanie" : "czytanie";
    const existing = await querySQL(
      "SELECT * FROM rozwoj_entries WHERE area = $1 AND date = $2",
      [area, date]
    );

    if (existing.length > 0) {
      const entry = existing[0] as Record<string, unknown>;
      await querySQL(
        "UPDATE rozwoj_entries SET amount = $1, updated_at = $2 WHERE id = $3",
        [Number(entry.amount) + pagesRead, new Date().toISOString(), entry.id]
      );
    } else {
      await querySQL(
        "INSERT INTO rozwoj_entries (area, date, amount) VALUES ($1, $2, $3)",
        [area, date, pagesRead]
      );
    }

    return NextResponse.json({
      ok: true,
      pages_read: pagesRead,
      book_finished: newStatus === "finished",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/books/read?book_id=...&days=90 — get reading history for a book
export async function GET(request: Request) {
  if (!hasDbUrl()) {
    return NextResponse.json({ readings: [] });
  }

  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("book_id");
  const days = parseInt(searchParams.get("days") || "90");

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  try {
    let sql = `SELECT br.*, b.title as book_title
               FROM book_readings br
               JOIN books b ON b.id = br.book_id
               WHERE br.date >= $1`;
    const params: unknown[] = [sinceStr];

    if (bookId) {
      sql += " AND br.book_id = $2";
      params.push(bookId);
    }

    sql += " ORDER BY br.date DESC";

    const readings = await querySQL(sql, params);
    return NextResponse.json({ readings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ readings: [] });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
