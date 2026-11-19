import { describe, expect, it } from "vitest";
import { americanToDecimal, combineAmericanOdds, impliedProbability } from "../lib/odds";

describe("odds conversion", () => {
  it("converts positive and negative American odds", () => {
    expect(americanToDecimal(150)).toBeCloseTo(2.5);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5);
  });

  it("calculates implied probability", () => {
    expect(impliedProbability(-200)).toBeCloseTo(2 / 3);
    expect(impliedProbability(150)).toBeCloseTo(0.4);
  });

  it("combines parlay legs", () => {
    expect(combineAmericanOdds([-110, -110])).toBe(264);
  });
});
