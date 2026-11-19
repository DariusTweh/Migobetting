import { describe, expect, it } from "vitest";
import { estimateParlayProbability } from "../lib/parlay";
import type { Fixture } from "../lib/types";

const fixture: Fixture = { id: "1", leagueId: "eng.1", league: "Premier League", kickoff: "2026-12-01T12:00:00Z", status: "scheduled", statusLabel: "Scheduled", home: { id: "h", name: "Home", shortName: "Home", abbreviation: "H", record: "7-2-1" }, away: { id: "a", name: "Away", shortName: "Away", abbreviation: "A", record: "3-2-5" }, source: "ESPN", sourceUpdatedAt: "2026-11-19T00:00:00Z" };

describe("same-match parlay model", () => {
  it("models impossible correlated combinations as zero", () => {
    const result = estimateParlayProbability([{ fixtureId: "1", market: "Home win" }, { fixtureId: "1", market: "Away win" }], [fixture]);
    expect(result.probability).toBe(0);
    expect(result.warnings[0]).toContain("modeled jointly");
  });

  it("does not blindly multiply dependent markets", () => {
    const joint = estimateParlayProbability([{ fixtureId: "1", market: "Home win" }, { fixtureId: "1", market: "Home or draw" }], [fixture]);
    const home = estimateParlayProbability([{ fixtureId: "1", market: "Home win" }], [fixture]);
    expect(joint.probability).toBeCloseTo(home.probability, 10);
  });
});
