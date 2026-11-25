import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { ReadingLog } from "../components/rozwoj/reading-log";

// Real Bookly sessions 1–25 Nov 2026 (34 sessions)
const N = (date: string, title: string, pages: number, seconds: number, i: number) => ({ id: `s${i}`, date: `2026-11-${date}`, title, author: "", pages, seconds });
const T = "Traction: Get a Grip on Your Business", R = "Rocket Fuel", F = "Flow: The Classic Work on How to Achieve Happiness";
const M = "Myśl I Bogać Się", K = "Kod Otyłości", S = "Stolen Focus: Why You Can't Pay Attention", O = "O Czym Mówimy, Kiedy Mówimy O Miłości";
const NOV = [
  ["01", T, 15, 1918], ["02", T, 10, 927], ["03", T, 18, 1921], ["04", T, 16, 1863], ["05", T, 18, 2059], ["06", T, 6, 1124],
  ["06", T, 16, 1837], ["07", T, 13, 2214], ["08", T, 18, 2187], ["09", T, 14, 2007], ["10", T, 17, 1847], ["11", M, 9, 413],
  ["11", S, 11, 1860], ["11", T, 6, 1352], ["12", T, 61, 2174], ["13", R, 18, 2033], ["14", R, 17, 1472], ["15", K, 21, 1234],
  ["15", M, 27, 1235], ["15", R, 13, 1417], ["15", R, 26, 1817], ["16", R, 23, 1897], ["17", R, 24, 1843], ["18", R, 19, 1811],
  ["19", R, 24, 1972], ["20", O, 19, 1688], ["20", S, 27, 1813], ["21", F, 8, 2054], ["21", F, 9, 2226], ["21", R, 16, 1513],
  ["22", F, 16, 2378], ["23", F, 11, 1894], ["24", F, 12, 2758], ["25", F, 8, 1860],
].map((x, i) => N(x[0] as string, x[1] as string, x[2] as number, x[3] as number, i));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReadingLog", () => {
  it("November 2026: header, 15.11 day total and per-book summary", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      json: async () =>
        url.startsWith("/api/bookly/sessions")
          ? { sessions: [...NOV].sort((a, b) => b.date.localeCompare(a.date)) }
          : { covers: {} },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReadingLog today="2026-11-25" reloadKey={0} onChanged={() => {}} />);

    await screen.findByText("25 dni z czytaniem · 1010 min · 586 stron");
    expect(fetchMock).toHaveBeenCalledWith("/api/bookly/sessions?from=2026-11-01&to=2026-11-30");

    const day15 = screen.getByText("nd 15.11").closest("li")!;
    expect(within(day15).getByText("87 str. · 95 min")).toBeTruthy();
    expect(within(day15).getAllByText("Rocket Fuel")).toHaveLength(2);
    expect(within(day15).getAllByTitle(K).length).toBeGreaterThan(0);

    // Titles shortened before ":" with the full title in the tooltip
    expect(screen.getAllByTitle(F).length).toBeGreaterThan(0);
    // Per-book summary, sorted by minutes: Traction first — 13 sessions on 12 days, 228 pages, 23 430 s = 391 min
    expect(screen.getByText("12 dni · 228 str. · 391 min")).toBeTruthy();
    const summary = screen.getByText("Książki w miesiącu").parentElement!;
    expect(within(summary).getAllByRole("listitem")[0].textContent).toContain("Traction");
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === "/api/bookly/covers")).toBe(true));
  });
});
