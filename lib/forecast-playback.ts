import type { SimulationResult } from "./simulation";

export type PlaybackMode = "representative" | "alternate";

/** Match-model inputs determine the Monte Carlo results, never the playback seed. */
export function forecastSeedForMatch(fixtureId: string, modelVersion: string, expectedHomeGoals: number, expectedAwayGoals: number): string {
  if (![expectedHomeGoals, expectedAwayGoals].every((x) => Number.isFinite(x) && x >= 0)) {
    throw new Error("Invalid pre-match scoring parameters");
  }
  return ["migo-forecast-10000-v1", fixtureId, modelVersion, expectedHomeGoals.toFixed(6), expectedAwayGoals.toFixed(6)].join(":");
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
