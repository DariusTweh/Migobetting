import type { BacktestPrediction } from "./history";
import { scoreProbability } from "./model";

export type GoalCalibrationRow = {
  key: string;
  label: string;
  unit: "goals" | "rate";
  predicted: number;
  observed: number;
  difference: number;
};
export type GoalCalibration = {
  sampleSize: number;
  rows: GoalCalibrationRow[];
  observedExactScores: Array<{ score: string; count: number; rate: number }>;
  verdict: string;
};

/**
 * Strictly diagnostic: summarize stored, chronological out-of-sample forecasts.
 * These held-out actual scores are NEVER used to change predictions.
 * Production calibration needs a separate train/validation/test split.
 */
export function summarizeGoalCalibration(predictions: BacktestPrediction[]): GoalCalibration | null {
  if (!predictions.length) return null;
  const n = predictions.length;
  const total = (get: (pick: BacktestPrediction) => number) =>
    predictions.reduce((sum, item) => sum + get(item), 0) / n;
  const rows: GoalCalibrationRow[] = [];
  const row = (key: string, label: string, unit: GoalCalibrationRow["unit"],
    predicted: (pick: BacktestPrediction) => number, observed: (pick: BacktestPrediction) => number) => {
    const predictedMean = total(predicted);
    const observedMean = total(observed);
    rows.push({ key, label, unit, predicted: predictedMean, observed: observedMean, difference: observedMean - predictedMean });
  };
  row("home-goals", "Home goals / match", "goals", (p) => p.expectedHomeGoals, (p) => p.actualHomeGoals);
  row("away-goals", "Away goals / match", "goals", (p) => p.expectedAwayGoals, (p) => p.actualAwayGoals);
  row("total-goals", "Total goals / match", "goals", (p) => p.expectedHomeGoals + p.expectedAwayGoals, (p) => p.actualHomeGoals + p.actualAwayGoals);
  row("over-2.5", "Over 2.5 goals", "rate", (p) => p.probabilities.over25, (p) => Number(p.actualHomeGoals + p.actualAwayGoals >= 3));
  row("draw", "Draws", "rate", (p) => p.probabilities.draw, (p) => Number(p.actualHomeGoals === p.actualAwayGoals));
  row("low-score", "Exact 1–0 or 1–1", "rate",
    (p) => scoreProbability(p.expectedHomeGoals, p.expectedAwayGoals, 1, 0, p.lowScoreCorrelation) +
      scoreProbability(p.expectedHomeGoals, p.expectedAwayGoals, 1, 1, p.lowScoreCorrelation),
    (p) => Number(p.actualHomeGoals === 1 && (p.actualAwayGoals === 0 || p.actualAwayGoals === 1)));
  const counts = new Map<string, number>();
  for (const pick of predictions) {
    const score = pick.actualHomeGoals + "–" + pick.actualAwayGoals;
    counts.set(score, (counts.get(score) ?? 0) + 1);
  }
  const observedExactScores = [...counts].map(([score, count]) => ({ score, count, rate: count / n }))
    .sort((a, b) => b.count - a.count || a.score.localeCompare(b.score)).slice(0, 8);
  const totalGap = rows.find((item) => item.key === "total-goals")!.difference;
  const overGap = rows.find((item) => item.key === "over-2.5")!.difference;
  let verdict = n < 100
    ? "Small held-out sample. Goal-rate conclusions are preliminary."
    : Math.abs(totalGap) >= 0.20
      ? "Goal count bias detected: the historical model " + (totalGap > 0 ? "underestimated" : "overestimated") +
        " actual total goals by " + Math.abs(totalGap).toFixed(2) + " per match."
      : Math.abs(overGap) >= 0.06
        ? "Goal totals average is close, but the Over 2.5 rate differs by " +
          Math.round(Math.abs(overGap) * 100) + " percentage points. Investigate score dispersion."
        : "No major aggregate scoring bias detected at these thresholds. Check individual leagues and future seasons.";
  return { sampleSize: n, rows, observedExactScores, verdict };
}
