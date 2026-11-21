import type { SimulationResult } from "./simulation";

export type PlaybackMode = "representative" | "alternate";

/** Match-model inputs determine the Monte Carlo results, never the playback seed. */
export function forecastSeedForMatch(fixtureId: string, modelVersion: string, expectedHomeGoals: number, expectedAwayGoals: number, lowScoreCorrelation = 0): string {
  if (![expectedHomeGoals, expectedAwayGoals, lowScoreCorrelation].every((x) => Number.isFinite(x)) || expectedHomeGoals < 0 || expectedAwayGoals < 0) {
    throw new Error("Invalid pre-match scoring parameters");
  }
  return ["migo-forecast-30000-v3", fixtureId, modelVersion, expectedHomeGoals.toFixed(6), expectedAwayGoals.toFixed(6), lowScoreCorrelation.toFixed(4)].join(":");
}

/**
 * A representative playback is CONDITIONED on the most frequent exact score
 * in the 10,000-trial sample. It is not the most likely full match trajectory.
 */
export function representativeFinalScore(result: Pick<SimulationResult, "scorelines">): { home: number; away: number } | null {
  const mode = result.scorelines[0];
  if (!mode || !Number.isInteger(mode.homeGoals) || !Number.isInteger(mode.awayGoals)) return null;
  return { home: mode.homeGoals, away: mode.awayGoals };
}
