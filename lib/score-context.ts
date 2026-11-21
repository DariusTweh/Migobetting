import { scoreProbability } from "./model";
import type { Forecast } from "./types";

export type GoalRangeProbability = {
  label: "0–1 goals" | "2–3 goals" | "4+ goals";
  probability: number;
};
export type ScoreContext = {
  modalScore: string;
  modalProbability: number;
  probabilityOtherScores: number;
  goalRanges: GoalRangeProbability[];
  expectedTotalGoals: number;
};

/**
 * A single modal exact score is typically a minority-probability outcome.
 * Report mutually exclusive total-goal ranges from the SAME model distribution.
 */
export function describeScoreUncertainty(
  forecast: Pick<Forecast, "expectedHomeGoals" | "expectedAwayGoals" | "lowScoreCorrelation" | "scorelines">,
): ScoreContext {
  let mass = 0;
  const buckets = [0, 0, 0];
  for (let h = 0; h <= 12; h++) {
    for (let a = 0; a <= 12; a++) {
      const p = scoreProbability(forecast.expectedHomeGoals, forecast.expectedAwayGoals, h, a, forecast.lowScoreCorrelation);
      mass += p;
      buckets[h + a < 2 ? 0 : h + a < 4 ? 1 : 2] += p;
    }
  }
  const mostCommon = forecast.scorelines[0];
  const probability = mostCommon?.probability ?? 0;
  return {
    modalScore: mostCommon?.score ?? "Unknown",
    modalProbability: probability,
    probabilityOtherScores: 1 - probability,
    goalRanges: [
      { label: "0–1 goals", probability: buckets[0] / mass },
      { label: "2–3 goals", probability: buckets[1] / mass },
      { label: "4+ goals", probability: buckets[2] / mass },
    ],
    expectedTotalGoals: forecast.expectedHomeGoals + forecast.expectedAwayGoals,
  };
}
