import { describe, expect, it } from "vitest";
import { forecastSeedForMatch, representativeFinalScore } from "../lib/forecast-playback";
import { simulateMatch } from "../lib/simulation";
import { generateMatchTape, snapshotMatch } from "../lib/match-playback";

const goalMeans = { expectedHomeGoals: 2.15, expectedAwayGoals: 0.85 };
const modelSeed = forecastSeedForMatch("match-123", "model-v3", goalMeans.expectedHomeGoals, goalMeans.expectedAwayGoals);
const baseline = simulateMatch({
  ...goalMeans, homeTeam: "Bayern Women", awayTeam: "Vienna Women", iterations: 10_000,
  seed: modelSeed, modelVersion: "model-v3", scenario: "baseline",
});
const mode = representativeFinalScore(baseline);

describe("independent 10,000-match probability forecast and simulated playback", () => {
  it("produces reproducible 10K probabilities independent of the playback seed", () => {
    expect(forecastSeedForMatch("match-123", "model-v3", 2.15, 0.85)).toBe(modelSeed);
    const rerun = simulateMatch({ ...baseline.input });
    expect(rerun.outcomes).toEqual(baseline.outcomes);
    expect(rerun.scorelines).toEqual(baseline.scorelines);
    expect(baseline.input.iterations).toBe(10_000);
    expect(baseline.outcomes.home + baseline.outcomes.draw + baseline.outcomes.away).toBeCloseTo(1, 12);
    expect(modelSeed).not.toContain("playback");
  });
  it("conditions representative playback on the most frequent score for any playback seed", () => {
    expect(mode).not.toBeNull();
    const a = generateMatchTape({ seed: "timeline-A", homeName: "Bayern Women", awayName: "Vienna Women", ...goalMeans, finalScoreOverride: mode! });
    const b = generateMatchTape({ seed: "timeline-B", homeName: "Bayern Women", awayName: "Vienna Women", ...goalMeans, finalScoreOverride: mode! });
    expect(a.finalScore).toEqual(mode);
    expect(b.finalScore).toEqual(mode);
    expect(snapshotMatch(a, 90).home.goals).toBe(mode!.home);
    expect(snapshotMatch(b, 90).away.goals).toBe(mode!.away);
    expect(a.frames).not.toEqual(b.frames);
  });
  it("keeps randomly sampled alternate matches reproducible without forcing a final score", () => {
    const input = { seed: "alternate-1", homeName: "Bayern Women", awayName: "Vienna Women", ...goalMeans };
    expect(generateMatchTape(input).frames).toEqual(generateMatchTape(input).frames);
    const different = generateMatchTape({ ...input, seed: "alternate-2" });
    expect(different.frames).not.toEqual(generateMatchTape(input).frames);
  });
  it("rejects invalid representative score forcing", () => {
    expect(() => generateMatchTape({
      seed: "bad", homeName: "Home", awayName: "Away",
      ...goalMeans, finalScoreOverride: { home: -1, away: 1 },
    })).toThrow();
  });
});
