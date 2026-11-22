import type { Fixture, Forecast, LineupIntelligence } from "./types";
import type { PricedCard } from "./priced-cards";

export type AIAnalysis = {
  verdict: "RESEARCH" | "CAUTION" | "PASS";
  headline: string;
  evidence: string[];
  risks: string[];
  missingData: string[];
  conclusion: string;
};

export type AIAnalysisResponse = {
  analysis: AIAnalysis;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

/** Only facts already in the deterministic model and ESPN lineup payload are sent. */
export function fixtureAIContext(fixture: Fixture, model: Forecast, lineup: LineupIntelligence) {
  return {
    analysisType: "fixture" as const,
    match: {
      fixtureId: fixture.id, competition: fixture.league, kickoff: fixture.kickoff,
      matchStatus: fixture.status,
      home: fixture.home.name, away: fixture.away.name,
      homeSeasonRecord: fixture.home.record ?? null,
      awaySeasonRecord: fixture.away.record ?? null,
      fixtureSource: fixture.source, fixtureUpdatedAt: fixture.sourceUpdatedAt,
    },
    model: {
      version: model.modelVersion, quality: model.dataQuality,
      expectedHomeGoals: model.expectedHomeGoals,
      expectedAwayGoals: model.expectedAwayGoals,
      lowScoreCorrelation: model.lowScoreCorrelation,
      homeWin: model.homeWin, draw: model.draw, awayWin: model.awayWin,
      scorelines: model.scorelines.slice(0, 5),
      markets: model.markets.slice(0, 12).map((m) => ({
        market: m.label, probability: m.probability, modelFairOdds: m.fairAmerican,
      })),
      evidence: model.evidence.slice(0, 8), risks: model.risks.slice(0, 8),
    },
    lineups: {
      source: "ESPN", checkedAt: lineup.checkedAt, minutesToKickoff: lineup.minutesToKickoff,
      homeStatus: lineup.home.status, awayStatus: lineup.away.status,
      homePreviouslyObservedMatches: lineup.home.observedMatches,
      awayPreviouslyObservedMatches: lineup.away.observedMatches,
      confirmedImpactApplied: lineup.impact.applied,
      homeMissingPlayers: lineup.home.missingPlayers.slice(0, 5).map((p) => p.name + ": " + p.reason),
      awayMissingPlayers: lineup.away.missingPlayers.slice(0, 5).map((p) => p.name + ": " + p.reason),
      warnings: lineup.warnings.slice(0, 6),
    },
    limitations: ["No independently verified live injury or tactical news feed", "Probabilities not yet calibrated out of sample", "Model fair odds are NOT offered sportsbook quotes"],
  };
}

/** User may audit an already constructed card, but the AI cannot change its legs or price. */
export function parlayAIContext(card: PricedCard) {
  return {
    analysisType: "parlay" as const,
    type: card.kind,
    bookmaker: card.bookmaker,
    bookKey: card.bookKey,
    combinedQuotedAmerican: card.combinedAmerican,
    combinedQuotedDecimal: card.combinedDecimal,
    uncalibratedJointProbability: card.jointProbability,
    targets: { dailyDoubleAmerican: 100, bangerAmerican: 400 },
    legs: card.legs.map((leg) => ({
      fixtureId: leg.fixtureId, match: leg.fixtureLabel,
      league: leg.league, kickoff: leg.kickoff,
      market: leg.market, modelProbability: leg.probability,
      quotedAmericanOdds: leg.americanOdds, impliedBookProbability: leg.impliedProbability,
      uncalibratedModelEdge: leg.modelEdge, bookmaker: leg.bookmaker,
      oddsSource: leg.source, lastProviderUpdate: leg.updatedAt,
    })),
    notes: card.notes,
    limitations: ["All probabilities are uncalibrated estimates", "Independence between legs is an approximation", "Offered prices may differ by region and become stale", "Never substitute nonexistent betting lines"],
  };
}

export function isAIAnalysis(value: unknown): value is AIAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const properList = (value: unknown) =>
    Array.isArray(value) && value.length <= 8 && value.every((s) => typeof s === "string" && s.length <= 600);
  return (item.verdict === "RESEARCH" || item.verdict === "CAUTION" || item.verdict === "PASS") &&
    typeof item.headline === "string" && item.headline.length <= 400 &&
    typeof item.conclusion === "string" && item.conclusion.length <= 800 &&
    properList(item.evidence) && properList(item.risks) && properList(item.missingData);
}
