import { describe, expect, it } from "vitest";
import { createAutoPaperParlay, createPaperParlay, gradePaperParlay } from "../lib/paper-parlays";
import type { LockedParlayLeg } from "../lib/paper-parlays";
import type { PricedCard } from "../lib/priced-cards";

const future = "2029-12-01T18:00:00Z"; // Same Pacific date as the paper slip lock
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
  it("disallows any future-day Daily Double or Banger but leaves custom parlays flexible", () => {
    const tomorrow = { ...leg("3","Home win"), kickoff: "2029-12-02T18:00:00Z" };
    expect(() => createPaperParlay({
      kind:"daily-double",legs:[leg("1","Home win"),tomorrow],stake:10,
    },now)).toThrow(/today's remaining matches/);
    expect(() => createPaperParlay({
      kind:"banger",legs:[leg("1","Home win"),tomorrow],stake:10,
    },now)).toThrow(/today's remaining matches/);
    expect(createPaperParlay({kind:"manual",legs:[leg("1","Home win"),tomorrow],stake:10},now).legs).toHaveLength(2);
  });
  it("grades a winning ticket only after every leg completes", () => {
    const card = createPaperParlay({ kind: "manual", legs: [leg("1", "Home win"), leg("2", "Over 1.5 goals")], stake: 20 }, now);
    const partial = gradePaperParlay(card, [{ fixtureId: "1", completed: true, homeGoals: 2, awayGoals: 1 }]);
    expect(partial.status).toBe("open");
    expect(partial.legs[0].result).toEqual({ status: "won", homeGoals: 2, awayGoals: 1 });
    const winner = gradePaperParlay(card, [{ fixtureId: "1", completed: true, homeGoals: 2, awayGoals: 1 }, { fixtureId: "2", completed: true, homeGoals: 1, awayGoals: 1 }]);
    expect(winner.status).toBe("won");
    expect(winner.payout).toBeCloseTo(card.stake * card.decimalOdds);
  });
  it("loses as soon as any settled leg loses", () => {
    const card = createPaperParlay({ kind: "manual", legs: [leg("1", "Home win"), leg("2", "Away win")], stake: 20 }, now);
    expect(gradePaperParlay(card, [{ fixtureId: "1", completed: true, homeGoals: 0, awayGoals: 1 }]).status).toBe("lost");
  });
  it("creates one immutable $10 auto-tracked Daily Double for the calendar day", () => {
    const priced = {
      kind: "daily-double", pricing: "quoted",
      legs: [
        { ...leg("1", "Home win"), league: "Premier League", marketKey: "home", bookmaker: "DraftKings", bookKey: "dk", source: "TheRundown", updatedAt: "2029-12-01T11:55:00Z", probability: 0.7, impliedProbability: 0.55, modelEdge: 0.15, pricing: "quoted", fairAmerican: -233 },
        { ...leg("2", "Over 1.5 goals"), league: "Premier League", marketKey: "over-1.5", bookmaker: "DraftKings", bookKey: "dk", source: "TheRundown", updatedAt: "2029-12-01T11:55:00Z", probability: 0.75, impliedProbability: 0.55, modelEdge: 0.2, pricing: "quoted", fairAmerican: -300 },
      ],
      bookmaker: "DraftKings", bookKey: "dk", combinedAmerican: 264, combinedDecimal: 3.64,
      jointProbability: 0.525, notes: [],
    } as PricedCard;
    const tracked = createAutoPaperParlay(priced, now);
    expect(tracked).toMatchObject({
      id: "migo-auto:daily-double:2029-12-01",
      origin: "migo-auto",
      stake: 10,
      status: "open",
    });
    expect(tracked?.legs).toHaveLength(2);
    const futureDay={...priced,legs:priced.legs.map(leg=>({...leg,kickoff:"2029-12-02T18:00:00Z"}))};
    expect(createAutoPaperParlay(futureDay,now)).toBeNull();
    const modelFair={...priced,pricing:"model-fair" as const,
      legs:priced.legs.map(leg=>({...leg,pricing:"model-fair" as const,source:"MIGO Fair" as const}))};
    expect(createAutoPaperParlay(modelFair,now)).toBeNull();
  });
});
