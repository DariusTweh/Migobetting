import { americanToDecimal } from "./odds";
import { createSeededRandom } from "./simulation";

export type StrategyInput = {
  startingBankroll: number;
  staking: "flat" | "percentage";
  stake: number;
  winProbability: number;
  americanOdds: number;
  bets: number;
  paths: number;
  seed: string;
};

export type StrategyResult = {
  median: number;
  percentile10: number;
  percentile90: number;
  medianMaxDrawdown: number;
  exhaustionProbability: number;
  medianLongestLosingStreak: number;
  endingBankrolls: number[];
};

function quantile(sorted: number[], probability: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * probability))] ?? 0;
}

export function simulateStrategy(input: StrategyInput): StrategyResult {
  if (input.startingBankroll <= 0 || input.paths < 1 || input.bets < 1) throw new Error("Invalid strategy dimensions");
  if (input.winProbability < 0 || input.winProbability > 1) throw new Error("Probability must be between zero and one");
  const random = createSeededRandom(input.seed);
  const decimal = americanToDecimal(input.americanOdds);
  const endingBankrolls: number[] = [];
  const drawdowns: number[] = [];
  const streaks: number[] = [];
  let exhausted = 0;

  for (let path = 0; path < input.paths; path += 1) {
    let bankroll = input.startingBankroll;
    let peak = bankroll;
    let maxDrawdown = 0;
    let losingStreak = 0;
    let longestLosingStreak = 0;
    for (let bet = 0; bet < input.bets && bankroll > 0.01; bet += 1) {
      const requestedStake = input.staking === "flat" ? input.stake : bankroll * (input.stake / 100);
      const risk = Math.min(bankroll, Math.max(0, requestedStake));
      if (random() < input.winProbability) {
        bankroll += risk * (decimal - 1);
        losingStreak = 0;
      } else {
        bankroll -= risk;
        losingStreak += 1;
        longestLosingStreak = Math.max(longestLosingStreak, losingStreak);
      }
      peak = Math.max(peak, bankroll);
      if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - bankroll) / peak);
    }
    if (bankroll <= 0.01) exhausted += 1;
    endingBankrolls.push(bankroll);
    drawdowns.push(maxDrawdown);
    streaks.push(longestLosingStreak);
  }

  endingBankrolls.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);
  streaks.sort((a, b) => a - b);
  return {
    median: quantile(endingBankrolls, 0.5),
    percentile10: quantile(endingBankrolls, 0.1),
    percentile90: quantile(endingBankrolls, 0.9),
    medianMaxDrawdown: quantile(drawdowns, 0.5),
    exhaustionProbability: exhausted / input.paths,
    medianLongestLosingStreak: quantile(streaks, 0.5),
    endingBankrolls,
  };
}
