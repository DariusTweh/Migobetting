import { describe, expect, it } from "vitest";
import { simulateStrategy } from "../lib/strategy";

describe("bankroll strategy simulation", () => {
  it("is reproducible and bounds exhaustion probability", () => {
    const input = { startingBankroll: 1000, staking: "flat" as const, stake: 10, winProbability: 0.55, americanOdds: -110, bets: 100, paths: 500, seed: "risk" };
    const first = simulateStrategy(input);
    const second = simulateStrategy(input);
    expect(first.median).toBe(second.median);
    expect(first.exhaustionProbability).toBeGreaterThanOrEqual(0);
    expect(first.exhaustionProbability).toBeLessThanOrEqual(1);
  });
});
