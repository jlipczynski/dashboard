// Weekly Planner regressions: hydration (no date in the server HTML), current week in Europe/Warsaw,
// and visible errors + undo when saving, editing, deleting or moving a task fails. fetch is mocked:
// nothing is written anywhere.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import React from "react";
import WeeklyPlanner from "../components/WeeklyPlanner.jsx";

// WeeklyPlanner.jsx is compiled by Vitest with the classic JSX runtime (React.createElement); Next uses the automatic one.
(globalThis as unknown as { React: typeof React }).React = React;

vi.mock("recharts", () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nil = () => null;
  return { ResponsiveContainer: Box, BarChart: Box, Bar: Box, XAxis: Nil, YAxis: Nil, Tooltip: Nil, Cell: Nil, CartesianGrid: Nil };
});

const TASK = { id: "t1", task: "Zadanie testowe", project: "Plantacja", priority: "A", sub_priority: 1, wig_id: "", deadline: null, person: null, status: "todo", notes: "", points: 4 };
const STATS = { current: { tasks_done: 0, tasks_total: 1, points_done: 0, points_total: 4, ab_done: 0, ab_total: 1, ab_success: false }, history: [] };

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined;
let calls: { url: string; method: string }[] = [];
function mockFetch(override: Handler = () => undefined) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      const o = override(url, init);
      const r = o ?? (url.startsWith("/api/weekly/stats") ? { status: 200, body: STATS } : url.startsWith("/api/weekly/tasks") && method === "GET" ? { status: 200, body: { tasks: [TASK] } } : { status: 200, body: { status: "ok" } });
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T23:30:00Z")); // Monday 23.11, 00:30 in Warsaw (UTC+1) — UTC still says Sunday
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const openTask = async () => {
  fireEvent.click(await screen.findByText("Zadanie testowe"));
};

describe("hydration and the current week", () => {
  it("the server HTML contains no date-dependent week label (the week is set only in the browser)", () => {
    mockFetch();
    const html = renderToString(<WeeklyPlanner />);
    expect(html).not.toMatch(/listopada|W4\d/);
    expect(html).not.toContain("Dziś");
  });

  it("after mounting shows the Warsaw week (23–29 listopada, W48), loads it, and hides „Dziś” on the current week", async () => {
    mockFetch();
    render(<WeeklyPlanner />);
    expect(await screen.findByText("23 listopada — 29 listopada")).toBeTruthy();
    expect(screen.getByText("W48 · 2026")).toBeTruthy();
    expect(calls.some((c) => c.url === "/api/weekly/tasks?week_start=2026-11-23")).toBe(true);
    expect(screen.queryByRole("button", { name: "Dziś" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Poprzedni tydzień" }));
    expect(await screen.findByText("16 listopada — 22 listopada")).toBeTruthy();
    expect(calls.some((c) => c.url === "/api/weekly/tasks?week_start=2026-11-16")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Dziś" }));
    expect(await screen.findByText("23 listopada — 29 listopada")).toBeTruthy();
  });
});

describe("failed writes are shown and undone (regression: they were silently ignored)", () => {
  it("check: PATCH 500 → message, the task goes back to „todo”", async () => {
    mockFetch((url, init) => (init?.method === "PATCH" && url === "/api/weekly/tasks" ? { status: 500, body: { error: "baza niedostępna" } } : undefined));
    const { container } = render(<WeeklyPlanner />);
    const title = await screen.findByText("Zadanie testowe");
    const checkbox = title.parentElement!.firstElementChild as HTMLElement;
    fireEvent.click(checkbox);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Nie zapisano zmiany statusu „Zadanie testowe”: baza niedostępna");
    await waitFor(() => expect(title.style.textDecoration).toBe("none"));
    expect(container.textContent).toContain("Done0/1");
  });

  it("check: network error → message", async () => {
    mockFetch((url, init) => {
      if (init?.method === "PATCH") throw new TypeError("Failed to fetch");
      return undefined;
    });
    render(<WeeklyPlanner />);
    const title = await screen.findByText("Zadanie testowe");
    fireEvent.click(title.parentElement!.firstElementChild as HTMLElement);
    expect((await screen.findByRole("alert")).textContent).toContain("Failed to fetch");
  });

  it("delete: DELETE 500 → message, the task is back on the list", async () => {
    mockFetch((url, init) => (init?.method === "DELETE" ? { status: 500, body: { error: "odmowa" } } : undefined));
    render(<WeeklyPlanner />);
    await openTask();
    fireEvent.click(screen.getByRole("button", { name: "Usuń" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Nie usunięto „Zadanie testowe”: odmowa");
    expect(screen.getByText("Zadanie testowe")).toBeTruthy();
  });

  it("delete: success → the task disappears, no message", async () => {
    mockFetch();
    render(<WeeklyPlanner />);
    await openTask();
    fireEvent.click(screen.getByRole("button", { name: "Usuń" }));
    await waitFor(() => expect(screen.queryByText("Zadanie testowe")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("edit: PATCH /api/weekly/update 500 → message, still in edit mode", async () => {
    mockFetch((url) => (url === "/api/weekly/update" ? { status: 500, body: { error: "zły priorytet" } } : undefined));
    render(<WeeklyPlanner />);
    await openTask();
    fireEvent.click(screen.getByRole("button", { name: "Edytuj" }));
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Nie zapisano edycji „Zadanie testowe”: zły priorytet");
    expect(screen.getByRole("button", { name: "Zapisz" })).toBeTruthy();
  });

  it("move to next week: POST /api/weekly/rollover 404 → message, not „Przeniesiono”", async () => {
    mockFetch((url) => (url === "/api/weekly/rollover" ? { status: 404, body: { error: "Task not found" } } : undefined));
    render(<WeeklyPlanner />);
    await openTask();
    fireEvent.click(screen.getByRole("button", { name: "→ Nast. tydzień" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Nie przeniesiono „Zadanie testowe” na następny tydzień: Task not found");
    expect(screen.queryByText("✓ Przeniesiono")).toBeNull();
  });

  it("add: POST 500 → message (unchanged behaviour)", async () => {
    mockFetch((url, init) => (init?.method === "POST" && url === "/api/weekly/tasks" ? { status: 500, body: { error: "insert failed" } } : undefined));
    render(<WeeklyPlanner />);
    await screen.findByText("Zadanie testowe");
    fireEvent.click(screen.getByRole("button", { name: "+ Dodaj cel" }));
    fireEvent.change(screen.getByPlaceholderText("Cel na ten tydzień..."), { target: { value: "Nowe" } });
    fireEvent.click(within(screen.getByPlaceholderText("Cel na ten tydzień...").parentElement!).getByRole("button", { name: "Dodaj" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Błąd dodawania celu: insert failed");
  });
});
