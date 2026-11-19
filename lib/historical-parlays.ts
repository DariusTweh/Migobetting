import type { BacktestPrediction, HistoricalMatch, MarketSelection } from "./history";
import { settlesBacktestSelection } from "./history";

/** Decimal prices supplied in imported historical CSVs. No quote-time guarantee. */
export type HistoricalPricePolicy = "recorded-untimestamped";
export type HistoricalParlayStrategy = "daily-double" | "banger";
export type HistoricalParlayConfig = {
  strategy: HistoricalParlayStrategy;
  minProbability: number;
  minEdge: number;
  maxLegs: number;
  stake: number;
};
export type HistoricalParlayLeg = {
  matchId: string;
  date: string;
  competition: string;
  fixture: string;
  selection: MarketSelection;
  probability: number;
  decimalOdds: number;
  expectedValue: number;
  won: boolean;
};
export type HistoricalParlayCard = {
  date: string;
  legs: HistoricalParlayLeg[];
  decimalOdds: number;
  estimatedWinProbability: number;
  won: boolean;
  hypotheticalProfit: number;
};
export type HistoricalParlayResult = {
  cards: HistoricalParlayCard[];
  testedDates: number;
  skippedDates: number;
  evaluatedFixtures: number;
  pricedFixtures: number;
  qualifiedFixtures: number;
  cardsWon: number;
  cardsLost: number;
  stakeTotal: number;
  hypotheticalProfit: number;
  hypotheticalRoi: number | null;
  pricePolicy: HistoricalPricePolicy;
  warnings: string[];
};

type Candidate = HistoricalParlayLeg;

function priceOptions(prediction: BacktestPrediction, match: HistoricalMatch): Candidate[] {
  const p = prediction.probabilities;
  const possibilities: Array<[MarketSelection, number, number | undefined]> = [
    ["Home", p.home, match.odds?.home],
    ["Draw", p.draw, match.odds?.draw],
    ["Away", p.away, match.odds?.away],
    ["Over 2.5", p.over25, match.odds?.over25],
    ["Under 2.5", p.under25, match.odds?.under25],
  ];
  return possibilities.flatMap(([selection, probability, decimalOdds]) => {
    if (decimalOdds === undefined || !Number.isFinite(decimalOdds) || decimalOdds <= 1 || probability < 0 || probability > 1) return [];
    return [{
      matchId: match.id,
      date: prediction.date,
      competition: prediction.competition,
      fixture: prediction.homeTeam + " vs " + prediction.awayTeam,
      selection, probability, decimalOdds,
      expectedValue: probability * decimalOdds - 1,
      won: settlesBacktestSelection(selection, match),
    }];
  });
}

/**
 * Research-only retrospective replay. Historical provider CSV prices lack verified
 * publication timestamps, so profits are hypothetical and NOT executable returns.
 * Uses only existing out-of-sample forecasts, never final scores to choose legs.
 */
export function runHistoricalParlayReplay(
  predictions: BacktestPrediction[], matches: HistoricalMatch[], config: HistoricalParlayConfig,
): HistoricalParlayResult {
  if (!Number.isFinite(config.minProbability) || config.minProbability < 0 || config.minProbability > 1 ||
      !Number.isFinite(config.minEdge) || config.minEdge < 0 ||
      !Number.isInteger(config.maxLegs) || config.maxLegs < 2 || config.maxLegs > 6 ||
      !Number.isFinite(config.stake) || config.stake <= 0) {
    throw new Error("Invalid historical parlay settings");
  }
  const target = config.strategy === "banger" ? 5 : 2;
  const byMatch = new Map(matches.map((match) => [match.id, match]));
  const byDate = new Map<string, Candidate[]>();
  let pricedFixtures = 0;
  let qualifiedFixtures = 0;
  for (const prediction of predictions) {
    const match = byMatch.get(prediction.matchId);
    if (!match) continue;
    const available = priceOptions(prediction, match);
    if (available.length) pricedFixtures += 1;
    const eligible = available.filter((leg) => leg.probability >= config.minProbability && leg.expectedValue >= config.minEdge);
    // Allow only one market per match: prioritize estimated value, then probability.
    eligible.sort((a, b) => b.expectedValue - a.expectedValue || b.probability - a.probability);
    if (!eligible.length) continue;
    qualifiedFixtures += 1;
    const day = prediction.date.slice(0, 10);
    byDate.set(day, [...(byDate.get(day) ?? []), eligible[0]]);
  }
  const cards: HistoricalParlayCard[] = [];
  for (const [day, candidates] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    // Cap combinatorial search while retaining the strongest positive-price signals.
    const pool = [...candidates].sort((a, b) => b.expectedValue - a.expectedValue || b.probability - a.probability).slice(0, 12);
    if (pool.length < 2) continue;
    let chosen: Candidate[] | null = null;
    let bestProbability = -1;
    for (let legs = 2; legs <= Math.min(config.maxLegs, pool.length); legs += 1) {
      function search(start: number, selected: Candidate[], decimal: number, probability: number): void {
        if (selected.length === legs) {
          if (decimal >= target && probability > bestProbability) {
            bestProbability = probability;
            chosen = [...selected];
          }
          return;
        }
        for (let index = start; index <= pool.length - (legs - selected.length); index += 1) {
          const candidate = pool[index];
          search(index + 1, [...selected, candidate], decimal * candidate.decimalOdds, probability * candidate.probability);
        }
      }
      search(0, [], 1, 1);
      // Fewest qualifying legs is an explicit Daily Double design rule.
      if (chosen) break;
    }
    if (!chosen) continue;
    const selected: Candidate[] = chosen;
    const decimalOdds = selected.reduce((product, leg) => product * leg.decimalOdds, 1);
    const estimatedWinProbability = selected.reduce((product, leg) => product * leg.probability, 1);
    const won = selected.every((leg) => leg.won);
    cards.push({
      date: day, legs: selected, decimalOdds, estimatedWinProbability, won,
      hypotheticalProfit: config.stake * (won ? decimalOdds - 1 : -1),
    });
  }
  const hypotheticalProfit = cards.reduce((sum, card) => sum + card.hypotheticalProfit, 0);
  const stakeTotal = cards.length * config.stake;
  const dates = new Set(predictions.map((item) => item.date.slice(0, 10)));
  return {
    cards, testedDates: dates.size, skippedDates: dates.size - cards.length,
    evaluatedFixtures: predictions.length, pricedFixtures, qualifiedFixtures,
    cardsWon: cards.filter((card) => card.won).length,
    cardsLost: cards.filter((card) => !card.won).length,
    stakeTotal, hypotheticalProfit,
    hypotheticalRoi: stakeTotal > 0 ? hypotheticalProfit / stakeTotal : null,
    pricePolicy: "recorded-untimestamped",
    warnings: [
      "Historical CSV price timestamps are not independently verified; these are hypothetical price-linked returns, not proven executable bets.",
      "Only 1X2 and Over/Under 2.5 are priced by the currently supported imported CSV columns; unpriced markets are excluded.",
      "Cards use one leg per fixture and assume different fixtures are independent.",
      "Selection thresholds were not tuned on an untouched forward test. Do not interpret these results as verified profitability.",
    ],
  };
}
