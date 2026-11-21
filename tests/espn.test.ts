import { afterEach, describe, expect, it, vi } from "vitest";
import { espnDateKey, getLeagueFixtures } from "../lib/espn";

function event(id: string, date: string, status = "STATUS_SCHEDULED") {
  const completed = status.includes("FINAL") || status.includes("FULL_TIME");
  return {
    id,
    date,
    status: { type: { name: status, shortDetail: completed ? "FT" : "Scheduled" } },
    competitions: [{ competitors: [
      { homeAway: "home", score: completed ? "2" : undefined, team: { id: "h", displayName: "Home", shortDisplayName: "Home", abbreviation: "H" } },
      { homeAway: "away", score: completed ? "1" : undefined, team: { id: "a", displayName: "Away", shortDisplayName: "Away", abbreviation: "A" } },
    ] }],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("ESPN live scoreboard window", () => {
  it("builds yesterday from the app's Pacific calendar day", () => {
    expect(espnDateKey(new Date("2026-11-20T15:00:00Z"), -1)).toBe("20261119");
    expect(espnDateKey(new Date("2026-03-09T07:30:00Z"), -1)).toBe("20260308");
  });

  it("merges yesterday's finals with the current window and removes duplicates", async () => {
    const current = event("upcoming", "2026-11-21T19:00:00Z");
    const completed = event("completed", "2026-11-20T03:00:00Z", "STATUS_FULL_TIME");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const events = url.includes("dates=20261119") ? [completed] : [current, completed];
      return new Response(JSON.stringify({ events }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const fixtures = await getLeagueFixtures("usa.1", {
      includeYesterday: true,
      now: new Date("2026-11-20T15:00:00Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("dates=20261119");
    expect(fixtures.map((fixture) => fixture.id)).toEqual(["upcoming", "completed"]);
    expect(fixtures.find((fixture) => fixture.id === "completed")).toMatchObject({
      status: "final",
      home: { score: 2 },
      away: { score: 1 },
    });
  });
});
