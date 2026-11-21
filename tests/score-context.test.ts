import { describe, expect, it } from "vitest";
import { describeScoreUncertainty } from "../lib/score-context";
import { forecastFixture } from "../lib/model";
import type { Fixture } from "../lib/types";

const fixture: Fixture = {
  id:"score", leagueId:"ger.1", league:"Bundesliga", kickoff:"2030-01-05T14:30:00Z",
  status:"scheduled", statusLabel:"Scheduled",
  home:{id:"h",name:"Bayern Munich",shortName:"Bayern",abbreviation:"BAY",record:"15-1-1"},
  away:{id:"a",name:"Bochum",shortName:"Bochum",abbreviation:"BOC",record:"1-2-14"},
  source:"ESPN",sourceUpdatedAt:"2030-01-01T00:00:00Z",
};

describe("forecast goal-range interpretation", () => {
  it("does not turn a common 1–1 or 1–0 mode into a confident exact-score prediction", () => {
    const forecast = forecastFixture(fixture, {
      expectedHomeGoals: 1.5, expectedAwayGoals: 1.1, lowScoreCorrelation: -0.04,
      version: "test", quality: "good", evidence: [], risks: [],
    });
    const result = describeScoreUncertainty(forecast);
    expect(result.modalProbability).toBeLessThan(0.2);
    expect(result.probabilityOtherScores).toBeGreaterThan(0.8);
    expect(result.goalRanges.reduce((sum, range) => sum + range.probability, 0)).toBeCloseTo(1, 7);
    expect(result.expectedTotalGoals).toBeCloseTo(2.6);
  });
  it("reflects higher-scoring games in its 4+ bucket without arbitrary goal boosts", () => {
    const make = (home: number, away: number) => describeScoreUncertainty(forecastFixture(fixture, {
      expectedHomeGoals: home, expectedAwayGoals: away, lowScoreCorrelation: 0,
      version:"test", quality:"good",evidence:[],risks:[],
    }));
    const low = make(0.9, 0.5), high = make(2.5, 1.4);
    expect(high.goalRanges[2].probability).toBeGreaterThan(low.goalRanges[2].probability);
    expect(high.expectedTotalGoals).toBeGreaterThan(low.expectedTotalGoals);
  });
});
