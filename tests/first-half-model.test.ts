import { describe, expect, it } from "vitest";
import { backtestFirstHalf, estimateFirstHalf } from "../lib/first-half-model";
import type { HistoricalMatch } from "../lib/history";
import type { Fixture } from "../lib/types";

const fixture: Fixture = {
  id: "arsenal-chelsea", leagueId: "eng.1", league: "Premier League",
  kickoff: "2026-11-28T18:00:00Z", status: "scheduled",
  statusLabel: "Scheduled",
  source: "ESPN", sourceUpdatedAt: "2026-11-20T12:00:00Z",
  home: { id: "a", name: "Arsenal", shortName: "Arsenal", abbreviation: "ARS" },
  away: { id: "b", name: "Chelsea", shortName: "Chelsea", abbreviation: "CHE" },
};
const teams = ["Arsenal", "Chelsea", "Liverpool", "Everton", "Fulham", "West Ham", "Brighton", "Brentford"];
const historical: HistoricalMatch[] = Array.from({ length: 200 }, (_, i) => {
  const home = teams[i % teams.length];
  const away = teams[(i + 1 + Math.floor(i / 8)) % teams.length];
  const htHome = (i * 7) % 3;
  const htAway = (i * 11) % 2;
  const ftHome = htHome + i % 2;
  const ftAway = htAway + (i + 1) % 2;
  return {
    id: "match-" + i, competition: "Premier League", season: "2025-26",
    date: new Date(Date.UTC(2025, 9, 1 + i * 2, 12)).toISOString(),
    homeTeam: home, awayTeam: away,
    homeGoals: ftHome, awayGoals: ftAway,
    halfTimeHomeGoals: htHome, halfTimeAwayGoals: htAway,
    result: ftHome > ftAway ? "H" : ftHome < ftAway ? "A" : "D",
    source: "verified fixture test", importedAt: "2026-11-20T12:00:00Z",
  };
});

describe("first-half Poisson model from real historical HT goals", () => {
  it("produces internally consistent probabilities for the supported first-half markets", () => {
    const model = estimateFirstHalf(historical, fixture);
    expect(model).not.toBeNull();
    const p = (key: string) => model!.markets.find((market) => market.key === key)!.probability;
    expect(p("first-half-over-0.5")).toBeGreaterThanOrEqual(p("first-half-over-1.5"));
    expect(p("first-half-over-0.5")).toBeCloseTo(1 -
      Math.exp(-(model!.expectedHomeGoals + model!.expectedAwayGoals)), 10);
    for (const market of model!.markets) {
      expect(market.probability).toBeGreaterThanOrEqual(0);
      expect(market.probability).toBeLessThanOrEqual(1);
    }
    expect(model!.notes[2]).toContain("not yet calibrated");
  });

  it("never trains on future halftime results or fixture-day timestamps", () => {
    const baseline = estimateFirstHalf(historical, fixture)!;
    const future = {
      ...historical[0], id: "future", date: "2026-12-10T00:00:00Z",
      homeGoals: 9, awayGoals: 9, halfTimeHomeGoals: 8, halfTimeAwayGoals: 8,
    };
    const sameDay = { ...future, id: "same-day", date: "2026-11-28T00:00:00Z" };
    const after = estimateFirstHalf([...historical, future, sameDay], fixture)!;
    expect(after.expectedHomeGoals).toEqual(baseline.expectedHomeGoals);
    expect(after.expectedAwayGoals).toEqual(baseline.expectedAwayGoals);
    expect(after.markets).toEqual(baseline.markets);
  });

  it("does not invent halftime outcomes from full-time scores alone", () => {
    const noHalves = historical.map((match) => ({
      ...match, halfTimeHomeGoals: undefined, halfTimeAwayGoals: undefined,
    }));
    expect(estimateFirstHalf(noHalves, fixture)).toBeNull();
    const invalid = historical.map((match) => ({
      ...match, halfTimeHomeGoals: match.homeGoals + 1,
    }));
    expect(estimateFirstHalf(invalid, fixture)).toBeNull();
  });

  it("changes its scoring distribution when real prior halftime goals differ", () => {
    const low = historical.map((match) => ({ ...match, halfTimeHomeGoals: 0, halfTimeAwayGoals: 0 }));
    const high = historical.map((match) => ({
      ...match, homeGoals: 3, awayGoals: 2, halfTimeHomeGoals: 2, halfTimeAwayGoals: 1,
    }));
    expect(estimateFirstHalf(low, fixture)).toBeNull();
    expect(estimateFirstHalf(high, fixture)!.expectedHomeGoals).toBeGreaterThan(1);
  });

  it("runs a chronological held-out diagnostic with finite Brier scores", () => {
    const test = backtestFirstHalf(historical, "Premier League", 120);
    expect(test.evaluated).toBeGreaterThan(0);
    expect(test.over05?.predicted).toBeGreaterThanOrEqual(0);
    expect(test.over05?.observed).toBeLessThanOrEqual(1);
    expect(test.over15!.brier).toBeGreaterThanOrEqual(0);
    expect(test.over15!.brier).toBeLessThanOrEqual(1);
  });
});
