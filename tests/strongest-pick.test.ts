import { describe, expect, it } from "vitest";
import { strongestModelPick } from "../lib/strongest-pick";
import type { Fixture } from "../lib/types";
import type { MarketQuote } from "../lib/market-odds";

const now = Date.parse("2029-12-01T12:00:00Z");
const makeFixture = (id: string, hoursAhead = 20): Fixture => ({
  id, leagueId: "eng.1", league: "Premier League",
  kickoff: new Date(now + hoursAhead * 3600000).toISOString(),
  status: "scheduled", statusLabel: "Scheduled",
  home: { id: "a" + id, name: "Arsenal FC", shortName: "Arsenal", abbreviation: "ARS", record: "13-2-2" },
  away: { id: "c" + id, name: "Chelsea FC", shortName: "Chelsea", abbreviation: "CHE", record: "4-4-10" },
  source: "ESPN", sourceUpdatedAt: new Date(now).toISOString(),
});
const quote = (id: string, odds: number): MarketQuote => ({
  fixtureId: id, marketKey: "home", americanOdds: odds,
  bookmaker: "Pinnacle", bookKey: "rundown:3", source: "TheRundown",
  updatedAt: new Date(now - 300000).toISOString(),
});

describe("one clear strongest model pick", () => {
  it("prefers an eligible real quoted market, including its actual price", () => {
    const pick = strongestModelPick([makeFixture("one")], [quote("one", -130)], [], now);
    expect(pick).toMatchObject({
      fixtureId: "one", pricing: "quoted", market: "Arsenal win",
      quotedAmerican: -130, bookmaker: "Pinnacle",
    });
    expect(pick!.probability).toBeGreaterThan(0.6);
  });
  it("does not display -1100 as a qualified priced pick", () => {
    const pick = strongestModelPick([makeFixture("one")], [quote("one", -1100)], [], now);
    expect(pick?.pricing).not.toBe("quoted");
    expect(pick?.quotedAmerican).toBeNull();
  });
  it("labels an eligible unpriced model-only lean transparently", () => {
    const pick = strongestModelPick([makeFixture("one")], [], [], now);
    expect(pick?.pricing).toBe("unpriced");
    expect(pick?.bookmaker).toBeNull();
    expect(pick!.probability).toBeLessThanOrEqual(0.78);
  });
  it("does not pick games that have started or are more than 72 hours out", () => {
    expect(strongestModelPick([makeFixture("past", -1)], [], [], now)).toBeNull();
    expect(strongestModelPick([makeFixture("later", 96)], [], [], now)).toBeNull();
  });
});
