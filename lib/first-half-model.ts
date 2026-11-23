import type { Fixture } from "./types";
import { formTeamKey } from "./form-history";
import type { HistoricalMatch } from "./history";

export type FirstHalfMarketKey = "first-half-over-0.5" | "first-half-over-1.5" |
  "home-first-half-goal" | "away-first-half-goal" | "half-time-draw";
export type FirstHalfForecast = {
  modelVersion: "migo-first-half-poisson-v1";
  quality: "good" | "limited";
  historicalMatches: number;
  effectiveMatches: number;
  homeTeamMatches: number;
  awayTeamMatches: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  markets: Array<{ key: FirstHalfMarketKey; label: string; probability: number }>;
  halfTimeScores: Array<{ score: string; probability: number }>;
  notes: string[];
};
export type FirstHalfBacktest = {
  evaluated: number;
  over05: { predicted: number; observed: number; brier: number } | null;
  over15: { predicted: number; observed: number; brier: number } | null;
};

const DAY = 86400000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const decay = (days: number) => Math.pow(0.5, days / 180);

function validHalfTime(match: HistoricalMatch) {
  const h = match.halfTimeHomeGoals, a = match.halfTimeAwayGoals;
  return Number.isInteger(h) && Number.isInteger(a) &&
    h! >= 0 && a! >= 0 && h! <= match.homeGoals && a! <= match.awayGoals;
}

type Weighted = HistoricalMatch & { weight: number; homeKey: string; awayKey: string };
function firstHalfHistory(matches: HistoricalMatch[], fixture: Fixture): Weighted[] {
  const cutoff = Date.parse(fixture.kickoff.slice(0, 10) + "T00:00:00.000Z");
  if (!Number.isFinite(cutoff)) return [];
  return matches.flatMap((match) => {
    const date = Date.parse(match.date);
    if (!Number.isFinite(date) || date >= cutoff || date < cutoff - 730 * DAY ||
        match.competition !== fixture.league || !validHalfTime(match)) return [];
    return [{
      ...match, weight: decay((cutoff - date) / DAY),
      homeKey: formTeamKey(match.homeTeam),
      awayKey: formTeamKey(match.awayTeam),
    }];
  });
}

const poisson = (mean: number, goals: number): number => {
  let result = Math.exp(-mean);
  for (let k = 1; k <= goals; k++) result *= mean / k;
  return result;
};

/**
 * An initial independently estimated 1H Poisson model. Fits separate home and
 * away first-half goal rates to verified HTHG/HTAG history, shrinking sparse
 * attack/defense splits toward their league venue averages. Never scales the
 * 90-minute prediction by an arbitrary 45-minute fraction.
 * All inputs must predate kickoff. Not yet calibrated on future matches.
 */
export function estimateFirstHalf(
  matches: HistoricalMatch[], fixture: Fixture,
): FirstHalfForecast | null {
  const training = firstHalfHistory(matches, fixture);
  const homeKey = formTeamKey(fixture.home.name);
  const awayKey = formTeamKey(fixture.away.name);
  if (homeKey === awayKey || !homeKey || !awayKey || training.length < 60) return null;

  const weight = (rows: Weighted[]) => rows.reduce((s, m) => s + m.weight, 0);
  const totalWeight = weight(training);
  if (totalWeight < 18) return null;
  const leagueHome = training.reduce((s, m) => s + m.weight * m.halfTimeHomeGoals!, 0) / totalWeight;
  const leagueAway = training.reduce((s, m) => s + m.weight * m.halfTimeAwayGoals!, 0) / totalWeight;
  if (leagueHome <= 0.05 || leagueAway <= 0.05) return null;

  const homeVenue = training.filter((m) => m.homeKey === homeKey);
  const awayVenue = training.filter((m) => m.awayKey === awayKey);
  const homeAll = training.filter((m) => m.homeKey === homeKey || m.awayKey === homeKey).length;
  const awayAll = training.filter((m) => m.homeKey === awayKey || m.awayKey === awayKey).length;
  if (homeAll < 4 || awayAll < 4) return null;

  const smoothMean = (rows: Weighted[], goals: (m: Weighted) => number, prior: number) =>
    (rows.reduce((s, m) => s + m.weight * goals(m), 0) + prior * 6) / (weight(rows) + 6);
  const homeAttack = smoothMean(homeVenue, (m) => m.halfTimeHomeGoals!, leagueHome) / leagueHome;
  const homeDefense = smoothMean(homeVenue, (m) => m.halfTimeAwayGoals!, leagueAway) / leagueAway;
  const awayAttack = smoothMean(awayVenue, (m) => m.halfTimeAwayGoals!, leagueAway) / leagueAway;
  const awayDefense = smoothMean(awayVenue, (m) => m.halfTimeHomeGoals!, leagueHome) / leagueHome;
  const expectedHomeGoals = clamp(leagueHome * homeAttack * awayDefense, .08, 2.6);
  const expectedAwayGoals = clamp(leagueAway * awayAttack * homeDefense, .06, 2.4);
  const total = expectedHomeGoals + expectedAwayGoals;
  const pOver05 = 1 - Math.exp(-total);
  const pOver15 = 1 - Math.exp(-total) * (1 + total);
  const pHome = 1 - Math.exp(-expectedHomeGoals);
  const pAway = 1 - Math.exp(-expectedAwayGoals);
  const pDraw = Array.from({ length: 11 }, (_, n) => poisson(expectedHomeGoals, n) *
    poisson(expectedAwayGoals, n)).reduce((a, b) => a + b, 0);
  const scores = Array.from({ length: 5 }, (_, h) => Array.from({ length: 5 }, (_, a) =>
    ({ score: h + "–" + a, probability: poisson(expectedHomeGoals, h) * poisson(expectedAwayGoals, a) })))
    .flat().sort((a, b) => b.probability - a.probability).slice(0, 4);
  const quality = homeAll >= 14 && awayAll >= 14 && totalWeight >= 85 ? "good" : "limited";
  return {
    modelVersion: "migo-first-half-poisson-v1",
    quality, historicalMatches: training.length, effectiveMatches: totalWeight,
    homeTeamMatches: homeAll, awayTeamMatches: awayAll,
    expectedHomeGoals, expectedAwayGoals,
    markets: [
      { key: "first-half-over-0.5", label: "1H Over 0.5 goals", probability: pOver05 },
      { key: "first-half-over-1.5", label: "1H Over 1.5 goals", probability: pOver15 },
      { key: "home-first-half-goal", label: fixture.home.shortName + " scores in 1H", probability: pHome },
      { key: "away-first-half-goal", label: fixture.away.shortName + " scores in 1H", probability: pAway },
      { key: "half-time-draw", label: "Half-time draw", probability: pDraw },
    ],
    halfTimeScores: scores,
    notes: [
      "Uses " + training.length + " verified earlier half-time scores from " + fixture.league + ".",
      "Venue-specific team attack/defense rates, 180-day decay and league-average shrinkage.",
      "Pre-match Poisson estimates only; no first-half bookmaker prices or independent calibration.",
    ],
  };
}

/** Expensive by design: explicitly walk forward in time without score leakage. */
export function backtestFirstHalf(
  matches: HistoricalMatch[], competition: string, maxFixtures = 250,
): FirstHalfBacktest {
  const rows = matches.filter((match) => match.competition === competition && validHalfTime(match))
    .sort((a, b) => a.date.localeCompare(b.date));
  const evaluated: Array<{ p05: number; p15: number; y05: number; y15: number }> = [];
  for (const match of rows.slice(-Math.max(1, Math.min(500, maxFixtures)))) {
    const fixture: Fixture = {
      id: match.id, kickoff: match.date, league: match.competition,
      leagueId: "eng.1", status: "scheduled", statusLabel: "Historical",
      home: { id: "h", name: match.homeTeam, shortName: match.homeTeam, abbreviation: "H" },
      away: { id: "a", name: match.awayTeam, shortName: match.awayTeam, abbreviation: "A" },
      source: "ESPN", sourceUpdatedAt: match.date,
    };
    const forecast = estimateFirstHalf(rows, fixture);
    if (!forecast) continue;
    const market = (key: FirstHalfMarketKey) => forecast.markets.find((m) => m.key === key)!.probability;
    const goals = match.halfTimeHomeGoals! + match.halfTimeAwayGoals!;
    evaluated.push({ p05: market("first-half-over-0.5"), p15: market("first-half-over-1.5"),
      y05: Number(goals >= 1), y15: Number(goals >= 2) });
  }
  const calc = (p: "p05" | "p15", y: "y05" | "y15") => evaluated.length ? {
    predicted: evaluated.reduce((s, m) => s + m[p], 0) / evaluated.length,
    observed: evaluated.reduce((s, m) => s + m[y], 0) / evaluated.length,
    brier: evaluated.reduce((s, m) => s + (m[p] - m[y]) ** 2, 0) / evaluated.length,
  } : null;
  return { evaluated: evaluated.length, over05: calc("p05", "y05"), over15: calc("p15", "y15") };
}
