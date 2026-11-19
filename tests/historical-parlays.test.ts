import { describe, expect, it } from "vitest";
import { runHistoricalParlayReplay } from "../lib/historical-parlays";
import type { BacktestPrediction, HistoricalMatch, MarketProbabilities } from "../lib/history";

const probabilities: MarketProbabilities = {
  home: 0.72, draw: 0.17, away: 0.11,
  homeOrDraw: 0.89, awayOrDraw: 0.28, homeOrAway: 0.83,
  over15: 0.85, under15: 0.15, over25: 0.60, under25: 0.40,
  over35: 0.22, under35: 0.78, btts: 0.54, bttsNo: 0.46,
};
const day = "2025-04-12T14:00:00Z";
function example(index: number, won = true, includeOdds = true): [HistoricalMatch, BacktestPrediction] {
  const id = String(index);
  const match: HistoricalMatch = {
    id, competition: "MLS", season: "2025", date: day,
    homeTeam: "Home " + id, awayTeam: "Away " + id,
    homeGoals: won ? 2 : 0, awayGoals: won ? 0 : 1,
    result: won ? "H" : "A", source: "Test", importedAt: day,
    odds: includeOdds ? { home: 1.6, draw: 4.2, away: 6, over25: 1.4, under25: 1.8 } : undefined,
  };
  const prediction = {
    matchId: id, date: day, competition: "MLS", homeTeam: match.homeTeam, awayTeam: match.awayTeam,
    probabilities,
  } as BacktestPrediction;
  return [match, prediction];
}
const config = { strategy: "daily-double" as const, minProbability: 0.65, minEdge: 0.02, maxLegs: 3, stake: 100 };
describe("priced historical parlay replay", () => {
  it("uses different fixtures and real provided market prices for a +100 daily double", () => {
    const items = [example(1), example(2), example(3)];
    const result = runHistoricalParlayReplay(items.map((item) => item[1]), items.map((item) => item[0]), config);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].legs).toHaveLength(2);
    expect(result.cards[0].decimalOdds).toBeGreaterThanOrEqual(2);
    expect(new Set(result.cards[0].legs.map((leg) => leg.matchId)).size).toBe(2);
    expect(result.cards[0].won).toBe(true);
    expect(result.hypotheticalProfit).toBeGreaterThan(0);
  });
  it("does not invent odds for ESPN-only MLS or UWCL imports", () => {
    const items = [example(1, true, false), example(2, true, false)];
    const result = runHistoricalParlayReplay(items.map((item) => item[1]), items.map((item) => item[0]), config);
    expect(result.cards).toHaveLength(0);
    expect(result.hypotheticalRoi).toBeNull();
    expect(result.pricedFixtures).toBe(0);
  });
  it("passes when quoted prices do not offer enough model edge", () => {
    const items = [example(1), example(2)];
    const result = runHistoricalParlayReplay(items.map((item) => item[1]), items.map((item) => item[0]), { ...config, minEdge: 0.5 });
    expect(result.cards).toHaveLength(0);
  });
  it("settles the whole card as lost when one fixture loses", () => {
    const items = [example(1), example(2, false)];
    const result = runHistoricalParlayReplay(items.map((item) => item[1]), items.map((item) => item[0]), config);
    expect(result.cards[0].won).toBe(false);
    expect(result.hypotheticalProfit).toBe(-100);
  });
});
