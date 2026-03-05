"use client";

import { useState, useEffect, useCallback } from "react";
import { BackButton } from "@/components/dashboard/back-button";
import { useGoalsSync, type GoalsSyncState } from "@/lib/storage";
import { monthlyGoals, sportAreas } from "@/lib/data";

/* ── Types ──────────────────────────────────────── */
type Entry = {
  id: string;
  area: string;
  date: string;
  amount: number;
};

type Book = {
  id: string;
  title: string;
  total_pages: number;
  current_page: number;
  status: "reading" | "finished" | "archived";
  type: "reading" | "listening";
  cover_url: string | null;
  created_at: string;
  updated_at: string;
};

type Targets = {
  czytanie: { monthly: number; weekly: number };
  sluchanie: { monthly: number; weekly: number };
  pisanie: { monthly: number; weekly: number };
};

type AreaKey = "czytanie" | "sluchanie" | "pisanie";

const DEFAULT_TARGETS: Targets = {
  czytanie: { monthly: 300, weekly: 75 },
  sluchanie: { monthly: 600, weekly: 150 },
  pisanie: { monthly: 30, weekly: 8 },
};

const AREAS: {
  key: AreaKey;
  name: string;
  icon: string;
  unit: string;
  unitShort: string;
  color: string;
  colorLight: string;
  colorBorder: string;
  placeholder: string;
}[] = [
  {
    key: "czytanie",
    name: "Czytanie",
    icon: "📖",
    unit: "stron",
    unitShort: "str.",
    color: "#8B5CF6",
    colorLight: "#F5F3FF",
    colorBorder: "#DDD6FE",
    placeholder: "Ile stron dzisiaj?",
  },
  {
    key: "sluchanie",
    name: "Sluchanie",
    icon: "🎧",
    unit: "minut",
    unitShort: "min",
    color: "#0EA5E9",
    colorLight: "#F0F9FF",
    colorBorder: "#BAE6FD",
    placeholder: "Ile minut dzisiaj?",
  },
  {
    key: "pisanie",
    name: "Pisanie",
    icon: "✍️",
    unit: "stron",
    unitShort: "str.",
    color: "#F59E0B",
    colorLight: "#FFFBEB",
    colorBorder: "#FDE68A",
    placeholder: "Ile stron dzisiaj?",
  },
];

/* ── Helpers ───────────────────────────────────── */
function today() {
  return new Date().toISOString().split("T")[0];
}

function getMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().split("T")[0];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short", weekday: "short" });
}

function getDaysInMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function getDayOfMonth() {
  return new Date().getDate();
}

const MONTH_NAMES_UPPER = ["STYCZEN", "LUTY", "MARZEC", "KWIECIEN", "MAJ", "CZERWIEC", "LIPIEC", "SIERPIEN", "WRZESIEN", "PAZDZIERNIK", "LISTOPAD", "GRUDZIEN"];
const MONTH_NAMES_GEN = ["styczniu", "lutym", "marcu", "kwietniu", "maju", "czerwcu", "lipcu", "sierpniu", "wrzesniu", "pazdzierniku", "listopadzie", "grudniu"];
const MONTH_NAMES_NOM = ["Styczen", "Luty", "Marzec", "Kwiecien", "Maj", "Czerwiec", "Lipiec", "Sierpien", "Wrzesien", "Pazdziernik", "Listopad", "Grudzien"];

function getMonthUpper() {
  return MONTH_NAMES_UPPER[new Date().getMonth()];
}

function getMonthGenitive() {
  return MONTH_NAMES_GEN[new Date().getMonth()];
}

function getMonthNominative() {
  return MONTH_NAMES_NOM[new Date().getMonth()];
}

/* ── Book Cover helper ─────────────────────────── */
async function fetchCoverUrl(title: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/books/cover?q=${encodeURIComponent(title)}`);
    const data = await res.json();
    return data.cover_url || null;
  } catch {
    return null;
  }
}

function BookCover({ url, title, size = 48 }: { url: string | null; title: string; size?: number }) {
  if (!url) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-lg bg-muted text-lg"
        style={{ width: size, height: size * 1.4 }}
      >
        📖
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={title}
      className="shrink-0 rounded-lg object-cover shadow-sm"
      style={{ width: size, height: size * 1.4 }}
    />
  );
}

/* ── Progress Bar ───────────────────────────────── */
function ProgressBar({
  current,
  target,
  color,
  colorLight,
  height = 10,
}: {
  current: number;
  target: number;
  color: string;
  colorLight: string;
  height?: number;
}) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: colorLight }}
    >
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/* ── Czytanie Card ─────────────────────────────── */
function CzytanieCard({
  entries,
  targets,
  onTargetChange,
  onEntriesChanged,
}: {
  entries: Entry[];
  targets: { monthly: number; weekly: number };
  onTargetChange: (field: "monthly" | "weekly", value: number) => void;
  onEntriesChanged: () => void;
}) {
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readingBookId, setReadingBookId] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState("");
  const [readDate, setReadDate] = useState(today());
  const [showAddBook, setShowAddBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookPages, setNewBookPages] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const [editingTarget, setEditingTarget] = useState<"monthly" | "weekly" | null>(null);
  const [targetDraft, setTargetDraft] = useState("");
  const [bookError, setBookError] = useState<string | null>(null);

  const color = "#8B5CF6";
  const colorLight = "#F5F3FF";

  // Fetch books (with localStorage cache as safety net)
  const fetchBooks = useCallback(async () => {
    // Load cache first so user sees data immediately
    try {
      const cached = localStorage.getItem("dashboard_books_reading_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.books?.length > 0) setBooks(parsed.books);
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch("/api/books");
      const data = await res.json();
      if (data.error) {
        setBookError(data.error);
        return;
      }
      if (data.books) {
        const readingBooks = data.books.filter((b: Book) => b.type !== "listening");
        setBooks(readingBooks);
        setBookError(null);
        if (readingBooks.length > 0) {
          localStorage.setItem("dashboard_books_reading_cache", JSON.stringify({ books: readingBooks }));
        }
      }
    } catch (err) {
      setBookError("Nie udalo sie zaladowac ksiazek — sprawdz polaczenie");
      console.error("Books fetch error:", err);
    } finally {
      setBooksLoading(false);
    }
  }, []);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  // Calculations
  const monthStart = getMonthStart();
  const weekStart = getWeekStart();
  const daysInMonth = getDaysInMonth();
  const dayOfMonth = getDayOfMonth();

  const monthlyDone = entries
    .filter((e) => e.date >= monthStart)
    .reduce((s, e) => s + e.amount, 0);
  const weeklyDone = entries
    .filter((e) => e.date >= weekStart)
    .reduce((s, e) => s + e.amount, 0);
  const todayDone = entries
    .filter((e) => e.date === today())
    .reduce((s, e) => s + e.amount, 0);

  const monthPct = targets.monthly > 0 ? Math.min(Math.round((monthlyDone / targets.monthly) * 100), 100) : 0;
  const dailyTarget = targets.monthly > 0 ? Math.ceil(targets.monthly / daysInMonth) : 0;
  const weeklyTarget = targets.weekly;
  const expectedByNow = dailyTarget * (dayOfMonth - 1) + dailyTarget; // including today
  const ahead = monthlyDone - expectedByNow;

  // Quarter milestones for the progress bar
  const q1 = Math.round(targets.monthly * 0.25);
  const q2 = Math.round(targets.monthly * 0.5);
  const q3 = Math.round(targets.monthly * 0.75);

  const activeBooks = books.filter((b) => b.status === "reading");
  const finishedBooks = books.filter((b) => b.status === "finished");

  // Add book
  const handleAddBook = async () => {
    const title = newBookTitle.trim();
    const pages = parseInt(newBookPages);
    if (!title || isNaN(pages) || pages <= 0) return;

    setSaving(true);
    setBookError(null);
    try {
      const cover_url = await fetchCoverUrl(title);
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, total_pages: pages, type: "reading", cover_url }),
      });
      const data = await res.json();
      if (data.error) {
        setBookError(data.error);
      } else {
        setNewBookTitle("");
        setNewBookPages("");
        setShowAddBook(false);
        await fetchBooks();
      }
    } catch {
      setBookError("Blad dodawania ksiazki");
    }
    setSaving(false);
  };

  // Log reading
  const handleLogReading = async (bookId: string) => {
    const pageNum = parseInt(pageInput);
    const book = books.find((b) => b.id === bookId);
    if (!book || isNaN(pageNum) || pageNum < 0) return;

    setSaving(true);
    setBookError(null);
    try {
      const res = await fetch("/api/books/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: bookId, page_number: pageNum, date: readDate }),
      });
      const data = await res.json();
      if (data.error) {
        setBookError(data.error);
      } else {
        setPageInput("");
        setReadingBookId(null);
        setReadDate(today());
        await fetchBooks();
        onEntriesChanged();
      }
    } catch {
      setBookError("Blad zapisu czytania");
    }
    setSaving(false);
  };

  // Archive/delete book
  const handleArchiveBook = async (id: string) => {
    await fetch("/api/books", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "archived" }),
    });
    await fetchBooks();
  };

  // Current book for reading form
  const readingBook = books.find((b) => b.id === readingBookId);
  const pagesReadPreview =
    readingBook && pageInput
      ? Math.max(0, parseInt(pageInput) - readingBook.current_page)
      : 0;

  return (
    <div className="space-y-4">
      {/* ── Goal Journey Card ── */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6" style={{ borderColor: "#DDD6FE" }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style={{ background: colorLight }}>
              📖
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Czytanie</h3>
              <p className="text-xs text-muted-foreground">
                {monthlyDone} / {targets.monthly} stron w {getMonthGenitive()}
              </p>
            </div>
          </div>
          {todayDone > 0 && (
            <div className="flex flex-col items-center rounded-lg px-3 py-1" style={{ background: colorLight }}>
              <span className="text-lg font-bold" style={{ color }}>
                {todayDone}
              </span>
              <span className="text-[10px] text-muted-foreground">dzisiaj</span>
            </div>
          )}
        </div>

        {/* Big Journey Progress */}
        <div className="mt-5 rounded-xl p-4" style={{ background: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)" }}>
          {/* Percentage + label */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-4xl font-black sm:text-5xl" style={{ color }}>
                {monthPct}%
              </div>
              <div className="mt-0.5 text-sm font-medium text-muted-foreground">
                {monthlyDone} / {targets.monthly} stron
              </div>
            </div>
            <div className="text-right">
              {ahead >= 0 ? (
                <div className="rounded-lg bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                  +{ahead} str. z przodu
                </div>
              ) : (
                <div className="rounded-lg bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">
                  {ahead} str. do nadrobienia
                </div>
              )}
              <div className="mt-1 text-[10px] text-muted-foreground">
                plan na dzien {dayOfMonth}: {expectedByNow} str.
              </div>
            </div>
          </div>

          {/* Thick progress bar with milestones */}
          <div className="relative mt-4">
            <div className="h-5 overflow-hidden rounded-full" style={{ background: "#DDD6FE" }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${targets.monthly > 0 ? Math.min((monthlyDone / targets.monthly) * 100, 100) : 0}%`,
                  background: "linear-gradient(90deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)",
                }}
              />
            </div>
            {/* Milestone markers */}
            {[25, 50, 75].map((pctMark) => (
              <div
                key={pctMark}
                className="absolute top-0 h-5 w-px"
                style={{ left: `${pctMark}%`, background: "#C4B5FD" }}
              />
            ))}
          </div>
          {/* Milestone labels */}
          <div className="mt-1.5 flex justify-between text-[10px] font-medium text-purple-400">
            <span>0</span>
            <span>{q1}</span>
            <span>{q2}</span>
            <span>{q3}</span>
            <span>{targets.monthly}</span>
          </div>
        </div>

        {/* Goal Breakdown: Month / Week / Day */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          {/* Monthly */}
          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-2.5 sm:p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
              {getMonthNominative()}
            </div>
            <div className="mt-1 text-lg font-bold" style={{ color }}>
              {monthlyDone}
              <span className="text-xs font-normal text-muted-foreground"> / </span>
              {editingTarget === "monthly" ? (
                <form className="inline" onSubmit={(e) => {
                  e.preventDefault();
                  const n = parseInt(targetDraft);
                  if (!isNaN(n) && n > 0) onTargetChange("monthly", n);
                  setEditingTarget(null);
                }}>
                  <input autoFocus type="number" min={1} value={targetDraft}
                    onChange={(e) => setTargetDraft(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(targetDraft);
                      if (!isNaN(n) && n > 0) onTargetChange("monthly", n);
                      setEditingTarget(null);
                    }}
                    className="w-14 rounded border border-purple-300 bg-white px-1 py-0 text-lg font-bold text-right"
                    style={{ color }} />
                </form>
              ) : (
                <button onClick={() => { setTargetDraft(String(targets.monthly)); setEditingTarget("monthly"); }}
                  className="cursor-pointer hover:underline" style={{ color }}>
                  {targets.monthly}
                </button>
              )}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">str.</div>
            <ProgressBar current={monthlyDone} target={targets.monthly} color={color} colorLight={colorLight} height={4} />
          </div>

          {/* Weekly */}
          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-2.5 sm:p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
              Tydzien
            </div>
            <div className="mt-1 text-lg font-bold" style={{ color }}>
              {weeklyDone}
              <span className="text-xs font-normal text-muted-foreground"> / </span>
              {editingTarget === "weekly" ? (
                <form className="inline" onSubmit={(e) => {
                  e.preventDefault();
                  const n = parseInt(targetDraft);
                  if (!isNaN(n) && n > 0) onTargetChange("weekly", n);
                  setEditingTarget(null);
                }}>
                  <input autoFocus type="number" min={1} value={targetDraft}
                    onChange={(e) => setTargetDraft(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(targetDraft);
                      if (!isNaN(n) && n > 0) onTargetChange("weekly", n);
                      setEditingTarget(null);
                    }}
                    className="w-14 rounded border border-purple-300 bg-white px-1 py-0 text-lg font-bold text-right"
                    style={{ color }} />
                </form>
              ) : (
                <button onClick={() => { setTargetDraft(String(weeklyTarget)); setEditingTarget("weekly"); }}
                  className="cursor-pointer hover:underline" style={{ color }}>
                  {weeklyTarget}
                </button>
              )}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">str.</div>
            <ProgressBar current={weeklyDone} target={weeklyTarget} color={color} colorLight={colorLight} height={4} />
          </div>

          {/* Daily */}
          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-2.5 sm:p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
              Dzisiaj
            </div>
            <div className="mt-1 text-lg font-bold" style={{ color }}>
              {todayDone}
              <span className="text-xs font-normal text-muted-foreground"> / </span>
              <span style={{ color }}>{dailyTarget}</span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">str.</div>
            <ProgressBar current={todayDone} target={dailyTarget} color={color} colorLight={colorLight} height={4} />
          </div>
        </div>
      </div>

      {/* ── Books Card ── */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6" style={{ borderColor: "#DDD6FE" }}>
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-foreground">Moje ksiazki</h4>
          <button
            onClick={() => setShowAddBook((v) => !v)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all active:scale-95"
            style={{ background: color }}
          >
            {showAddBook ? "Anuluj" : "+ Nowa ksiazka"}
          </button>
        </div>

        {/* Error */}
        {bookError && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {bookError}
          </div>
        )}

        {/* Add book form */}
        {showAddBook && (
          <form
            className="mt-3 flex flex-col gap-2 rounded-xl border border-purple-200 bg-purple-50/50 p-3 sm:flex-row sm:items-end"
            onSubmit={(e) => { e.preventDefault(); handleAddBook(); }}
          >
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tytul
              </label>
              <input
                autoFocus
                value={newBookTitle}
                onChange={(e) => setNewBookTitle(e.target.value)}
                placeholder="Tytul ksiazki"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>
            <div className="w-full sm:w-28">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Stron
              </label>
              <input
                type="number"
                min={1}
                value={newBookPages}
                onChange={(e) => setNewBookPages(e.target.value)}
                placeholder="np. 350"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
              style={{ background: color }}
            >
              {saving ? "..." : "Dodaj ksiazke"}
            </button>
          </form>
        )}

        {/* Books list */}
        {booksLoading ? (
          <div className="mt-4 text-center text-xs text-muted-foreground">Ladowanie ksiazek...</div>
        ) : activeBooks.length === 0 && !showAddBook ? (
          <div className="mt-4 rounded-xl border border-dashed border-purple-200 bg-purple-50/30 p-6 text-center">
            <div className="text-2xl">📚</div>
            <p className="mt-2 text-sm text-muted-foreground">Dodaj pierwsza ksiazke, zeby sledzic postepy w czytaniu</p>
            <button
              onClick={() => setShowAddBook(true)}
              className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95"
              style={{ background: color }}
            >
              + Dodaj ksiazke
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {activeBooks.map((book) => {
              const bookPct = book.total_pages > 0
                ? Math.round((book.current_page / book.total_pages) * 100)
                : 0;
              const isReading = readingBookId === book.id;

              return (
                <div key={book.id} className="rounded-xl border border-purple-100 bg-white p-3 transition-all">
                  {/* Book info row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <BookCover url={book.cover_url} title={book.title} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">{book.title}</div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            str. {book.current_page} / {book.total_pages}
                          </span>
                          <span className="text-xs font-medium" style={{ color }}>
                            {bookPct}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!isReading && (
                        <button
                          onClick={() => { setReadingBookId(book.id); setPageInput(""); setReadDate(today()); }}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all active:scale-95"
                          style={{ background: color }}
                        >
                          Czytaj
                        </button>
                      )}
                      <button
                        onClick={() => handleArchiveBook(book.id)}
                        className="rounded p-1 text-xs text-muted-foreground transition-colors hover:text-red-500"
                        title="Archiwizuj"
                      >
                        &#10005;
                      </button>
                    </div>
                  </div>

                  {/* Book progress bar */}
                  <div className="mt-2">
                    <ProgressBar
                      current={book.current_page}
                      target={book.total_pages}
                      color={color}
                      colorLight={colorLight}
                      height={6}
                    />
                  </div>

                  {/* Reading form (expanded) */}
                  {isReading && (
                    <form
                      className="mt-3 rounded-lg p-3"
                      style={{ background: colorLight }}
                      onSubmit={(e) => { e.preventDefault(); handleLogReading(book.id); }}
                    >
                      <div className="text-xs font-medium text-muted-foreground">
                        Na ktorej stronie skonczyles?
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          autoFocus
                          type="number"
                          min={0}
                          max={book.total_pages}
                          value={pageInput}
                          onChange={(e) => setPageInput(e.target.value)}
                          placeholder={`${book.current_page + 1} - ${book.total_pages}`}
                          className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-300"
                        />
                        <input
                          type="date"
                          value={readDate}
                          onChange={(e) => setReadDate(e.target.value)}
                          className="w-[130px] rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={saving || !pageInput}
                          className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
                          style={{ background: color }}
                        >
                          {saving ? "..." : "Zapisz"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReadingBookId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Anuluj
                        </button>
                      </div>
                      {/* Preview of pages read */}
                      {pageInput && pagesReadPreview > 0 && (
                        <div className="mt-2 text-xs font-medium" style={{ color }}>
                          +{pagesReadPreview} stron przeczytanych
                        </div>
                      )}
                      {pageInput && pagesReadPreview === 0 && parseInt(pageInput) <= readingBook!.current_page && (
                        <div className="mt-2 text-xs text-orange-600">
                          Korekta pozycji (strony nie zostana dodane do celu)
                        </div>
                      )}
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Finished books */}
        {finishedBooks.length > 0 && (
          <>
            <button
              onClick={() => setShowFinished((v) => !v)}
              className="mt-3 w-full rounded-lg border border-border py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
            >
              {showFinished ? "Ukryj ukonczone" : `Ukonczone ksiazki (${finishedBooks.length})`}
            </button>
            {showFinished && (
              <div className="mt-2 space-y-1.5">
                {finishedBooks.map((book) => (
                  <div key={book.id} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <BookCover url={book.cover_url} title={book.title} size={24} />
                      <span className="text-sm font-medium text-foreground">{book.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{book.total_pages} str.</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Sluchanie Card (audiobooks with minutes) ───── */
function SluchanieCard({
  entries,
  targets,
  onTargetChange,
  onEntriesChanged,
}: {
  entries: Entry[];
  targets: { monthly: number; weekly: number };
  onTargetChange: (field: "monthly" | "weekly", value: number) => void;
  onEntriesChanged: () => void;
}) {
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listeningBookId, setListeningBookId] = useState<string | null>(null);
  const [listenHours, setListenHours] = useState("");
  const [listenMins, setListenMins] = useState("");
  const [listenDate, setListenDate] = useState(today());
  const [showAddBook, setShowAddBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookHours, setNewBookHours] = useState("");
  const [newBookMins, setNewBookMins] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const [editingTarget, setEditingTarget] = useState<"monthly" | "weekly" | null>(null);
  const [targetDraft, setTargetDraft] = useState("");
  const [bookError, setBookError] = useState<string | null>(null);

  const color = "#0EA5E9";
  const colorLight = "#F0F9FF";

  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch("/api/books");
      const data = await res.json();
      if (data.books) {
        setBooks(data.books.filter((b: Book) => b.type === "listening"));
        setBookError(null);
      }
    } catch (err) {
      setBookError("Nie udalo sie zaladowac audiobookow");
      console.error("Audiobooks fetch error:", err);
    } finally {
      setBooksLoading(false);
    }
  }, []);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  const monthStart = getMonthStart();
  const weekStart = getWeekStart();
  const daysInMonth = getDaysInMonth();
  const dayOfMonth = getDayOfMonth();

  const monthlyDone = entries
    .filter((e) => e.date >= monthStart)
    .reduce((s, e) => s + e.amount, 0);
  const weeklyDone = entries
    .filter((e) => e.date >= weekStart)
    .reduce((s, e) => s + e.amount, 0);
  const todayDone = entries
    .filter((e) => e.date === today())
    .reduce((s, e) => s + e.amount, 0);

  const monthPct = targets.monthly > 0 ? Math.min(Math.round((monthlyDone / targets.monthly) * 100), 100) : 0;
  const dailyTarget = targets.monthly > 0 ? Math.ceil(targets.monthly / daysInMonth) : 0;
  const weeklyTarget = targets.weekly;
  const expectedByNow = dailyTarget * dayOfMonth;
  const ahead = monthlyDone - expectedByNow;

  const q1 = Math.round(targets.monthly * 0.25);
  const q2 = Math.round(targets.monthly * 0.5);
  const q3 = Math.round(targets.monthly * 0.75);

  const activeBooks = books.filter((b) => b.status === "reading");
  const finishedBooks = books.filter((b) => b.status === "finished");

  const handleAddBook = async () => {
    const title = newBookTitle.trim();
    const h = parseInt(newBookHours) || 0;
    const m = parseInt(newBookMins) || 0;
    const minutes = h * 60 + m;
    if (!title || minutes <= 0) return;

    setSaving(true);
    setBookError(null);
    try {
      const cover_url = await fetchCoverUrl(title);
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, total_pages: minutes, type: "listening", cover_url }),
      });
      const data = await res.json();
      if (data.error) {
        setBookError(data.error);
      } else {
        setNewBookTitle("");
        setNewBookHours("");
        setNewBookMins("");
        setShowAddBook(false);
        await fetchBooks();
      }
    } catch {
      setBookError("Blad dodawania audiobooka");
    }
    setSaving(false);
  };

  const handleLogListening = async (bookId: string) => {
    const h = parseInt(listenHours) || 0;
    const m = parseInt(listenMins) || 0;
    const mins = h * 60 + m;
    const book = books.find((b) => b.id === bookId);
    if (!book || mins <= 0) return;

    const newPage = book.current_page + mins;

    setSaving(true);
    setBookError(null);
    try {
      const res = await fetch("/api/books/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: bookId, page_number: newPage, date: listenDate }),
      });
      const data = await res.json();
      if (data.error) {
        setBookError(data.error);
      } else {
        setListenHours("");
        setListenMins("");
        setListeningBookId(null);
        setListenDate(today());
        await fetchBooks();
        onEntriesChanged();
      }
    } catch {
      setBookError("Blad zapisu sluchania");
    }
    setSaving(false);
  };

  const handleArchiveBook = async (id: string) => {
    await fetch("/api/books", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "archived" }),
    });
    await fetchBooks();
  };

  function formatMinutes(mins: number) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  }

  return (
    <div className="space-y-4">
      {/* Goal Journey Card */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6" style={{ borderColor: "#BAE6FD" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style={{ background: colorLight }}>
              🎧
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Sluchanie</h3>
              <p className="text-xs text-muted-foreground">
                {monthlyDone} / {targets.monthly} min w {getMonthGenitive()}
              </p>
            </div>
          </div>
          {todayDone > 0 && (
            <div className="flex flex-col items-center rounded-lg px-3 py-1" style={{ background: colorLight }}>
              <span className="text-lg font-bold" style={{ color }}>
                {todayDone}
              </span>
              <span className="text-[10px] text-muted-foreground">dzisiaj</span>
            </div>
          )}
        </div>

        {/* Big Journey Progress */}
        <div className="mt-5 rounded-xl p-4" style={{ background: "linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)" }}>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-4xl font-black sm:text-5xl" style={{ color }}>
                {monthPct}%
              </div>
              <div className="mt-0.5 text-sm font-medium text-muted-foreground">
                {formatMinutes(monthlyDone)} / {formatMinutes(targets.monthly)}
              </div>
            </div>
            <div className="text-right">
              {ahead >= 0 ? (
                <div className="rounded-lg bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                  +{ahead} min z przodu
                </div>
              ) : (
                <div className="rounded-lg bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">
                  {ahead} min do nadrobienia
                </div>
              )}
              <div className="mt-1 text-[10px] text-muted-foreground">
                plan na dzien {dayOfMonth}: {expectedByNow} min
              </div>
            </div>
          </div>

          <div className="relative mt-4">
            <div className="h-5 overflow-hidden rounded-full" style={{ background: "#BAE6FD" }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${targets.monthly > 0 ? Math.min((monthlyDone / targets.monthly) * 100, 100) : 0}%`,
                  background: "linear-gradient(90deg, #0EA5E9 0%, #0284C7 50%, #0369A1 100%)",
                }}
              />
            </div>
            {[25, 50, 75].map((pctMark) => (
              <div
                key={pctMark}
                className="absolute top-0 h-5 w-px"
                style={{ left: `${pctMark}%`, background: "#7DD3FC" }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] font-medium text-sky-400">
            <span>0</span>
            <span>{q1}</span>
            <span>{q2}</span>
            <span>{q3}</span>
            <span>{targets.monthly}</span>
          </div>
        </div>

        {/* Goal Breakdown: Month / Week / Day */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-2.5 sm:p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-400">
              {getMonthNominative()}
            </div>
            <div className="mt-1 text-lg font-bold" style={{ color }}>
              {monthlyDone}
              <span className="text-xs font-normal text-muted-foreground"> / </span>
              {editingTarget === "monthly" ? (
                <form className="inline" onSubmit={(e) => {
                  e.preventDefault();
                  const n = parseInt(targetDraft);
                  if (!isNaN(n) && n > 0) onTargetChange("monthly", n);
                  setEditingTarget(null);
                }}>
                  <input autoFocus type="number" min={1} value={targetDraft}
                    onChange={(e) => setTargetDraft(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(targetDraft);
                      if (!isNaN(n) && n > 0) onTargetChange("monthly", n);
                      setEditingTarget(null);
                    }}
                    className="w-14 rounded border border-sky-300 bg-white px-1 py-0 text-lg font-bold text-right"
                    style={{ color }} />
                </form>
              ) : (
                <button onClick={() => { setTargetDraft(String(targets.monthly)); setEditingTarget("monthly"); }}
                  className="cursor-pointer hover:underline" style={{ color }}>
                  {targets.monthly}
                </button>
              )}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">min</div>
            <ProgressBar current={monthlyDone} target={targets.monthly} color={color} colorLight={colorLight} height={4} />
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-2.5 sm:p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-400">
              Tydzien
            </div>
            <div className="mt-1 text-lg font-bold" style={{ color }}>
              {weeklyDone}
              <span className="text-xs font-normal text-muted-foreground"> / </span>
              {editingTarget === "weekly" ? (
                <form className="inline" onSubmit={(e) => {
                  e.preventDefault();
                  const n = parseInt(targetDraft);
                  if (!isNaN(n) && n > 0) onTargetChange("weekly", n);
                  setEditingTarget(null);
                }}>
                  <input autoFocus type="number" min={1} value={targetDraft}
                    onChange={(e) => setTargetDraft(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(targetDraft);
                      if (!isNaN(n) && n > 0) onTargetChange("weekly", n);
                      setEditingTarget(null);
                    }}
                    className="w-14 rounded border border-sky-300 bg-white px-1 py-0 text-lg font-bold text-right"
                    style={{ color }} />
                </form>
              ) : (
                <button onClick={() => { setTargetDraft(String(weeklyTarget)); setEditingTarget("weekly"); }}
                  className="cursor-pointer hover:underline" style={{ color }}>
                  {weeklyTarget}
                </button>
              )}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">min</div>
            <ProgressBar current={weeklyDone} target={weeklyTarget} color={color} colorLight={colorLight} height={4} />
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-2.5 sm:p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-400">
              Dzisiaj
            </div>
            <div className="mt-1 text-lg font-bold" style={{ color }}>
              {todayDone}
              <span className="text-xs font-normal text-muted-foreground"> / </span>
              <span style={{ color }}>{dailyTarget}</span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">min</div>
            <ProgressBar current={todayDone} target={dailyTarget} color={color} colorLight={colorLight} height={4} />
          </div>
        </div>
      </div>

      {/* Audiobooks Card */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6" style={{ borderColor: "#BAE6FD" }}>
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-foreground">Moje audiobooki</h4>
          <button
            onClick={() => setShowAddBook((v) => !v)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all active:scale-95"
            style={{ background: color }}
          >
            {showAddBook ? "Anuluj" : "+ Nowy audiobook"}
          </button>
        </div>

        {bookError && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {bookError}
          </div>
        )}

        {showAddBook && (
          <form
            className="mt-3 flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50/50 p-3 sm:flex-row sm:items-end"
            onSubmit={(e) => { e.preventDefault(); handleAddBook(); }}
          >
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tytul
              </label>
              <input
                autoFocus
                value={newBookTitle}
                onChange={(e) => setNewBookTitle(e.target.value)}
                placeholder="Tytul audiobooka"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
            <div className="w-full sm:w-20">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Godz
              </label>
              <input
                type="number"
                min={0}
                value={newBookHours}
                onChange={(e) => setNewBookHours(e.target.value)}
                placeholder="8"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
            <div className="w-full sm:w-20">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Min
              </label>
              <input
                type="number"
                min={0}
                max={59}
                value={newBookMins}
                onChange={(e) => setNewBookMins(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
              style={{ background: color }}
            >
              {saving ? "..." : "Dodaj audiobook"}
            </button>
          </form>
        )}

        {booksLoading ? (
          <div className="mt-4 text-center text-xs text-muted-foreground">Ladowanie audiobookow...</div>
        ) : activeBooks.length === 0 && !showAddBook ? (
          <div className="mt-4 rounded-xl border border-dashed border-sky-200 bg-sky-50/30 p-6 text-center">
            <div className="text-2xl">🎧</div>
            <p className="mt-2 text-sm text-muted-foreground">Dodaj pierwszy audiobook</p>
            <button
              onClick={() => setShowAddBook(true)}
              className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95"
              style={{ background: color }}
            >
              + Dodaj audiobook
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {activeBooks.map((book) => {
              const bookPct = book.total_pages > 0
                ? Math.round((book.current_page / book.total_pages) * 100)
                : 0;
              const isListening = listeningBookId === book.id;

              return (
                <div key={book.id} className="rounded-xl border border-sky-100 bg-white p-3 transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <BookCover url={book.cover_url} title={book.title} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">{book.title}</div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatMinutes(book.current_page)} / {formatMinutes(book.total_pages)}
                          </span>
                          <span className="text-xs font-medium" style={{ color }}>
                            {bookPct}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!isListening && (
                        <button
                          onClick={() => { setListeningBookId(book.id); setListenHours(""); setListenMins(""); setListenDate(today()); }}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all active:scale-95"
                          style={{ background: color }}
                        >
                          Sluchaj
                        </button>
                      )}
                      <button
                        onClick={() => handleArchiveBook(book.id)}
                        className="rounded p-1 text-xs text-muted-foreground transition-colors hover:text-red-500"
                        title="Archiwizuj"
                      >
                        &#10005;
                      </button>
                    </div>
                  </div>

                  <div className="mt-2">
                    <ProgressBar
                      current={book.current_page}
                      target={book.total_pages}
                      color={color}
                      colorLight={colorLight}
                      height={6}
                    />
                  </div>

                  {isListening && (
                    <form
                      className="mt-3 rounded-lg p-3"
                      style={{ background: colorLight }}
                      onSubmit={(e) => { e.preventDefault(); handleLogListening(book.id); }}
                    >
                      <div className="text-xs font-medium text-muted-foreground">
                        Ile dzisiaj sluchales?
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            type="number"
                            min={0}
                            value={listenHours}
                            onChange={(e) => setListenHours(e.target.value)}
                            placeholder="0"
                            className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-300"
                          />
                          <span className="text-xs text-muted-foreground">h</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={59}
                            value={listenMins}
                            onChange={(e) => setListenMins(e.target.value)}
                            placeholder="30"
                            className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-300"
                          />
                          <span className="text-xs text-muted-foreground">min</span>
                        </div>
                        <input
                          type="date"
                          value={listenDate}
                          onChange={(e) => setListenDate(e.target.value)}
                          className="w-[130px] rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={saving || ((parseInt(listenHours) || 0) * 60 + (parseInt(listenMins) || 0) <= 0)}
                          className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
                          style={{ background: color }}
                        >
                          {saving ? "..." : "Zapisz"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setListeningBookId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Anuluj
                        </button>
                      </div>
                      {((parseInt(listenHours) || 0) * 60 + (parseInt(listenMins) || 0)) > 0 && (
                        <div className="mt-2 text-xs font-medium" style={{ color }}>
                          +{formatMinutes((parseInt(listenHours) || 0) * 60 + (parseInt(listenMins) || 0))} sluchania
                        </div>
                      )}
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {finishedBooks.length > 0 && (
          <>
            <button
              onClick={() => setShowFinished((v) => !v)}
              className="mt-3 w-full rounded-lg border border-border py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
            >
              {showFinished ? "Ukryj ukonczone" : `Ukonczone audiobooki (${finishedBooks.length})`}
            </button>
            {showFinished && (
              <div className="mt-2 space-y-1.5">
                {finishedBooks.map((book) => (
                  <div key={book.id} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <BookCover url={book.cover_url} title={book.title} size={24} />
                      <span className="text-sm font-medium text-foreground">{book.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatMinutes(book.total_pages)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Area Card (for Pisanie) ────────────────────── */
function AreaCard({
  area,
  entries,
  targets,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onTargetChange,
  saving,
}: {
  area: (typeof AREAS)[number];
  entries: Entry[];
  targets: { monthly: number; weekly: number };
  onAddEntry: (area: AreaKey, date: string, amount: number) => void;
  onEditEntry: (area: AreaKey, date: string, amount: number) => void;
  onDeleteEntry: (id: string) => void;
  onTargetChange: (field: "monthly" | "weekly", value: number) => void;
  saving: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [showHistory, setShowHistory] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editingTarget, setEditingTarget] = useState<"monthly" | "weekly" | null>(null);
  const [targetDraft, setTargetDraft] = useState("");

  const monthStart = getMonthStart();
  const weekStart = getWeekStart();

  const monthlyDone = entries
    .filter((e) => e.date >= monthStart)
    .reduce((s, e) => s + e.amount, 0);
  const weeklyDone = entries
    .filter((e) => e.date >= weekStart)
    .reduce((s, e) => s + e.amount, 0);

  const monthPct = targets.monthly > 0 ? Math.round((monthlyDone / targets.monthly) * 100) : 0;
  const weekPct = targets.weekly > 0 ? Math.round((weeklyDone / targets.weekly) * 100) : 0;

  const todayEntry = entries.find((e) => e.date === today());

  const handleSubmit = () => {
    const n = parseInt(amount);
    if (!isNaN(n) && n > 0) {
      const existing = entries.find((e) => e.date === date);
      if (existing) {
        onEditEntry(area.key, date, existing.amount + n);
      } else {
        onAddEntry(area.key, date, n);
      }
      setAmount("");
      setDate(today());
    }
  };

  const historyEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  return (
    <div
      className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
      style={{ borderColor: area.colorBorder }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
            style={{ background: area.colorLight }}
          >
            {area.icon}
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">{area.name}</h3>
            <p className="text-xs text-muted-foreground">
              {monthlyDone} / {targets.monthly} {area.unit} w {getMonthGenitive()}
            </p>
          </div>
        </div>
        {todayEntry && (
          <div className="flex flex-col items-center rounded-lg px-3 py-1" style={{ background: area.colorLight }}>
            <span className="text-lg font-bold" style={{ color: area.color }}>{todayEntry.amount}</span>
            <span className="text-[10px] text-muted-foreground">dzisiaj</span>
          </div>
        )}
      </div>

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
      >
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={area.placeholder}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as string]: area.color + "40" } as React.CSSProperties}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-[130px] shrink-0 rounded-lg border border-border bg-background px-2 py-2.5 text-xs text-foreground focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-95 disabled:opacity-50"
          style={{ background: area.color }}
        >
          {saving ? "..." : "Dodaj"}
        </button>
      </form>

      {/* Monthly progress */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {getMonthNominative()}
          </span>
          <span className="text-sm font-medium" style={{ color: area.color }}>
            {monthPct}%
          </span>
        </div>
        <ProgressBar
          current={monthlyDone}
          target={targets.monthly}
          color={area.color}
          colorLight={area.colorLight}
          height={10}
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{monthlyDone} / {targets.monthly} {area.unitShort}</span>
          {editingTarget === "monthly" ? (
            <form className="inline-flex items-center gap-1" onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(targetDraft);
              if (!isNaN(n) && n > 0) onTargetChange("monthly", n);
              setEditingTarget(null);
            }}>
              <input autoFocus type="number" min={1} value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                onBlur={() => {
                  const n = parseInt(targetDraft);
                  if (!isNaN(n) && n > 0) onTargetChange("monthly", n);
                  setEditingTarget(null);
                }}
                className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-right" />
              <span className="text-[10px]">{area.unitShort}</span>
            </form>
          ) : (
            <button onClick={() => { setTargetDraft(String(targets.monthly)); setEditingTarget("monthly"); }}
              className="hover:underline">cel: {targets.monthly}</button>
          )}
        </div>
      </div>

      {/* Weekly progress */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tydzien
          </span>
          <span className="text-sm font-medium" style={{ color: area.color }}>
            {weekPct}%
          </span>
        </div>
        <ProgressBar
          current={weeklyDone}
          target={targets.weekly}
          color={area.color}
          colorLight={area.colorLight}
          height={7}
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{weeklyDone} / {targets.weekly} {area.unitShort}</span>
          {editingTarget === "weekly" ? (
            <form className="inline-flex items-center gap-1" onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(targetDraft);
              if (!isNaN(n) && n > 0) onTargetChange("weekly", n);
              setEditingTarget(null);
            }}>
              <input autoFocus type="number" min={1} value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                onBlur={() => {
                  const n = parseInt(targetDraft);
                  if (!isNaN(n) && n > 0) onTargetChange("weekly", n);
                  setEditingTarget(null);
                }}
                className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-right" />
              <span className="text-[10px]">{area.unitShort}</span>
            </form>
          ) : (
            <button onClick={() => { setTargetDraft(String(targets.weekly)); setEditingTarget("weekly"); }}
              className="hover:underline">cel: {targets.weekly}</button>
          )}
        </div>
      </div>

      {/* History toggle */}
      <button
        onClick={() => setShowHistory((v) => !v)}
        className="mt-4 w-full rounded-lg border border-border py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
      >
        {showHistory ? "Ukryj historie" : `Historia wpisow (${entries.length})`}
      </button>

      {showHistory && (
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {historyEntries.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">Brak wpisow</p>
          )}
          {historyEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2"
            >
              <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
              {editingId === entry.id ? (
                <form className="inline-flex items-center gap-1" onSubmit={(e) => {
                  e.preventDefault();
                  const n = parseInt(editDraft);
                  if (!isNaN(n) && n > 0) onEditEntry(area.key, entry.date, n);
                  setEditingId(null);
                }}>
                  <input autoFocus type="number" min={0} value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(editDraft);
                      if (!isNaN(n) && n > 0) onEditEntry(area.key, entry.date, n);
                      setEditingId(null);
                    }}
                    className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-right" />
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditDraft(String(entry.amount)); setEditingId(entry.id); }}
                    className="text-sm font-semibold transition-colors hover:opacity-70"
                    style={{ color: area.color }}
                  >
                    {entry.amount} {area.unitShort}
                  </button>
                  <button
                    onClick={() => onDeleteEntry(entry.id)}
                    className="rounded p-0.5 text-xs text-muted-foreground transition-colors hover:text-red-500"
                    title="Usun"
                  >
                    &#10005;
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────── */
export default function RozwojPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goalsDefaults: GoalsSyncState = {
    goals: {
      activeCalories: { ...monthlyGoals.activeCalories },
      cycling: { ...monthlyGoals.cycling },
      running: { ...monthlyGoals.running },
      competition: { ...monthlyGoals.competition },
      competitions: [],
    },
    gymDays: sportAreas[0].weekDays,
    gymWeeklyGoal: sportAreas[0].weeklyGoal,
    gymMonthlyGoal: sportAreas[0].monthlyGoal,
    gymMonthlyDone: sportAreas[0].current,
    runWeeklyGoal: sportAreas[1].weeklyGoal,
    runMonthlyGoal: sportAreas[1].monthlyGoal,
    bikeWeeklyGoal: sportAreas[2].weeklyGoal,
    bikeMonthlyGoal: sportAreas[2].monthlyGoal,
    rozwojTargets: DEFAULT_TARGETS,
    runEntries: [0, 0, 0, 0, 0, 0, 0],
    bikeEntries: [0, 0, 0, 0, 0, 0, 0],
  };
  const { state: gs, setState: setGs } = useGoalsSync(goalsDefaults);
  const targets = gs.rozwojTargets;
  const setTargets = (updater: Targets | ((prev: Targets) => Targets)) => {
    setGs((prev) => ({
      ...prev,
      rozwojTargets: typeof updater === "function" ? updater(prev.rozwojTargets) : updater,
    }));
  };

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/rozwoj?days=365");
      const data = await res.json();
      if (data.error) {
        setError(`Blad ladowania: ${data.error}`);
      } else {
        if (data.entries) setEntries(data.entries);
        if (data.warning) setError(data.warning);
        else setError(null);
      }
    } catch (err) {
      setError(`Brak polaczenia z baza: ${err instanceof Error ? err.message : "nieznany blad"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const addEntry = async (area: AreaKey, date: string, amount: number) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/rozwoj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, date, amount }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(`Nie udalo sie zapisac: ${data.error || res.statusText}`);
        setSaving(false);
        return;
      }
      await fetchEntries();
    } catch (err) {
      setError(`Blad zapisu: ${err instanceof Error ? err.message : "nieznany blad"}`);
    }
    setSaving(false);
  };

  const editEntry = async (area: AreaKey, date: string, amount: number) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/rozwoj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, date, amount }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(`Nie udalo sie edytowac: ${data.error || res.statusText}`);
        setSaving(false);
        return;
      }
      await fetchEntries();
    } catch (err) {
      setError(`Blad edycji: ${err instanceof Error ? err.message : "nieznany blad"}`);
    }
    setSaving(false);
  };

  const deleteEntry = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/rozwoj?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(`Nie udalo sie usunac: ${data.error || res.statusText}`);
        setSaving(false);
        return;
      }
      await fetchEntries();
    } catch (err) {
      setError(`Blad usuwania: ${err instanceof Error ? err.message : "nieznany blad"}`);
    }
    setSaving(false);
  };

  const updateTarget = (area: AreaKey, field: "monthly" | "weekly", value: number) => {
    setTargets((prev) => ({
      ...prev,
      [area]: { ...prev[area], [field]: value },
    }));
  };

  // Compute totals for summary
  const monthStart = getMonthStart();
  const monthEntries = entries.filter((e) => e.date >= monthStart);

  const areaTotals = AREAS.map((a) => {
    const total = monthEntries.filter((e) => e.area === a.key).reduce((s, e) => s + e.amount, 0);
    const target = targets[a.key].monthly;
    return { ...a, total, target, pct: target > 0 ? Math.round((total / target) * 100) : 0 };
  });

  const overallPct = areaTotals.reduce((s, a) => s + Math.min(a.pct, 100), 0) / AREAS.length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Ladowanie...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <BackButton />

        {/* Header */}
        <div className="mt-6 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Rozwoj Osobisty
          </div>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-foreground sm:text-5xl">
            {getMonthUpper()} {new Date().getFullYear()}
          </h1>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Summary */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-3 text-center sm:p-4">
            <div className="text-2xl font-black text-purple-600 sm:text-3xl">
              {Math.round(overallPct)}%
            </div>
            <div className="mt-1 text-[10px] font-medium text-purple-400 sm:text-xs">
              Cel miesieczny
            </div>
          </div>
          {areaTotals.map((a) => (
            <div
              key={a.key}
              className="rounded-2xl border p-3 text-center sm:p-4"
              style={{ borderColor: a.colorBorder, background: a.colorLight + "80" }}
            >
              <div className="text-xl sm:text-2xl">{a.icon}</div>
              <div className="mt-0.5 text-xl font-bold sm:text-2xl" style={{ color: a.color }}>
                {a.pct}%
              </div>
              <div className="text-[10px] text-muted-foreground sm:text-xs">
                {a.total}/{a.target} {a.unitShort}
              </div>
            </div>
          ))}
        </div>

        {/* Area Cards */}
        <div className="mt-6 grid gap-4 sm:gap-6">
          {/* Czytanie — special card with book tracking */}
          <CzytanieCard
            entries={entries.filter((e) => e.area === "czytanie")}
            targets={targets.czytanie}
            onTargetChange={(field, value) => updateTarget("czytanie", field, value)}
            onEntriesChanged={fetchEntries}
          />

          {/* Sluchanie — audiobook card */}
          <SluchanieCard
            entries={entries.filter((e) => e.area === "sluchanie")}
            targets={targets.sluchanie}
            onTargetChange={(field, value) => updateTarget("sluchanie", field, value)}
            onEntriesChanged={fetchEntries}
          />

          {/* Pisanie — standard card */}
          {AREAS.filter((a) => a.key === "pisanie").map((a) => (
            <AreaCard
              key={a.key}
              area={a}
              entries={entries.filter((e) => e.area === a.key)}
              targets={targets[a.key]}
              onAddEntry={addEntry}
              onEditEntry={editEntry}
              onDeleteEntry={deleteEntry}
              onTargetChange={(field, value) => updateTarget(a.key, field, value)}
              saving={saving}
            />
          ))}
        </div>

        {/* Footer */}
        <p className="mt-10 text-center text-sm italic text-muted-foreground">
          &ldquo;Liderzy sa czytelnikami.&rdquo; &mdash; Harry S. Truman
        </p>
      </div>
    </div>
  );
}
