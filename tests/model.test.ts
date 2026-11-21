import { describe, expect, it } from "vitest";
import { forecastFixture, parseRecord, poisson } from "../lib/model";
import type { Fixture } from "../lib/types";

const fixture: Fixture = {
  id: "test",
  leagueId: "eng.1",
  league: "Premier League",
  kickoff: "2026-11-21T15:00:00Z",
  status: "scheduled",
  statusLabel: "Sat, Nov 21",
  home: { id: "1", name: "North FC", shortName: "North", abbreviation: "NOR", record: "7-2-1" },
  away: { id: "2", name: "South FC", shortName: "South", abbreviation: "SOU", record: "2-3-5" },
  source: "ESPN",
  sourceUpdatedAt: "2026-11-18T12:00:00Z",
};

describe("baseline model", () => {
  it("parses W-D-L records", () => expect(parseRecord("7-2-1")?.ppg).toBeCloseTo(2.3));

  it("builds normalized match outcomes from one coherent goal distribution", () => {
    const result = forecastFixture(fixture);
    expect(result.homeWin + result.draw + result.awayWin).toBeCloseTo(1, 5);
    expect(result.homeWin).toBeGreaterThan(result.awayWin);
    expect(result.markets.every((market) => market.probability > 0 && market.probability < 1)).toBe(true);
  });

  it("has near-complete Poisson probability mass", () => {
    const mass = Array.from({ length: 15 }, (_, goals) => poisson(1.5, goals)).reduce((sum, value) => sum + value, 0);
    expect(mass).toBeCloseTo(1, 7);
  });

  it("applies a normalized low-score correlation correction", () => {
    const independent = forecastFixture(fixture, {
      expectedHomeGoals: 1.4, expectedAwayGoals: 1.1, lowScoreCorrelation: 0,
      version: "test", quality: "good", evidence: [], risks: [],
    });
    const corrected = forecastFixture(fixture, {
      expectedHomeGoals: 1.4, expectedAwayGoals: 1.1, lowScoreCorrelation: -0.1,
      version: "test", quality: "good", evidence: [], risks: [],
    });
    expect(corrected.draw).toBeGreaterThan(independent.draw);
    expect(corrected.homeWin + corrected.draw + corrected.awayWin).toBeCloseTo(1, 10);
    expect(corrected.markets.every((market) => market.probability > 0 && market.probability < 1)).toBe(true);
  });
});
