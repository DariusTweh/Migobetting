import { describe, expect, it } from "vitest";
import { summarizeGoalCalibration } from "../lib/goal-calibration";
import type { BacktestPrediction } from "../lib/history";

function prediction(home: number, away: number, expectedHome = 1.2, expectedAway = 1.1): BacktestPrediction {
  return {
    actualHomeGoals: home, actualAwayGoals: away, expectedHomeGoals: expectedHome,
    expectedAwayGoals: expectedAway, lowScoreCorrelation: 0,
    probabilities: { over25: 0.35, draw: 0.28 },
  } as BacktestPrediction;
}

describe("held-out goal and exact score diagnostics", () => {
  it("reports actual minus predicted goals without altering forecasts", () => {
    const sample = [prediction(2, 1), prediction(0, 0), prediction(3, 1)];
    const before = JSON.stringify(sample);
    const report = summarizeGoalCalibration(sample)!;
    const total = report.rows.find((item) => item.key === "total-goals")!;
    expect(report.sampleSize).toBe(3);
    expect(total.predicted).toBeCloseTo(2.3);
    expect(total.observed).toBeCloseTo(7 / 3);
    expect(JSON.stringify(sample)).toBe(before);
  });

  it("identifies persistent underestimation of goals on a substantial held-out sample", () => {
    const sample = Array.from({ length: 120 }, () => prediction(3, 2));
    const report = summarizeGoalCalibration(sample)!;
    expect(report.verdict).toContain("underestimated");
    const scoreRow = report.rows.find((item) => item.key === "low-score")!;
    expect(scoreRow.observed).toBe(0);
    expect(scoreRow.predicted).toBeGreaterThan(0);
  });

  it("returns no calibration from an empty test", () => {
    expect(summarizeGoalCalibration([])).toBeNull();
  });
});
