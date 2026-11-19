export const LINEUP_CONFIRMATION_WINDOW_MINUTES = 90 as const;

export function canLabelLineupConfirmed(minutesToKickoff: number, starterCount: number): boolean {
  return minutesToKickoff <= LINEUP_CONFIRMATION_WINDOW_MINUTES && starterCount === 11;
}

export function startingLikelihood(starts: number, observedMatches: number) {
  if (observedMatches <= 0 || starts < 0) return { probability: 0, confidence: "low" as const };
  const probability = Math.min(1, starts / observedMatches);
  return { probability, confidence: probability >= 0.8 ? "high" as const : probability >= 0.5 ? "medium" as const : "low" as const };
}
