import { describe, expect, it } from "vitest";
import { buildPricedCard, pricedCandidates } from "../lib/priced-cards";
import type { Fixture } from "../lib/types";
import type { MarketQuote } from "../lib/market-odds";

const now = Date.parse("2030-01-02T12:00:00Z");
const future = (n: number) => new Date(Date.parse("2030-01-02T15:00:00Z") + n * 3600000).toISOString();
const fixture = (n: number): Fixture => ({
  id: "match-" + n, leagueId: "eng.1", league: "Premier League",
  kickoff: future(n), status: "scheduled", statusLabel: "Scheduled",
  home: { id: "a" + n, name: "Arsenal FC", shortName: "Arsenal", abbreviation: "ARS", record: "13-2-2" },
  away: { id: "c" + n, name: "Chelsea FC", shortName: "Chelsea", abbreviation: "CHE", record: "4-4-10" },
  source: "ESPN", sourceUpdatedAt: new Date(now).toISOString(),
});
const quote = (n: number, americanOdds: number, bookKey = "rundown-19"): MarketQuote => ({
  fixtureId: "match-" + n, marketKey: "home", americanOdds,
  bookmaker: bookKey === "rundown-19" ? "DraftKings" : "FanDuel",
  bookKey, source: "TheRundown", updatedAt: new Date(now - 300000).toISOString(),
});
describe("priced soccer parlay builder", () => {
  it("rejects very short -1100 odds even when the model probability looks high", () => {
    expect(pricedCandidates([fixture(1)], [quote(1, -1100)], [], now)).toHaveLength(0);
  });
  it("constructs a priced +100 Daily Double with distinct fixtures from one bookmaker", () => {
    const card = buildPricedCard(
      [fixture(1), fixture(2), fixture(3)], [quote(1, -130), quote(2, -130), quote(3, -130)],
      "daily-double", [], now,
    );
    expect(card.legs).toHaveLength(2);
    expect(card.combinedAmerican).toBeGreaterThanOrEqual(100);
    expect(card.legs.every((leg) => leg.bookKey === "rundown-19")).toBe(true);
  });
  it("never inserts tomorrow's match even when its quote is more attractive", () => {
    const tomorrow = { ...fixture(99), kickoff: "2030-01-03T18:00:00Z" };
    const sameDay = [fixture(1), fixture(2), fixture(3)];
    const card = buildPricedCard([...sameDay, tomorrow],
      [quote(1,-130), quote(2,-130), quote(3,-130), quote(99,100)],
      "daily-double",[],now);
    expect(card.legs.length).toBeGreaterThan(0);
    expect(card.legs.every(leg => leg.kickoff.startsWith("2030-01-02"))).toBe(true);
    expect(card.legs.some(leg => leg.fixtureId === "match-99")).toBe(false);
  });
  it("passes instead of borrowing from tomorrow when no qualifying matches remain today", () => {
    const tomorrow = { ...fixture(12), kickoff: "2030-01-03T17:00:00Z" };
    const other = { ...fixture(13), kickoff: "2030-01-04T17:00:00Z" };
    const card = buildPricedCard([tomorrow,other],[quote(12,-130),quote(13,-130)],
      "daily-double",[],now);
    expect(card.legs).toHaveLength(0);
    expect(card.notes[0]).toContain("today");
    const banger = buildPricedCard([tomorrow,other],[quote(12,-130),quote(13,-130)],
      "banger",[],now);
    expect(banger.legs).toHaveLength(0);
  });
  it("does not include kickoff times that have already passed today", () => {
    const started = {...fixture(21),kickoff:"2030-01-02T11:59:00Z"};
    const card=buildPricedCard([started],[quote(21,-130)],"daily-double",[],now);
    expect(card.legs).toHaveLength(0);
  });
  it("does not combine different bookmakers into an imaginary ticket", () => {
    const card = buildPricedCard([fixture(1), fixture(2)],
      [quote(1, -130, "rundown-19"), quote(2, -130, "rundown-23")],
      "daily-double", [], now);
    expect(card.legs).toHaveLength(0);
  });
  it("does not create a priced card without matching market quotes", () => {
    expect(buildPricedCard([fixture(1)], [], "daily-double", [], now).legs).toHaveLength(0);
  });
});
