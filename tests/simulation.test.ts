import { describe, expect, it } from "vitest";
import { simulateMatch } from "../lib/simulation";

const input = { homeTeam: "Home", awayTeam: "Away", expectedHomeGoals: 1.65, expectedAwayGoals: 1.1, iterations: 50_000, seed: "repeatable", modelVersion: "test", scenario: "baseline" as const };

describe("Monte Carlo match simulation", () => {
  it("is deterministic for the same seed", () => {
    expect(simulateMatch(input).outcomes).toEqual(simulateMatch(input).outcomes);
  });

  it("returns coherent outcome and nested-market probabilities", () => {
    const result = simulateMatch(input);
    expect(result.outcomes.home + result.outcomes.draw + result.outcomes.away).toBeCloseTo(1, 10);
    expect(result.totals.over05).toBeGreaterThanOrEqual(result.totals.over15);
    expect(result.totals.over15).toBeGreaterThanOrEqual(result.totals.over25);
    expect(result.doubleChance.homeOrDraw).toBeCloseTo(result.outcomes.home + result.outcomes.draw, 10);
  });

  it("agrees with analytical Poisson within sampling tolerance", () => {
    expect(simulateMatch(input).analytical.maximumDelta).toBeLessThan(0.01);
  });
});
