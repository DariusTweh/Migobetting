import { forecastFixture } from "./model";
import { summarizeGoalCalibration, type GoalCalibration } from "./goal-calibration";
import type { Fixture } from "./types";

export type HistoricalMatch = {
  id: string;
  competition: string;
  season: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  halfTimeHomeGoals?: number;
  halfTimeAwayGoals?: number;
  result: "H" | "D" | "A";
  odds?: { home?: number; draw?: number; away?: number; over25?: number; under25?: number };
  source: string;
  importedAt: string;
  lineup?: {
    espnEventId: string;
    fetchedAt: string;
    timing: "actual-xi-90m-assumption";
    home: { formation?: string; starters: Array<{ id: string; name: string; position: string }> };
    away: { formation?: string; starters: Array<{ id: string; name: string; position: string }> };
  };
};

export type BacktestMarket = "best-pick" | "match-winner" | "double-chance" | "over-1.5" | "under-1.5" | "over-2.5" | "under-2.5" | "over-3.5" | "under-3.5" | "btts-yes" | "btts-no" | "btts";
export type BacktestConfig = { market: BacktestMarket; threshold: number; iterations: number; seed: string; trainingFraction: number };
export type MarketProbabilities = {
  home: number; draw: number; away: number;
  homeOrDraw: number; awayOrDraw: number; homeOrAway: number;
  over15: number; under15: number; over25: number; under25: number; over35: number; under35: number;
  btts: number; bttsNo: number;
};
export type MarketSelection = "Home" | "Draw" | "Away" | "Home or Draw" | "Away or Draw" | "Home or Away" | "Over 1.5" | "Under 1.5" | "Over 2.5" | "Under 2.5" | "Over 3.5" | "Under 3.5" | "BTTS Yes" | "BTTS No";
export type BacktestPrediction = {
  matchId: string;
  date: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  actualHomeGoals: number;
  actualAwayGoals: number;
  actualOutcome: "home" | "draw" | "away";
  probabilities: MarketProbabilities;
  selected: MarketSelection | null;
  selectedMarket: string | null;
  selectedLabel: string | null;
  selectedProbability: number;
  correct: boolean | null;
  brier: number;
  logLoss: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  lowScoreCorrelation: number;
  oddsUsed?: number;
  profit?: number;
  projectedLineupEligible: boolean;
  actualLineupEligible: boolean;
};

export type BacktestResult = {
  config: BacktestConfig;
  matchesSeen: number;
  evaluated: number;
  excludedWarmup: number;
  qualified: number;
  correct: number;
  incorrect: number;
  hitRate: number | null;
  brierScore: number | null;
  logLoss: number | null;
  roi: number | null;
  profit: number | null;
  oddsCoverage: number;
  evaluationStart?: string;
  predictions: BacktestPrediction[];
  calibration: Array<{ band: string; predictions: number; averageConfidence: number; hitRate: number }>;
  byCompetition: Array<{ competition: string; evaluated: number; qualified: number; hitRate: number | null }>;
  byMarket: Array<{ market: string; qualified: number; correct: number; hitRate: number | null }>;
  modelComparison: Array<{ model: string; coverage: number; evaluated: number; brierScore: number | null; note: string }>;
  goalCalibration: GoalCalibration | null;
  goalsByCompetition: Array<{ competition: string; calibration: GoalCalibration }>;
};

const DIVISION_NAMES: Record<string, string> = { E0: "Premier League", SP1: "La Liga", D1: "Bundesliga", I1: "Serie A", F1: "Ligue 1" };
const TEAM_ALIASES: Record<string, string> = {
  "man city": "manchester city", "man united": "manchester united", "wolves": "wolverhampton wanderers",
  "nott'm forest": "nottingham forest", "psg": "paris saint-germain", "inter": "internazionale",
  "ath madrid": "atletico madrid", "ath bilbao": "athletic club", "sociedad": "real sociedad",
  "afc bournemouth": "bournemouth", "brighton": "brighton hove albion", "leeds": "leeds united",
  "newcastle": "newcastle united", "tottenham": "tottenham hotspur", "west ham": "west ham united",
  "1 fc union berlin": "union berlin", "fc augsburg": "augsburg", "borussia dortmund": "dortmund",
  "m'gladbach": "monchengladbach", "borussia monchengladbach": "monchengladbach", "tsg hoffenheim": "hoffenheim",
  "ein frankfurt": "eintracht frankfurt", "vfb stuttgart": "stuttgart", "bayer leverkusen": "leverkusen",
  "hamburg sv": "hamburg", "fc cologne": "fc koln", "1 fc heidenheim 1846": "heidenheim",
  "sc freiburg": "freiburg", "vfl wolfsburg": "wolfsburg", "paris sg": "paris saint-germain", "paris saintgermain": "paris saint-germain",
  "as monaco": "monaco", "stade rennais": "rennes", "le havre ac": "le havre", "aj auxerre": "auxerre",
  "ac milan": "milan", "hellas verona": "verona", "as roma": "roma",
};

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const cleaned = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < cleaned.length; index += 1) {
    const character = cleaned[index];
    if (character === '"') {
      if (quoted && cleaned[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && cleaned[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function normalizeTeamName(name: string): string {
  const key = name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();
  return TEAM_ALIASES[key] ?? key;
}

export type HistoricalGoalEstimate = {
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  lowScoreCorrelation: number;
  matches: number;
  homeMatches: number;
  awayMatches: number;
  leagueHomeAverage: number;
  leagueAwayAverage: number;
  effectiveMatches: number;
};

type WeightedHistoricalMatch = HistoricalMatch & { weight: number; homeKey: string; awayKey: string };

const bounded = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const modelTeamKey = (name: string) => normalizeTeamName(name)
  .replace(/^(fc|afc|cf) /, "").replace(/ (fc|afc|cf|sc)$/, "").trim();

function fittedLowScoreCorrelation(
  matches: WeightedHistoricalMatch[], attack: Map<string, number>, defense: Map<string, number>,
  leagueHome: number, leagueAway: number,
): number {
  let bestRho = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let step = -20; step <= 20; step += 1) {
    const rho = step / 100;
    let score = -40 * rho * rho;
    let valid = true;
    for (const match of matches) {
      if (match.homeGoals > 1 || match.awayGoals > 1) continue;
      const homeLambda = leagueHome * (attack.get(match.homeKey) ?? 1) * (defense.get(match.awayKey) ?? 1);
      const awayLambda = leagueAway * (attack.get(match.awayKey) ?? 1) * (defense.get(match.homeKey) ?? 1);
      let factor = 1;
      if (match.homeGoals === 0 && match.awayGoals === 0) factor = 1 - homeLambda * awayLambda * rho;
      else if (match.homeGoals === 0 && match.awayGoals === 1) factor = 1 + homeLambda * rho;
      else if (match.homeGoals === 1 && match.awayGoals === 0) factor = 1 + awayLambda * rho;
      else factor = 1 - rho;
      if (factor <= 0) { valid = false; break; }
      score += match.weight * Math.log(factor);
    }
    if (valid && score > bestScore) { bestScore = score; bestRho = rho; }
  }
  return bestRho;
}

/**
 * Fits recency-weighted, opponent-adjusted attack and defense ratings using
 * only matches available before the requested kickoff.
 */
export function estimateHistoricalGoals(matches: HistoricalMatch[], input: {
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  halfLifeDays?: number;
}): HistoricalGoalEstimate | null {
  const kickoff = Date.parse(input.kickoff);
  if (!Number.isFinite(kickoff)) return null;
  const halfLifeDays = bounded(input.halfLifeDays ?? 180, 60, 365);
  const weighted: WeightedHistoricalMatch[] = matches.flatMap((match) => {
    const playedAt = Date.parse(match.date);
    if (match.competition !== input.competition || !Number.isFinite(playedAt) || playedAt >= kickoff || playedAt <= kickoff - 730 * 86400000) return [];
    return [{
      ...match,
      weight: Math.exp(-Math.LN2 * ((kickoff - playedAt) / 86400000) / halfLifeDays),
      homeKey: modelTeamKey(match.homeTeam),
      awayKey: modelTeamKey(match.awayTeam),
    }];
  });
  if (weighted.length < 40) return null;
  const homeKey = modelTeamKey(input.homeTeam);
  const awayKey = modelTeamKey(input.awayTeam);
  const homeMatches = weighted.filter((match) => match.homeKey === homeKey || match.awayKey === homeKey).length;
  const awayMatches = weighted.filter((match) => match.homeKey === awayKey || match.awayKey === awayKey).length;

  const effectiveMatches = weighted.reduce((sum, match) => sum + match.weight, 0);
  const leagueHome = weighted.reduce((sum, match) => sum + match.weight * match.homeGoals, 0) / effectiveMatches;
  const leagueAway = weighted.reduce((sum, match) => sum + match.weight * match.awayGoals, 0) / effectiveMatches;
  if (leagueHome < 0.3 || leagueAway < 0.3) return null;
  const teams = new Set(weighted.flatMap((match) => [match.homeKey, match.awayKey]));
  let attack = new Map([...teams].map((team) => [team, 1]));
  let defense = new Map([...teams].map((team) => [team, 1]));
  const priorGoals = 6 * (leagueHome + leagueAway) / 2;

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const scored = new Map([...teams].map((team) => [team, 0]));
    const scoringExpectation = new Map([...teams].map((team) => [team, 0]));
    const conceded = new Map([...teams].map((team) => [team, 0]));
    const concedingExpectation = new Map([...teams].map((team) => [team, 0]));
    for (const match of weighted) {
      scored.set(match.homeKey, (scored.get(match.homeKey) ?? 0) + match.weight * match.homeGoals);
      scoringExpectation.set(match.homeKey, (scoringExpectation.get(match.homeKey) ?? 0) + match.weight * leagueHome * (defense.get(match.awayKey) ?? 1));
      conceded.set(match.homeKey, (conceded.get(match.homeKey) ?? 0) + match.weight * match.awayGoals);
      concedingExpectation.set(match.homeKey, (concedingExpectation.get(match.homeKey) ?? 0) + match.weight * leagueAway * (attack.get(match.awayKey) ?? 1));
      scored.set(match.awayKey, (scored.get(match.awayKey) ?? 0) + match.weight * match.awayGoals);
      scoringExpectation.set(match.awayKey, (scoringExpectation.get(match.awayKey) ?? 0) + match.weight * leagueAway * (defense.get(match.homeKey) ?? 1));
      conceded.set(match.awayKey, (conceded.get(match.awayKey) ?? 0) + match.weight * match.homeGoals);
      concedingExpectation.set(match.awayKey, (concedingExpectation.get(match.awayKey) ?? 0) + match.weight * leagueHome * (attack.get(match.homeKey) ?? 1));
    }
    const nextAttack = new Map<string, number>();
    const nextDefense = new Map<string, number>();
    for (const team of teams) {
      nextAttack.set(team, bounded(((scored.get(team) ?? 0) + priorGoals) / ((scoringExpectation.get(team) ?? 0) + priorGoals), 0.4, 2.5));
      nextDefense.set(team, bounded(((conceded.get(team) ?? 0) + priorGoals) / ((concedingExpectation.get(team) ?? 0) + priorGoals), 0.4, 2.5));
    }
    attack = nextAttack;
    defense = nextDefense;
  }

  const expectedHomeGoals = bounded(leagueHome * (attack.get(homeKey) ?? 1) * (defense.get(awayKey) ?? 1), 0.25, 3.7);
  const expectedAwayGoals = bounded(leagueAway * (attack.get(awayKey) ?? 1) * (defense.get(homeKey) ?? 1), 0.2, 3.4);
  return {
    expectedHomeGoals,
    expectedAwayGoals,
    lowScoreCorrelation: fittedLowScoreCorrelation(weighted, attack, defense, leagueHome, leagueAway),
    matches: weighted.length,
    homeMatches,
    awayMatches,
    leagueHomeAverage: leagueHome,
    leagueAwayAverage: leagueAway,
    effectiveMatches,
  };
}

function parseDate(value: string): string | null {
  const parts = value.trim().split(/[/-]/).map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  let [day, month, year] = parts;
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function decimal(headers: string[], row: string[], ...names: string[]): number | undefined {
  const index = names.map((name) => headers.indexOf(name)).find((value) => value >= 0) ?? -1;
  const value = Number(row[index]);
  return Number.isFinite(value) && value > 1 ? value : undefined;
}

export function parseHistoricalCsv(text: string, metadata: { season: string; source?: string }): { matches: HistoricalMatch[]; rejected: number } {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return { matches: [], rejected: 0 };
  const headers = rows[0].map((header) => header.trim());
  const index = (name: string) => headers.indexOf(name);
  const required = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"];
  if (required.some((header) => index(header) < 0)) throw new Error(`CSV is missing required columns: ${required.filter((header) => index(header) < 0).join(", ")}`);
  const importedAt = new Date().toISOString();
  const matches: HistoricalMatch[] = [];
  let rejected = 0;
  for (const row of rows.slice(1)) {
    const date = parseDate(row[index("Date")] ?? "");
    const homeGoals = Number(row[index("FTHG")]);
    const awayGoals = Number(row[index("FTAG")]);
    const result = row[index("FTR")] as HistoricalMatch["result"];
    const homeTeam = (row[index("HomeTeam")] ?? "").trim();
    const awayTeam = (row[index("AwayTeam")] ?? "").trim();
    if (!date || !homeTeam || !awayTeam || !Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || !["H", "D", "A"].includes(result)) { rejected += 1; continue; }
    const competitionCode = (row[index("Div")] ?? "Unknown").trim();
    const halfHome = Number(row[index("HTHG")]);
    const halfAway = Number(row[index("HTAG")]);
    const id = [competitionCode, date.slice(0, 10), normalizeTeamName(homeTeam), normalizeTeamName(awayTeam)].join(":");
    matches.push({
      id, competition: DIVISION_NAMES[competitionCode] ?? competitionCode, season: metadata.season, date,
      homeTeam, awayTeam, homeGoals, awayGoals,
      halfTimeHomeGoals: Number.isInteger(halfHome) ? halfHome : undefined,
      halfTimeAwayGoals: Number.isInteger(halfAway) ? halfAway : undefined,
      result,
      odds: {
        home: decimal(headers, row, "AvgH", "B365H"), draw: decimal(headers, row, "AvgD", "B365D"), away: decimal(headers, row, "AvgA", "B365A"),
        over25: decimal(headers, row, "Avg>2.5", "B365>2.5"), under25: decimal(headers, row, "Avg<2.5", "B365<2.5"),
      },
      source: metadata.source ?? "Imported CSV", importedAt,
    });
  }
  return { matches, rejected };
}

type SelectionCandidate = readonly [MarketSelection, number, string];

export function chooseBacktestSelection(market: BacktestMarket, probabilities: MarketProbabilities, threshold: number): SelectionCandidate | null {
  const matchWinner: SelectionCandidate[] = [["Home", probabilities.home, "Match winner"], ["Draw", probabilities.draw, "Match winner"], ["Away", probabilities.away, "Match winner"]];
  const doubleChance: SelectionCandidate[] = [["Home or Draw", probabilities.homeOrDraw, "Double chance"], ["Away or Draw", probabilities.awayOrDraw, "Double chance"], ["Home or Away", probabilities.homeOrAway, "Double chance"]];
  const fixed: Record<Exclude<BacktestMarket, "best-pick" | "match-winner" | "double-chance">, SelectionCandidate> = {
    "over-1.5": ["Over 1.5", probabilities.over15, "Over 1.5 goals"],
    "under-1.5": ["Under 1.5", probabilities.under15, "Under 1.5 goals"],
    "over-2.5": ["Over 2.5", probabilities.over25, "Over 2.5 goals"],
    "under-2.5": ["Under 2.5", probabilities.under25, "Under 2.5 goals"],
    "over-3.5": ["Over 3.5", probabilities.over35, "Over 3.5 goals"],
    "under-3.5": ["Under 3.5", probabilities.under35, "Under 3.5 goals"],
    "btts-yes": ["BTTS Yes", probabilities.btts, "BTTS Yes"],
    "btts-no": ["BTTS No", probabilities.bttsNo, "BTTS No"],
    btts: ["BTTS Yes", probabilities.btts, "BTTS Yes"],
  };
  const all: SelectionCandidate[] = [...matchWinner, ...doubleChance, ...Object.values(fixed).filter((item, index) => index !== Object.values(fixed).length - 1)];
  const choices = market === "best-pick" ? all : market === "match-winner" ? matchWinner : market === "double-chance" ? doubleChance : [fixed[market]];
  const best = choices.reduce((current, item) => item[1] > current[1] ? item : current);
  return best[1] >= threshold ? best : null;
}

export function settlesBacktestSelection(selection: MarketSelection, match: Pick<HistoricalMatch, "homeGoals" | "awayGoals" | "result">) {
  const total = match.homeGoals + match.awayGoals;
  if (selection === "Home") return match.result === "H";
  if (selection === "Draw") return match.result === "D";
  if (selection === "Away") return match.result === "A";
  if (selection === "Home or Draw") return match.result !== "A";
  if (selection === "Away or Draw") return match.result !== "H";
  if (selection === "Home or Away") return match.result !== "D";
  if (selection === "Over 1.5") return total >= 2;
  if (selection === "Under 1.5") return total <= 1;
  if (selection === "Over 2.5") return total >= 3;
  if (selection === "Under 2.5") return total <= 2;
  if (selection === "Over 3.5") return total >= 4;
  if (selection === "Under 3.5") return total <= 3;
  if (selection === "BTTS Yes") return match.homeGoals > 0 && match.awayGoals > 0;
  return match.homeGoals === 0 || match.awayGoals === 0;
}

function selectionOdds(selection: MarketSelection, match: HistoricalMatch) {
  if (selection === "Home") return match.odds?.home;
  if (selection === "Draw") return match.odds?.draw;
  if (selection === "Away") return match.odds?.away;
  if (selection === "Over 2.5") return match.odds?.over25;
  if (selection === "Under 2.5") return match.odds?.under25;
  return undefined;
}

function selectionLabel(selection: MarketSelection, match: HistoricalMatch) {
  if (selection === "Home") return `${match.homeTeam} to win`;
  if (selection === "Away") return `${match.awayTeam} to win`;
  if (selection === "Draw") return "Match to end in a draw";
  if (selection === "Home or Draw") return `${match.homeTeam} or draw`;
  if (selection === "Away or Draw") return `${match.awayTeam} or draw`;
  if (selection === "Home or Away") return "Either team to win (no draw)";
  return selection;
}

export function runHistoricalBacktest(matches: HistoricalMatch[], config: BacktestConfig): BacktestResult {
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const predictions: BacktestPrediction[] = [];
  const priorLineups = new Map<string, string[]>();
  const committedMatches: HistoricalMatch[] = [];
  let excludedWarmup = 0;
  let lastDay = "";
  const pending: HistoricalMatch[] = [];
  function commitHistory(match: HistoricalMatch) {
    const homeKey = `${match.competition}:${normalizeTeamName(match.homeTeam)}`;
    const awayKey = `${match.competition}:${normalizeTeamName(match.awayTeam)}`;
    if (match.lineup) {
      priorLineups.set(homeKey, match.lineup.home.starters.map((player) => player.id));
      priorLineups.set(awayKey, match.lineup.away.starters.map((player) => player.id));
    }
    committedMatches.push(match);
  }
  function flushDay() { pending.forEach(commitHistory); pending.length = 0; }
  const splitIndex = Math.floor(sorted.length * Math.min(0.9, Math.max(0.1, config.trainingFraction)));

  sorted.forEach((match, matchIndex) => {
    const day = match.date.slice(0, 10);
    if (lastDay && day !== lastDay) flushDay();
    lastDay = day;
    const homeKey = `${match.competition}:${normalizeTeamName(match.homeTeam)}`;
    const awayKey = `${match.competition}:${normalizeTeamName(match.awayTeam)}`;
    const projectedLineupEligible = priorLineups.has(homeKey) && priorLineups.has(awayKey);
    const actualLineupEligible = match.lineup?.home.starters.length === 11 && match.lineup?.away.starters.length === 11;
    const expected = matchIndex >= splitIndex ? estimateHistoricalGoals(committedMatches, {
      competition: match.competition,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoff: match.date,
    }) : null;
    if (matchIndex >= splitIndex && expected) {
      const fixture: Fixture = {
        id: match.id,
        leagueId: "eng.1",
        league: match.competition,
        kickoff: match.date,
        status: "scheduled",
        statusLabel: "Historical fixture",
        home: { id: homeKey, name: match.homeTeam, shortName: match.homeTeam, abbreviation: "H" },
        away: { id: awayKey, name: match.awayTeam, shortName: match.awayTeam, abbreviation: "A" },
        source: "ESPN",
        sourceUpdatedAt: match.date,
      };
      const exact = forecastFixture(fixture, {
        expectedHomeGoals: expected.expectedHomeGoals,
        expectedAwayGoals: expected.expectedAwayGoals,
        lowScoreCorrelation: expected.lowScoreCorrelation,
        version: "migo-opponent-decay-dc-0.4",
        quality: expected.homeMatches >= 16 && expected.awayMatches >= 16 ? "good" : "limited",
        evidence: [],
        risks: [],
      });
      const probability = (key: string) => exact.markets.find((item) => item.key === key)?.probability ?? 0;
      const probabilities: MarketProbabilities = {
        home: exact.homeWin, draw: exact.draw, away: exact.awayWin,
        homeOrDraw: exact.homeWin + exact.draw, awayOrDraw: exact.awayWin + exact.draw, homeOrAway: exact.homeWin + exact.awayWin,
        over15: probability("over-1.5"), under15: 1 - probability("over-1.5"),
        over25: probability("over-2.5"), under25: 1 - probability("over-2.5"),
        over35: 1 - probability("under-3.5"), under35: probability("under-3.5"),
        btts: probability("btts"), bttsNo: 1 - probability("btts"),
      };
      const selection = chooseBacktestSelection(config.market, probabilities, config.threshold);
      const actual = match.result === "H" ? [1, 0, 0] : match.result === "D" ? [0, 1, 0] : [0, 0, 1];
      const forecast = [probabilities.home, probabilities.draw, probabilities.away];
      const brier = forecast.reduce((sum, probability, index) => sum + (probability - actual[index]) ** 2, 0) / 3;
      const actualProbability = match.result === "H" ? probabilities.home : match.result === "D" ? probabilities.draw : probabilities.away;
      const selected = selection?.[0] ?? null;
      const correct = selected ? settlesBacktestSelection(selected, match) : null;
      const oddsUsed = selected ? selectionOdds(selected, match) : undefined;
      const selectedLabel = selected ? selectionLabel(selected, match) : null;
      const actualOutcome = match.result === "H" ? "home" : match.result === "A" ? "away" : "draw";
      predictions.push({ matchId: match.id, date: match.date, competition: match.competition, homeTeam: match.homeTeam, awayTeam: match.awayTeam, actualHomeGoals: match.homeGoals, actualAwayGoals: match.awayGoals, actualOutcome, probabilities, selected, selectedMarket: selection?.[2] ?? null, selectedLabel, selectedProbability: selection?.[1] ?? 0, correct, brier, logLoss: -Math.log(Math.max(1e-9, actualProbability)), expectedHomeGoals: expected.expectedHomeGoals, expectedAwayGoals: expected.expectedAwayGoals, lowScoreCorrelation: expected.lowScoreCorrelation, oddsUsed, profit: oddsUsed && correct !== null ? (correct ? oddsUsed - 1 : -1) : undefined, projectedLineupEligible, actualLineupEligible });
    } else if (matchIndex >= splitIndex) excludedWarmup += 1;

    pending.push(match);
  });
  flushDay();

  const qualified = predictions.filter((item) => item.selected !== null);
  const correct = qualified.filter((item) => item.correct).length;
  const priced = qualified.filter((item) => item.profit !== undefined);
  const profit = priced.length ? priced.reduce((sum, item) => sum + (item.profit ?? 0), 0) : null;
  const bands = Array.from({ length: 5 }, (_, index) => ({ min: 0.5 + index * 0.1, max: 0.6 + index * 0.1 }));
  const calibration = bands.map(({ min, max }) => {
    const items = qualified.filter((item) => item.selectedProbability >= min && item.selectedProbability < max);
    return { band: `${Math.round(min * 100)}–${Math.round(max * 100)}%`, predictions: items.length, averageConfidence: items.length ? items.reduce((sum, item) => sum + item.selectedProbability, 0) / items.length : 0, hitRate: items.length ? items.filter((item) => item.correct).length / items.length : 0 };
  });
  const competitions = [...new Set(predictions.map((item) => item.competition))];
  const byCompetition = competitions.map((competition) => { const items = predictions.filter((item) => item.competition === competition); const picks = items.filter((item) => item.selected); return { competition, evaluated: items.length, qualified: picks.length, hitRate: picks.length ? picks.filter((item) => item.correct).length / picks.length : null }; });
  const markets = [...new Set(qualified.map((item) => item.selectedMarket).filter((item): item is string => Boolean(item)))];
  const byMarket = markets.map((market) => { const items = qualified.filter((item) => item.selectedMarket === market); const marketCorrect = items.filter((item) => item.correct).length; return { market, qualified: items.length, correct: marketCorrect, hitRate: items.length ? marketCorrect / items.length : null }; }).sort((a, b) => b.qualified - a.qualified);
  const average = (key: "brier" | "logLoss") => predictions.length ? predictions.reduce((sum, item) => sum + item[key], 0) / predictions.length : null;
  const projectedEligible = predictions.filter((item) => item.projectedLineupEligible);
  const actualEligible = predictions.filter((item) => item.actualLineupEligible);
  const subsetBrier = (items: BacktestPrediction[]) => items.length ? items.reduce((sum, item) => sum + item.brier, 0) / items.length : null;
  const goalCalibration = summarizeGoalCalibration(predictions);
  const goalsByCompetition = competitions.flatMap((competition) => {
    const calibration = summarizeGoalCalibration(predictions.filter((pick) => pick.competition === competition));
    return calibration ? [{ competition, calibration }] : [];
  });
  return {
    config: { ...config },
    matchesSeen: sorted.length, evaluated: predictions.length, excludedWarmup, qualified: qualified.length, correct, incorrect: qualified.length - correct,
    hitRate: qualified.length ? correct / qualified.length : null, brierScore: average("brier"), logLoss: average("logLoss"),
    roi: priced.length && profit !== null ? profit / priced.length : null, profit, oddsCoverage: qualified.length ? priced.length / qualified.length : 0,
    evaluationStart: predictions[0]?.date, predictions, calibration, byCompetition, byMarket, goalCalibration, goalsByCompetition,
    modelComparison: [
      { model: "Opponent-adjusted production model", coverage: predictions.length ? 1 : 0, evaluated: predictions.length, brierScore: average("brier"), note: "Uses the same recency-weighted attack/defense ratings and low-score correction as live forecasts, with only results available before kickoff." },
      { model: "Projected starters from earlier matches", coverage: predictions.length ? projectedEligible.length / predictions.length : 0, evaluated: projectedEligible.length, brierScore: subsetBrier(projectedEligible), note: projectedEligible.length ? "Uses real starting lineups from earlier matches to estimate who was likely to start. No made-up player boost is applied." : "Needs more mapped historical lineups before it can be tested." },
      { model: "Real historical starting XI", coverage: predictions.length ? actualEligible.length / predictions.length : 0, evaluated: actualEligible.length, brierScore: subsetBrier(actualEligible), note: actualEligible.length ? "Uses the real historical starters only in the 90-minute-before-kickoff test. It is never leaked into an earlier forecast." : "Needs more ESPN matches to be linked before it can be tested." },
    ],
  };
}
