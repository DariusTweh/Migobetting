import { describe, expect, it } from "vitest";
import { createPaperParlay, gradePaperParlay } from "../lib/paper-parlays";
import type { LockedParlayLeg } from "../lib/paper-parlays";

const future = "2030-05-12T12:00:00Z";
const now = Date.parse("2029-12-01T12:00:00Z");
const leg = (fixtureId: string, market: string): LockedParlayLeg => ({
  fixtureId, fixtureLabel: "A vs B", leagueId: "eng.1", kickoff: future,
  market, americanOdds: -110,
});
describe("complete ticket paper parlays", () => {
  it("keeps the card as one ticket and requires separate fixtures", () => {
    const card = createPaperParlay({ kind: "daily-double", legs: [leg("1", "Home win"), leg("2", "Over 1.5 goals")], stake: 20 }, now);
    expect(card.legs).toHaveLength(2);
    expect(card.decimalOdds).toBeGreaterThan(2);
    expect(() => createPaperParlay({ kind: "banger", legs: [leg("1", "Home win"), leg("1", "Away win")], stake: 20 }, now)).toThrow();
  });
  it("grades a winning ticket only after every leg completes", () => {
    const card = createPaperParlay({ kind: "manual", legs: [leg("1", "Home win"), leg("2", "Over 1.5 goals")], stake: 20 }, now);
    const partial = gradePaperParlay(card, [{ fixtureId: "1", completed: true, homeGoals: 2, awayGoals: 1 }]);
    expect(partial.status).toBe("open");
    const winner = gradePaperParlay(card, [{ fixtureId: "1", completed: true, homeGoals: 2, awayGoals: 1 }, { fixtureId: "2", completed: true, homeGoals: 1, awayGoals: 1 }]);
    expect(winner.status).toBe("won");
    expect(winner.payout).toBeCloseTo(card.stake * card.decimalOdds);
  });
  it("loses as soon as any settled leg loses", () => {
    const card = createPaperParlay({ kind: "manual", legs: [leg("1", "Home win"), leg("2", "Away win")], stake: 20 }, now);
    expect(gradePaperParlay(card, [{ fixtureId: "1", completed: true, homeGoals: 0, awayGoals: 1 }]).status).toBe("lost");
  });
});
