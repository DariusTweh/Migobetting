import { afterEach, describe, expect, it, vi } from "vitest";
import { espnDateKey, getLeagueFixtures, UPCOMING_FIXTURE_DAYS } from "../lib/espn";

function event(id: string, date: string, status = "STATUS_SCHEDULED") {
  const completed = status.includes("FINAL") || status.includes("FULL_TIME");
  return {
    id, date,
    status: { type: { name: status, shortDetail: completed ? "FT" : "Scheduled" } },
    competitions: [{ competitors: [
      { homeAway: "home", score: completed ? "2" : undefined,
        team: { id: "h", displayName: "Home", shortDisplayName: "Home", abbreviation: "H" } },
      { homeAway: "away", score: completed ? "1" : undefined,
        team: { id: "a", displayName: "Away", shortDisplayName: "Away", abbreviation: "A" } },
    ] }],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("ESPN complete soccer fixture schedule window", () => {
  it("builds dates from the app's Pacific calendar day, including DST", () => {
    expect(espnDateKey(new Date("2026-11-20T15:00:00Z"), -1)).toBe("20261119");
    expect(espnDateKey(new Date("2026-03-09T07:30:00Z"), -1)).toBe("20260308");
    expect(UPCOMING_FIXTURE_DAYS).toBeGreaterThanOrEqual(7);
  });

  it("merges yesterday's finals, today and tomorrow and removes duplicates", async () => {
    const upcoming = event("upcoming", "2026-11-21T19:00:00Z");
    const completed = event("completed", "2026-11-20T03:00:00Z", "STATUS_FULL_TIME");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const events = url.includes("dates=20261119") ? [completed] : url.includes("dates=20261121") ? [upcoming] : [];
      return new Response(JSON.stringify({ events }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const fixtures = await getLeagueFixtures("usa.1", {
      includeYesterday: true,
      now: new Date("2026-11-20T15:00:00Z"),
      daysAhead: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4); // undated, yesterday, today, tomorrow
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("dates=20261119"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("dates=20261121"))).toBe(true);
    expect(fixtures.map((fixture) => fixture.id)).toEqual(["completed", "upcoming"]);
    expect(fixtures.find((fixture) => fixture.id === "completed")).toMatchObject({
      status: "final", home: { score: 2 }, away: { score: 1 },
    });
  });

  it("finds La Liga fixtures when the undated ESPN scoreboard is empty", async () => {
    const match = event("laliga-future", "2026-11-24T21:00:00Z");
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const events = String(url).includes("dates=20261124") ? [match] : [];
      return new Response(JSON.stringify({ events }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const fixtures = await getLeagueFixtures("esp.1", {
      now: new Date("2026-11-20T15:00:00Z"),
      daysAhead: 5,
    });
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]).toMatchObject({ id: "laliga-future", league: "La Liga" });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("dates=20261124"))).toBe(true);
  });

  it("keeps available games if one dated scoreboard request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("dates=20261122")) throw new Error("Provider timeout");
      const events = String(url).includes("dates=20261121") ? [event("one", "2026-11-21T19:00:00Z")] : [];
      return new Response(JSON.stringify({ events }), { status: 200 });
    }));
    const fixtures = await getLeagueFixtures("ger.1", {
      now: new Date("2026-11-20T15:00:00Z"), daysAhead: 2,
    });
    expect(fixtures.map((fixture) => fixture.id)).toEqual(["one"]);
  });
});
