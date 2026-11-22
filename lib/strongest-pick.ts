import type { Fixture, Forecast, MarketProbability } from "./types";
import type { HistoricalMatch } from "./history";
import type { MarketQuote } from "./market-odds";
import { pricedCandidates } from "./priced-cards";
import { forecastWithHistory } from "./historical-forecast";

const HORIZON_MS = 72 * 60 * 60 * 1000;
const UNPRICED_MARKETS = new Set(["home", "away", "over-1.5", "over-2.5", "under-3.5", "btts"]);

/** Same moderate-probability market filter for dashboard and match detail pages. */
export function strongestUnpricedMarket(forecast: Forecast): MarketProbability | null {
  if (forecast.dataQuality === "insufficient") return null;
  return forecast.markets.find((market) =>
    UNPRICED_MARKETS.has(market.key) &&
    market.probability >= 0.62 && market.probability <= 0.78
  ) ?? null;
}

export type StrongestPick = {
  fixtureId: string;
  marketKey: string;
  fixtureLabel: string;
  league: string;
  kickoff: string;
  market: string;
  probability: number;
  quality: Forecast["dataQuality"];
  modelVersion: string;
  evidence: string;
  pricing: "quoted" | "unpriced";
  quotedAmerican: number | null;
  bookmaker: string | null;
  updatedAt: string | null;
  indicativeEdge: number | null;
};

export function strongestModelPick(
  fixtures: Fixture[], quotes: MarketQuote[], history: HistoricalMatch[] = [], now = Date.now(),
  horizonMs = HORIZON_MS,
): StrongestPick | null {
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const withinHorizon = (kickoff: string) => {
    const time = Date.parse(kickoff);
    return Number.isFinite(time) && time > now && time - now <= horizonMs;
  };
  const priced = pricedCandidates(fixtures, quotes, history, now)
    .filter((candidate) => withinHorizon(candidate.kickoff))
    .map((candidate) => {
      const fixture = fixtureById.get(candidate.fixtureId)!;
      const forecast = forecastWithHistory(fixture, history);
      return { candidate, forecast };
    })
    .sort((a, b) =>
      Number(b.forecast.dataQuality === "good") - Number(a.forecast.dataQuality === "good") ||
      b.candidate.probability - a.candidate.probability ||
      b.candidate.modelEdge - a.candidate.modelEdge ||
      a.candidate.kickoff.localeCompare(b.candidate.kickoff));
  if (priced.length) {
    const { candidate, forecast } = priced[0];
    return {
      fixtureId: candidate.fixtureId, marketKey: candidate.marketKey, fixtureLabel: candidate.fixtureLabel,
      league: candidate.league, kickoff: candidate.kickoff,
      market: forecast.markets.find((market) => market.key === candidate.marketKey)?.label ?? candidate.market,
      probability: candidate.probability, quality: forecast.dataQuality,
      modelVersion: forecast.modelVersion, evidence: forecast.evidence[0] ?? "Model scoring estimate",
      pricing: "quoted", quotedAmerican: candidate.americanOdds, bookmaker: candidate.bookmaker,
      updatedAt: candidate.updatedAt, indicativeEdge: candidate.modelEdge,
    };
  }

  // A model-only lean is NOT a priced bet. Reject extreme near-certain fair
  // markets and unsupported fixtures instead of displaying cheap -1100-style legs.
  const unpriced = fixtures.filter((f) => f.status === "scheduled" && withinHorizon(f.kickoff))
    .flatMap((fixture) => {
      const forecast = forecastWithHistory(fixture, history);
      const market = strongestUnpricedMarket(forecast);
      return market ? [{ fixture, forecast, market }] : [];
    }).sort((a, b) =>
      Number(b.forecast.dataQuality === "good") - Number(a.forecast.dataQuality === "good") ||
      b.market.probability - a.market.probability ||
      a.fixture.kickoff.localeCompare(b.fixture.kickoff));
  if (!unpriced.length) return null;
  const { fixture, forecast, market } = unpriced[0];
  return {
    fixtureId: fixture.id, marketKey: market.key, fixtureLabel: fixture.home.shortName + " vs " + fixture.away.shortName,
    league: fixture.league, kickoff: fixture.kickoff, market: market.label,
    probability: market.probability, quality: forecast.dataQuality,
    modelVersion: forecast.modelVersion, evidence: forecast.evidence[0] ?? "Model scoring estimate",
    pricing: "unpriced", quotedAmerican: null, bookmaker: null,
    updatedAt: null, indicativeEdge: null,
  };
}
