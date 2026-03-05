import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/books?status=reading
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ books: [] });
  }

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
    if (error.message.includes("does not exist") || error.message.includes("schema cache")) {
      return NextResponse.json({ books: [], tableNotFound: true });
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
