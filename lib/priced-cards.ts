import type { Fixture } from "./types";
import type { HistoricalMatch } from "./history";
import type { MarketQuote, MarketKey } from "./market-odds";
import { forecastWithHistory } from "./historical-forecast";
import { americanToDecimal, decimalToAmerican, impliedProbability } from "./odds";
import { todayUpcomingFixtures } from "./daily-slate";

export type CardPricing = "quoted" | "model-fair" | "none";
export type PricedLeg = Omit<MarketQuote, "source"> & {
  source: MarketQuote["source"] | "MIGO Fair";
  pricing: "quoted" | "model-fair";
  fairAmerican: number;
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
  pricing: CardPricing;
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
  "over-0.5": "Over 0.5 goals", "over-1.5": "Over 1.5 goals",
  "over-2.5": "Over 2.5 goals", "over-3.5": "Over 3.5 goals",
  "under-1.5": "Under 1.5 goals", "under-2.5": "Under 2.5 goals",
  "under-3.5": "Under 3.5 goals", "under-4.5": "Under 4.5 goals",
  "home-over-0.5": "Home team over 0.5 goals",
  "away-over-0.5": "Away team over 0.5 goals",
  "home-over-1.5": "Home team over 1.5 goals",
  "away-over-1.5": "Away team over 1.5 goals",
  btts: "Both teams to score",
};
export const MIN_ACCEPTED_AMERICAN = -350;
export const MIN_ACCEPTED_PROBABILITY = 0.60;
export const MAX_FAIR_PROBABILITY = 1 / americanToDecimal(MIN_ACCEPTED_AMERICAN);
// A priced quote can be compared with the model; fair prices have no market edge.
export const MIN_INDICATIVE_EDGE = 0.01;

/** Actual bookmaker quotes are an optional annotation, never a prerequisite to make picks. */
export function pricedCandidates(
  fixtures: Fixture[], quotes: MarketQuote[], history: HistoricalMatch[] = [], now = Date.now(),
): PricedLeg[] {
  const byId = new Map(fixtures.map(f => [f.id, f]));
  const forecastCache = new Map<string, ReturnType<typeof forecastWithHistory>>();
  const candidates: PricedLeg[] = [];
  for (const quote of quotes) {
    const fixture = byId.get(quote.fixtureId);
    if (!fixture || fixture.status !== "scheduled" || Date.parse(fixture.kickoff) <= now) continue;
    const updated = Date.parse(quote.updatedAt);
    if (!Number.isFinite(updated) || updated > now + 60000 || updated < now - 24 * 3600000) continue;
    if (quote.americanOdds < MIN_ACCEPTED_AMERICAN) continue;
    let forecast = forecastCache.get(fixture.id);
    if (!forecast) { forecast = forecastWithHistory(fixture, history); forecastCache.set(fixture.id, forecast); }
    if (forecast.dataQuality === "insufficient") continue;
    const market = forecast.markets.find(item => item.key === quote.marketKey);
    if (!market || market.probability < MIN_ACCEPTED_PROBABILITY) continue;
    const implied = impliedProbability(quote.americanOdds);
    const edge = market.probability - implied;
    if (edge < MIN_INDICATIVE_EDGE) continue;
    candidates.push({
      ...quote, pricing: "quoted", fairAmerican: market.fairAmerican,
      fixtureLabel: fixture.home.shortName + " vs " + fixture.away.shortName,
      league: fixture.league, leagueId: fixture.leagueId, kickoff: fixture.kickoff,
      market: marketText[quote.marketKey], probability: market.probability,
      impliedProbability: implied, modelEdge: edge,
    });
  }
  return candidates;
}

/** A synthetic break-even *fair price* derived from the model, not a bookmaker offer. */
export function modelFairCandidates(
  fixtures: Fixture[], history: HistoricalMatch[] = [], now = Date.now(),
): PricedLeg[] {
  const eligible = todayUpcomingFixtures(fixtures, now);
  return eligible.flatMap(fixture => {
    const forecast = forecastWithHistory(fixture, history);
    if (forecast.dataQuality === "insufficient") return [];
    return forecast.markets.flatMap(market => {
      if (!(market.key in marketText) || !Number.isFinite(market.probability) ||
          market.probability < MIN_ACCEPTED_PROBABILITY ||
          market.probability > MAX_FAIR_PROBABILITY) return [];
      const p = market.probability;
      const fairAmerican = decimalToAmerican(1 / p);
      return [{
        fixtureId: fixture.id, marketKey: market.key as MarketKey,
        americanOdds: fairAmerican, fairAmerican,
        pricing: "model-fair" as const, bookmaker: "MIGO model (not a sportsbook)",
        bookKey: "migo:fair", source: "MIGO Fair" as const,
        updatedAt: new Date(now).toISOString(),
        fixtureLabel: fixture.home.shortName + " vs " + fixture.away.shortName,
        league: fixture.league, leagueId: fixture.leagueId, kickoff: fixture.kickoff,
        market: marketText[market.key as MarketKey], probability: p,
        impliedProbability: p, modelEdge: 0,
      }];
    });
  });
}

/** Choose from alternate goals markets and team goals with one leg per match.
 * Optimize for fewest legs that reach the model-fair +100/+400 target,
 * followed by highest joint estimated probability. Never pad with tomorrow.
 */
function bestFairCombination(candidates: PricedLeg[], kind: PricedCard["kind"]): PricedLeg[] {
  const byMatch = new Map<string, PricedLeg[]>();
  for (const leg of candidates) byMatch.set(leg.fixtureId,[...(byMatch.get(leg.fixtureId)??[]),leg]);
  const groups = [...byMatch.values()]
    .sort((a,b) => b[0].probability - a[0].probability)
    .slice(0,12)
    .map(group => {
      const ranked = group.sort((a,b) => b.probability-a.probability);
      const options = [ranked[0],
        [...ranked].sort((a,b) => Math.abs(a.probability-.70)-Math.abs(b.probability-.70))[0],
        [...ranked].sort((a,b) => Math.abs(a.probability-.61)-Math.abs(b.probability-.61))[0],
      ];
      return [...new Map(options.map(m=>[m.marketKey,m])).values()];
    });
  const minLegs = kind === "daily-double" ? 2 : 3;
  const maxLegs = kind === "daily-double" ? 5 : 6;
  const maxJoint = kind === "daily-double" ? .5 : .2;
  for (let count = minLegs; count <= Math.min(groups.length,maxLegs); count++) {
    let best: PricedLeg[] = [];
    let highestP = 0;
    const explore = (i:number, picked:PricedLeg[], p:number) => {
      if (picked.length === count) {
        if (p <= maxJoint + 1e-9 && p > highestP) {
          highestP = p; best = [...picked];
        }
        return;
      }
      if (groups.length - i < count - picked.length || i >= groups.length) return;
      explore(i+1,picked,p);
      for (const leg of groups[i]) explore(i+1,[...picked,leg],p*leg.probability);
    };
    explore(0,[],1);
    if (best.length) return best.sort((a,b)=>a.kickoff.localeCompare(b.kickoff));
  }
  return [];
}

/** Check real, fresh quotes for the exact model-chosen markets. Do not mix books
 * or relabel a simulated fair card as an executable bookmaker ticket.
 */
function fullyQuotedSameBook(
  selected: PricedLeg[], quotes: PricedLeg[], targetDecimal: number,
): { legs: PricedLeg[]; decimal: number; bookKey: string; bookmaker: string } | null {
  const byBook = new Map<string,PricedLeg[]>();
  for(const leg of quotes)byBook.set(leg.bookKey,[...(byBook.get(leg.bookKey)??[]),leg]);
  let best: {legs:PricedLeg[];decimal:number;bookKey:string;bookmaker:string}|null=null;
  for(const [key,prices] of byBook){
    const picked = selected.map(s => prices.filter(p =>
      p.fixtureId === s.fixtureId && p.marketKey === s.marketKey)
      .sort((a,b)=>b.americanOdds-a.americanOdds)[0]);
    if(picked.some(p=>!p))continue;
    const legs=picked as PricedLeg[];
    const decimal=legs.reduce((v,leg)=>v*americanToDecimal(leg.americanOdds),1);
    if(decimal < targetDecimal)continue;
    if(!best || decimal > best.decimal)best={legs,decimal,bookKey:key,bookmaker:legs[0].bookmaker};
  }
  return best;
}

export function buildPricedCard(
  fixtures: Fixture[], quotes: MarketQuote[], kind: PricedCard["kind"],
  history: HistoricalMatch[] = [], now = Date.now(),
): PricedCard {
  const fail = (message:string):PricedCard => ({
    kind,pricing:"none",legs:[],bookmaker:null,bookKey:null,
    combinedAmerican:null,combinedDecimal:null,jointProbability:null,notes:[message],
  });
  const slate=todayUpcomingFixtures(fixtures,now);
  if(!slate.length)return fail("PASS: no remaining scheduled matches today (Pacific time). No tomorrow games.");
  const modelPicks=bestFairCombination(modelFairCandidates(slate,history,now),kind);
  if(!modelPicks.length)return fail("PASS: no qualified same-day model-fair card reaches the target without short-price legs. Bookmaker quotes are not required.");
  const joint=modelPicks.reduce((p,leg)=>p*leg.probability,1);
  const fairDecimal=1/joint;
  const target=kind==="daily-double"?2:5;
  const quoted=fullyQuotedSameBook(modelPicks,pricedCandidates(slate,quotes,history,now),target);
  if(quoted)return {
    kind,pricing:"quoted",legs:quoted.legs,bookmaker:quoted.bookmaker,
    bookKey:quoted.bookKey,combinedAmerican:decimalToAmerican(quoted.decimal),
    combinedDecimal:quoted.decimal,jointProbability:joint,
    notes:[
      "All legs were chosen by model probabilities, not limited by sportsbook market availability.",
      "These exact selections have independently matched quoted prices from one bookmaker.",
      "Market odds and availability may change; recheck before acting.",
      "Combined model probability assumes independence across games; it is not a guarantee.",
    ],
  };
  return {
    kind,pricing:"model-fair",legs:modelPicks,bookmaker:null,bookKey:null,
    combinedAmerican:decimalToAmerican(fairDecimal),combinedDecimal:fairDecimal,
    jointProbability:joint,
    notes:[
      "MODEL FAIR PRICE ONLY: a mathematical break-even estimate derived from model probabilities.",
      "These are not offered sportsbook odds, an executable +100/+400 ticket, or a proven pricing edge.",
      "Alternate total-goals and team-goals lines are modeled from the full-time score distribution.",
      "Enter real bookmaker prices in Pick Builder before recording a priced paper ticket.",
      "Estimated joint probability assumes independence across fixtures.",
    ],
  };
}
