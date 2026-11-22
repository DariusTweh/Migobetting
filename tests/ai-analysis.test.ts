import { afterEach, describe, expect, it, vi } from "vitest";
import { isAIAnalysis, fixtureAIContext, parlayAIContext } from "../lib/ai-analysis";
import { forecastFixture } from "../lib/model";
import type { Fixture, LineupIntelligence } from "../lib/types";
import type { PricedCard } from "../lib/priced-cards";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const fixture: Fixture = {
  id: "fixture-123", leagueId: "eng.1", league: "Premier League", kickoff: "2030-01-05T14:00:00Z",
  status: "scheduled", statusLabel: "Scheduled",
  home: { id: "h", name: "Arsenal", shortName: "Arsenal", abbreviation: "ARS", record: "12-3-3" },
  away: { id: "a", name: "Everton", shortName: "Everton", abbreviation: "EVE", record: "4-3-10" },
  source: "ESPN", sourceUpdatedAt: "2030-01-01T14:00:00Z",
};
const lineups = {
  fixtureId: fixture.id, checkedAt: "2030-01-01T14:00:00Z", minutesToKickoff: 3000,
  home: { status: "PROJECTED", observedMatches: 8, missingPlayers: [] },
  away: { status: "UNKNOWN", observedMatches: 0, missingPlayers: [] },
  impact: { applied: false }, warnings: ["No confirmed lineup"],
} as unknown as LineupIntelligence;

describe("bounded MIGO AI snapshots", () => {
  it("sends fixture model evidence while distinguishing missing lineup information", () => {
    const model = forecastFixture(fixture);
    const snap = fixtureAIContext(fixture, model, lineups);
    expect(snap.model.homeWin).toBe(model.homeWin);
    expect(snap.model.expectedHomeGoals).toBe(model.expectedHomeGoals);
    expect(snap.lineups.awayStatus).toBe("UNKNOWN");
    expect(snap.limitations.some((item) => item.includes("NOT offered sportsbook"))).toBe(true);
  });
  it("passes original bookmaker prices and prices metadata to the parlay audit without changing selections", () => {
    const card: PricedCard = {
      kind: "daily-double", bookmaker: "Pinnacle", bookKey: "rundown:3",
      combinedAmerican: 125, combinedDecimal: 2.25, jointProbability: 0.42, notes: [],
      legs: [{
        fixtureId: "fixture-123", fixtureLabel: "Arsenal vs Everton", league: "Premier League",
        leagueId: "eng.1", kickoff: fixture.kickoff, market: "Home win", marketKey: "home",
        americanOdds: -135, bookmaker: "Pinnacle", bookKey: "rundown:3",
        source: "TheRundown", updatedAt: "2030-01-04T10:00:00Z",
        probability: 0.7, impliedProbability: 0.574, modelEdge: 0.126,
      }],
    };
    const before = JSON.stringify(card);
    const snap = parlayAIContext(card);
    expect(snap.legs[0].quotedAmericanOdds).toBe(-135);
    expect(snap.legs[0].oddsSource).toBe("TheRundown");
    expect(JSON.stringify(card)).toBe(before);
  });
  it("accepts only bounded structured audits", () => {
    const valid = {
      verdict: "CAUTION", headline: "Insufficient confirmed team news",
      evidence: ["Model lists Arsenal home expectancy of 1.8"], risks: ["No confirmed XI"],
      missingData: ["Confirmed injuries"], conclusion: "Do not treat raw model odds as a bookmaker offer.",
    };
    expect(isAIAnalysis(valid)).toBe(true);
    expect(isAIAnalysis({ ...valid, verdict: "GUARANTEED" })).toBe(false);
    expect(isAIAnalysis({ ...valid, evidence: [123] })).toBe(false);
  });
});
