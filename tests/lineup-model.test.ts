import { describe, expect, it } from "vitest";
import { canLabelLineupConfirmed, startingLikelihood } from "../lib/lineup-model";

describe("lineup timing and projection", () => {
  it("requires 11 starters inside the 90-minute window for CONFIRMED", () => {
    expect(canLabelLineupConfirmed(89, 11)).toBe(true);
    expect(canLabelLineupConfirmed(91, 11)).toBe(false);
    expect(canLabelLineupConfirmed(30, 10)).toBe(false);
  });

  it("derives confidence from observed starting frequency", () => {
    expect(startingLikelihood(5, 5)).toEqual({ probability: 1, confidence: "high" });
    expect(startingLikelihood(3, 5).confidence).toBe("medium");
    expect(startingLikelihood(1, 5).confidence).toBe("low");
  });
});
