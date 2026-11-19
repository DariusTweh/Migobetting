import type { Fixture, Forecast, MarketProbability } from "./types";
import { decimalToAmerican } from "./odds";

type RecordSummary = { wins: number; draws: number; losses: number; played: number; ppg: number };

export function parseRecord(value?: string): RecordSummary | null {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  const [wins, draws, losses] = parts;
  const played = wins + draws + losses;
  if (played < 3) return null;
  return { wins, draws, losses, played, ppg: (wins * 3 + draws) / played };
}

export function poisson(lambda: number, goals: number): number {
  let factorial = 1;
  for (let i = 2; i <= goals; i += 1) factorial *= i;
  return (Math.exp(-lambda) * lambda ** goals) / factorial;
}

function fairOdds(probability: number): number {
  return decimalToAmerican(1 / probability);
}

function market(key: string, label: string, probability: number): MarketProbability {
  return { key, label, probability, fairAmerican: fairOdds(probability) };
}

export type ForecastOverrides = {
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  version: string;
  quality: Forecast["dataQuality"];
  evidence: string[];
  risks: string[];
};

export function forecastFixture(fixture: Fixture, overrides?: ForecastOverrides): Forecast {
  const homeRecord = parseRecord(fixture.home.record);
  const awayRecord = parseRecord(fixture.away.record);
  const insufficient = !homeRecord || !awayRecord;
  const homePpg = homeRecord?.ppg ?? 1.45;
  const awayPpg = awayRecord?.ppg ?? 1.45;
  const strengthGap = Math.max(-1.5, Math.min(1.5, homePpg - awayPpg));
  const expectedHomeGoals = overrides?.expectedHomeGoals ?? Math.max(0.45, Math.min(3.1, 1.45 + 0.22 + strengthGap * 0.42));
  const expectedAwayGoals = overrides?.expectedAwayGoals ?? Math.max(0.35, Math.min(2.7, 1.2 - strengthGap * 0.34));
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let btts = 0;
  const totals = [0, 0, 0, 0];
  const scores: Array<{ score: string; probability: number }> = [];

  for (let home = 0; home <= 8; home += 1) {
    for (let away = 0; away <= 8; away += 1) {
      const probability = poisson(expectedHomeGoals, home) * poisson(expectedAwayGoals, away);
      if (home > away) homeWin += probability;
      else if (home === away) draw += probability;
      else awayWin += probability;
      if (home > 0 && away > 0) btts += probability;
      [0.5, 1.5, 2.5, 3.5].forEach((line, index) => {
        if (home + away > line) totals[index] += probability;
      });
      scores.push({ score: `${home}–${away}`, probability });
    }
  }

  const probabilityMass = homeWin + draw + awayWin;
  homeWin /= probabilityMass;
  draw /= probabilityMass;
  awayWin /= probabilityMass;
  const markets = [
    market("home", `${fixture.home.shortName} win`, homeWin),
    market("draw", "Draw", draw),
    market("away", `${fixture.away.shortName} win`, awayWin),
    market("home-draw", `${fixture.home.shortName} or draw`, homeWin + draw),
    market("away-draw", `${fixture.away.shortName} or draw`, awayWin + draw),
    market("over-1.5", "Over 1.5 goals", totals[1]),
    market("over-2.5", "Over 2.5 goals", totals[2]),
    market("under-3.5", "Under 3.5 goals", 1 - totals[3]),
    market("btts", "Both teams to score", btts),
  ].sort((a, b) => b.probability - a.probability);

  const evidence = insufficient
    ? ["ESPN did not provide enough season record data for both teams."]
    : [
        `${fixture.home.shortName}: ${fixture.home.record} season record (${homePpg.toFixed(2)} points per match).`,
        `${fixture.away.shortName}: ${fixture.away.record} season record (${awayPpg.toFixed(2)} points per match).`,
        `Baseline expected goals: ${expectedHomeGoals.toFixed(2)}–${expectedAwayGoals.toFixed(2)}, including a fixed home advantage.`,
      ];

  return {
    fixtureId: fixture.id,
    modelVersion: overrides?.version ?? "migo-baseline-0.1",
    dataQuality: overrides?.quality ?? (insufficient ? "insufficient" : homeRecord!.played < 6 || awayRecord!.played < 6 ? "limited" : "good"),
    expectedHomeGoals,
    expectedAwayGoals,
    homeWin,
    draw,
    awayWin,
    markets,
    scorelines: scores.sort((a, b) => b.probability - a.probability).slice(0, 5),
    evidence: overrides?.evidence ?? evidence,
    risks: overrides?.risks ?? [
      "The baseline does not yet include injuries, confirmed lineups, xG, or opponent-adjusted recent form.",
      "Season records are a coarse input; these probabilities require calibration before real-money use.",
    ],
    qualified: (Boolean(overrides) || !insufficient) && Math.max(...markets.map((item) => item.probability)) >= 0.68,
  };
}
