import type { Fixture } from "./types";
import type { HistoricalMatch } from "./history";
import type { MarketQuote, MarketKey } from "./market-odds";
import { forecastWithHistory } from "./historical-forecast";
import { americanToDecimal, decimalToAmerican, impliedProbability } from "./odds";

export type PricedLeg = MarketQuote & {
  fixtureLabel: string;
  league: string;
  leagueId: Fixture["leagueId"];
  kickoff: string;
  market: string;
  probability: number;
  impliedProbability: number;
  modelEdge: number;
};
export type PricedCard = {
  kind: "daily-double" | "banger";
  legs: PricedLeg[];
  bookmaker: string | null;
  bookKey: string | null;
  combinedAmerican: number | null;
  combinedDecimal: number | null;
  jointProbability: number | null;
  notes: string[];
};

const marketText: Record<MarketKey, string> = {
  home: "Home win", draw: "Draw", away: "Away win",
  "home-draw": "Home or draw", "away-draw": "Away or draw",
  "over-1.5": "Over 1.5 goals", "over-2.5": "Over 2.5 goals",
  "under-3.5": "Under 3.5 goals", btts: "Both teams to score",
};
export const MIN_ACCEPTED_AMERICAN = -350;
export const MIN_ACCEPTED_PROBABILITY = 0.60;
// Qualified, market-specific OOS calibration may be applied to price estimates.
// Any model edge remains a research filter, never proof of profitability.
export const MIN_INDICATIVE_EDGE = 0.01;

export function pricedCandidates(
  fixtures: Fixture[], quotes: MarketQuote[], history: HistoricalMatch[] = [], now = Date.now(),
): PricedLeg[] {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const forecastCache = new Map<string, ReturnType<typeof forecastWithHistory>>();
  const candidates: PricedLeg[] = [];
  for (const quote of quotes) {
    const fixture = byId.get(quote.fixtureId);
    if (!fixture || fixture.status !== "scheduled" || Date.parse(fixture.kickoff) <= now) continue;
    if (!Number.isFinite(Date.parse(quote.updatedAt)) || Date.parse(quote.updatedAt) > now + 60000 ||
      Date.parse(quote.updatedAt) < now - 24 * 3600000) continue;
    // Negative odds smaller than -350 (such as -1100) are excluded.
    if (quote.americanOdds < MIN_ACCEPTED_AMERICAN) continue;
    let forecast = forecastCache.get(fixture.id);
    if (!forecast) { forecast = forecastWithHistory(fixture, history); forecastCache.set(fixture.id, forecast); }
    if (forecast.dataQuality === "insufficient") continue;
    const market = forecast.markets.find((item) => item.key === quote.marketKey);
    if (!market || market.probability < MIN_ACCEPTED_PROBABILITY) continue;
    const implied = impliedProbability(quote.americanOdds);
    const edge = market.probability - implied;
    if (edge < MIN_INDICATIVE_EDGE) continue;
    candidates.push({
      ...quote, fixtureLabel: fixture.home.shortName + " vs " + fixture.away.shortName,
      league: fixture.league, leagueId: fixture.leagueId, kickoff: fixture.kickoff, market: marketText[quote.marketKey],
      probability: market.probability, impliedProbability: implied, modelEdge: edge,
    });
  }
  return candidates;
}

const scoreCandidate = (leg: PricedLeg) => leg.probability + 0.28 * leg.modelEdge;

export function buildPricedCard(
  fixtures: Fixture[], quotes: MarketQuote[], kind: PricedCard["kind"],
  history: HistoricalMatch[] = [], now = Date.now(),
): PricedCard {
  const fail = (message: string): PricedCard => ({
    kind, legs: [], bookmaker: null, bookKey: null,
    combinedAmerican: null, combinedDecimal: null, jointProbability: null,
    notes: [message],
  });
  if (!quotes.length) return fail("No current bookmaker quotes were returned. Configure a free odds API key or use manual prices.");
  const candidates = pricedCandidates(fixtures, quotes, history, now);
  if (!candidates.length) return fail("PASS: no sufficiently priced, qualified selections. -1100-style legs are rejected.");

  const byBook = new Map<string, PricedLeg[]>();
  for (const leg of candidates) byBook.set(leg.bookKey, [...(byBook.get(leg.bookKey) ?? []), leg]);
  const minLegs = kind === "daily-double" ? 2 : 3;
  const maxLegs = kind === "daily-double" ? 5 : 6;
  const targetDecimal = kind === "daily-double" ? 2 : 5;
  let best: { legs: PricedLeg[]; decimal: number; probability: number } | null = null;

  // Evaluate same-bookmaker combinations only; never represent cross-bookmaker
  // prices as a single placeable parlay.
  for (const bookLegs of byBook.values()) {
    const perMatch = new Map<string, PricedLeg>();
    for (const leg of bookLegs) {
      const previous = perMatch.get(leg.fixtureId);
      if (!previous || scoreCandidate(leg) > scoreCandidate(previous)) perMatch.set(leg.fixtureId, leg);
    }
    const pool = [...perMatch.values()]
      .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
      .slice(0, 16);
    if (pool.length < minLegs) continue;
    const visit = (selected: PricedLeg[], start: number, decimal: number, probability: number) => {
      if (selected.length >= minLegs && decimal >= targetDecimal) {
        if (!best || selected.length < best.legs.length ||
          (selected.length === best.legs.length && probability > best.probability)) {
          best = { legs: [...selected], decimal, probability };
        }
        return;
      }
      if (selected.length >= maxLegs || start >= pool.length ||
        (best && selected.length >= best.legs.length)) return;
      for (let i = start; i < pool.length; i++) {
        const leg = pool[i];
        visit([...selected, leg], i + 1, decimal * americanToDecimal(leg.americanOdds), probability * leg.probability);
      }
    };
    visit([], 0, 1, 1);
  }

  if (!best) return fail("PASS: no same-bookmaker parlay reaches the required combined price using qualified legs.");
  const selected: { legs: PricedLeg[]; decimal: number; probability: number } = best;
  return {
    kind, legs: selected.legs, bookmaker: selected.legs[0].bookmaker, bookKey: selected.legs[0].bookKey,
    combinedAmerican: decimalToAmerican(selected.decimal), combinedDecimal: selected.decimal,
    jointProbability: selected.probability,
    notes: [
      "Quoted market prices from one bookmaker, not guaranteed executable at your location.",
      "No legs shorter than -350. Every market must clear a 1 percentage-point indicative model edge threshold.",
      "Market probabilities use only approved held-out calibration when available; other markets stay raw.",
      "Estimated parlay hit rates assume independence across fixtures and can overstate the true chance of winning.",
      "Recheck current odds and market availability before taking any action. Paper research only.",
    ],
  };
}
