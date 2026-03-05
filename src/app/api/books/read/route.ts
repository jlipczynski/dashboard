import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST /api/books/read — log a reading session
// Body: { book_id, page_number, date }
export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { book_id, page_number, date } = body;

  if (!book_id || page_number === undefined || !date) {
    return NextResponse.json({ error: "Missing book_id, page_number, or date" }, { status: 400 });
  }

  const pageNum = Number(page_number);

  // Get current book state
  const { data: book, error: bookErr } = await supabase
    .from("books")
    .select("*")
    .eq("id", book_id)
    .single();

  if (bookErr || !book) {
    return NextResponse.json({ error: "Ksiazka nie znaleziona" }, { status: 404 });
  }

  const pageFrom = book.current_page;
  const pagesRead = pageNum - pageFrom;

  if (pagesRead <= 0) {
    await supabase
      .from("books")
      .update({ current_page: pageNum, updated_at: new Date().toISOString() })
      .eq("id", book_id);

    return NextResponse.json({ ok: true, pages_read: 0, corrected: true });
  }

  // 1. Create book_readings entry
  const { error: readErr } = await supabase
    .from("book_readings")
    .insert({
      book_id,
      date,
      page_from: pageFrom,
      page_to: pageNum,
      pages_read: pagesRead,
    });

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  // 2. Update book's current_page (and auto-finish if at end)
  const newStatus = pageNum >= book.total_pages ? "finished" : "reading";
  await supabase
    .from("books")
    .update({
      current_page: pageNum,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", book_id);

  // 3. Add pages/minutes to rozwoj_entries for this date
  const area = book.type === "listening" ? "sluchanie" : "czytanie";
  const { data: existing } = await supabase
    .from("rozwoj_entries")
    .select("*")
    .eq("area", area)
    .eq("date", date)
    .single();

  if (existing) {
    await supabase
      .from("rozwoj_entries")
      .update({
        amount: existing.amount + pagesRead,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("rozwoj_entries")
      .insert({
        area,
        date,
        amount: pagesRead,
      });
  }

  return NextResponse.json({
    ok: true,
    pages_read: pagesRead,
    book_finished: newStatus === "finished",
  });
}

// GET /api/books/read?book_id=...&days=90 — get reading history for a book
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ readings: [] });
  }

  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("book_id");
  const days = parseInt(searchParams.get("days") || "90");

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  let query = supabase
    .from("book_readings")
    .select("*, books(title, type)")
    .gte("date", sinceStr)
    .order("date", { ascending: false });

  if (bookId) {
    query = query.eq("book_id", bookId);
  }

  const { data, error } = await query;

  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("schema cache")) {
      return NextResponse.json({ readings: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ readings: data });
}
