import { describe, expect, it } from "vitest";
import { runHistoricalBacktest, type HistoricalMatch } from "../lib/history";

it("does not use earlier same-date final scores in later matches on that date", () => {
  const history: HistoricalMatch[] = [];
  for (let day = 0; day < 40; day += 1) {
    for (let fixture = 0; fixture < 2; fixture += 1) {
      const homeGoals = 1 + (day % 3);
      const awayGoals = fixture;
      history.push({
        id: "day-" + day + "-" + fixture,
        competition: "Same Day League", season: "2025",
        date: new Date(Date.UTC(2025, 0, day + 1, 12, fixture)).toISOString(),
        homeTeam: fixture ? "C" : "A", awayTeam: fixture ? "D" : "B",
        homeGoals, awayGoals, result: homeGoals > awayGoals ? "H" : "D",
        source: "unit test", importedAt: "2026-01-01T00:00:00Z",
      });
    }
  }
  const config = { market: "over-1.5" as const, threshold: 0.5, iterations: 100, seed: "same-day-test", trainingFraction: 0.6 };
  const before = runHistoricalBacktest(history, config);
  const changed = history.map((match) => match.id === "day-30-0" ? { ...match, homeGoals: 12, awayGoals: 12, result: "D" as const } : match);
  const after = runHistoricalBacktest(changed, config);
  const sameDaySecond = "day-30-1";
  expect(before.predictions.find((p) => p.matchId === sameDaySecond)?.expectedHomeGoals)
    .toBe(after.predictions.find((p) => p.matchId === sameDaySecond)?.expectedHomeGoals);
  expect(before.predictions.find((p) => p.matchId === sameDaySecond)?.probabilities)
    .toEqual(after.predictions.find((p) => p.matchId === sameDaySecond)?.probabilities);
});
