import { describe, expect, it } from "vitest";
import { forecastSeedForMatch } from "../lib/forecast-playback";
import { simulateMatch } from "../lib/simulation";

describe("30,000 match trials", () => {
  it("simulates exactly 30,000 with reproducible output", () => {
    const seed = forecastSeedForMatch("f-1", "goals-v3", 1.9, 0.8);
    const input = {
      homeTeam: "Home", awayTeam: "Away", expectedHomeGoals: 1.9, expectedAwayGoals: 0.8,
      iterations: 30_000, seed, modelVersion: "goals-v3", scenario: "baseline" as const,
    };
    const first = simulateMatch(input);
    const second = simulateMatch(input);
    expect(first.input.iterations).toBe(30_000);
    expect(first.outcomes).toEqual(second.outcomes);
    expect(first.scorelines).toEqual(second.scorelines);
    expect(first.outcomes.home + first.outcomes.draw + first.outcomes.away).toBeCloseTo(1, 12);
  });
});
