import { describe, expect, it } from "vitest";
import { parseRundownOdds } from "../lib/therundown";
import type { Fixture } from "../lib/types";

const fixture: Fixture = {
  id: "espn-1", leagueId: "eng.1", league: "Premier League",
  kickoff: "2030-03-15T15:00:00Z", status: "scheduled", statusLabel: "Scheduled",
  home: { id: "1", name: "Arsenal FC", shortName: "Arsenal", abbreviation: "ARS", record: "13-2-2" },
  away: { id: "2", name: "Chelsea FC", shortName: "Chelsea", abbreviation: "CHE", record: "4-4-10" },
  source: "ESPN", sourceUpdatedAt: "2030-03-15T12:00:00Z",
};
const price = (value: number, isMain = true) => ({
  price: value, updated_at: "2030-03-15T12:00:00Z", is_main_line: isMain,
});
const event = {
  event_id: "run1", event_date: fixture.kickoff,
  score: { event_status: "STATUS_SCHEDULED" },
  teams: [
    { team_id: 302, name: "Chelsea FC", is_away: true },
    { team_id: 301, name: "Arsenal FC", is_home: true },
  ],
  markets: [
    { market_id: 1, period_id: 0, participants: [
      { type: "TYPE_TEAM", id: 301, name: "Arsenal FC", lines: [{ value: "", prices: { "19": price(-155), "22": price(-170) } }] },
      { type: "TYPE_TEAM", id: 302, name: "Chelsea FC", lines: [{ value: "", prices: { "19": price(340) } }] },
      { type: "TYPE_RESULT", id: 0, name: "Draw", lines: [{ value: "", prices: { "19": price(280) } }] },
    ] },
    { market_id: 3, period_id: 0, participants: [
      { type: "TYPE_RESULT", id: 1, name: "Over", lines: [
        { value: "1.5", prices: { "19": price(-1100) } },
        { value: "2.5", prices: { "19": price(-110), "22": price(-115) } },
      ] },
      { type: "TYPE_RESULT", id: 0, name: "Under", lines: [
        { value: "3.5", prices: { "19": price(-120) } },
      ] },
    ] },
  ],
};
describe("TheRundown V2 market parser", () => {
  it("matches exactly by kickoff, home/away team IDs and regulation-time market", () => {
    const quotes = parseRundownOdds({ events: [event] }, [fixture], "eng.1");
    expect(quotes.find((q) => q.marketKey === "home" && q.bookKey === "rundown-19")?.americanOdds).toBe(-155);
    expect(quotes.find((q) => q.marketKey === "away")?.americanOdds).toBe(340);
    expect(quotes.find((q) => q.marketKey === "draw")?.americanOdds).toBe(280);
    expect(quotes.find((q) => q.marketKey === "over-1.5")?.americanOdds).toBe(-1100);
    expect(quotes.find((q) => q.marketKey === "over-2.5")?.americanOdds).toBe(-110);
    expect(quotes.find((q) => q.marketKey === "under-3.5")?.americanOdds).toBe(-120);
    expect(quotes.every((q) => q.source === "TheRundown")).toBe(true);
  });
  it("rejects incorrect fixtures, live prices, closed and invalid quotes", () => {
    const wrong = { ...event, event_date: "2030-03-18T15:00:00Z" };
    expect(parseRundownOdds({ events: [wrong] }, [fixture], "eng.1")).toHaveLength(0);
    const live = { ...event, score: { event_status: "STATUS_IN_PROGRESS" } };
    expect(parseRundownOdds({ events: [live] }, [fixture], "eng.1")).toHaveLength(0);
  });
});
