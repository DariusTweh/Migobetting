import { describe, expect, it } from "vitest";
import { gradePrediction, type ForwardPrediction } from "../lib/forward-store";

const prediction: ForwardPrediction = { id: "1:v1", fixtureId: "1", leagueId: "eng.1", fixtureLabel: "A vs B", kickoff: "2026-01-01T12:00:00Z", lockedAt: "2025-12-31T12:00:00Z", modelVersion: "v1", probabilities: { home: 0.6, draw: 0.25, away: 0.15, over15: 0.75, over25: 0.5, btts: 0.48 }, predictedOutcome: "home", status: "open" };

describe("forward prediction grading", () => {
  it("grades the immutable prediction against the final result", () => {
    const graded = gradePrediction(prediction, { fixtureId: "1", completed: true, homeGoals: 2, awayGoals: 1 });
    expect(graded.status).toBe("graded");
    expect(graded.correct).toBe(true);
    expect(graded.brier).toBeGreaterThan(0);
    expect(prediction.status).toBe("open");
  });

  it("does not grade an incomplete fixture", () => expect(gradePrediction(prediction, { fixtureId: "1", completed: false })).toEqual(prediction));
});
