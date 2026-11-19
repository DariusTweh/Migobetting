import { describe, expect, it } from "vitest";
import { buildPricedCard, pricedCandidates } from "../lib/priced-cards";
import type { Fixture } from "../lib/types";
import type { MarketQuote } from "../lib/market-odds";

const now = Date.parse("2029-12-01T12:00:00Z");
const future = (n: number) => new Date(Date.parse("2030-01-02T15:00:00Z") + n * 86400000).toISOString();
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
