import { simulateMatch } from "./simulation";

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

type TeamStats = { played: number; goalsFor: number; goalsAgainst: number; homePlayed: number; homeFor: number; homeAgainst: number; awayPlayed: number; awayFor: number; awayAgainst: number };
const emptyStats = (): TeamStats => ({ played: 0, goalsFor: 0, goalsAgainst: 0, homePlayed: 0, homeFor: 0, homeAgainst: 0, awayPlayed: 0, awayFor: 0, awayAgainst: 0 });
const regularizedRate = (goals: number, matches: number, prior: number, weight = 5) => (goals + prior * weight) / (matches + weight);

function estimateGoals(home: TeamStats, away: TeamStats, leagueHome: number, leagueAway: number) {
  const leagueHomeSafe = Math.max(0.2, leagueHome);
  const leagueAwaySafe = Math.max(0.2, leagueAway);
  const homeScoring = regularizedRate(home.homeFor, home.homePlayed, leagueHomeSafe);
  const homeConceding = regularizedRate(home.homeAgainst, home.homePlayed, leagueAwaySafe);
  const awayScoring = regularizedRate(away.awayFor, away.awayPlayed, leagueAwaySafe);
  const awayConceding = regularizedRate(away.awayAgainst, away.awayPlayed, leagueHomeSafe);
  return {
    home: Math.max(0.25, Math.min(3.8, leagueHomeSafe * (homeScoring / leagueHomeSafe) * (awayConceding / leagueHomeSafe))),
    away: Math.max(0.2, Math.min(3.4, leagueAwaySafe * (awayScoring / leagueAwaySafe) * (homeConceding / leagueAwaySafe))),
  };
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
  const stats = new Map<string, TeamStats>();
  const leagueHistory = new Map<string, { homeGoals: number; awayGoals: number; matches: number }>();
  const predictions: BacktestPrediction[] = [];
  const priorLineups = new Map<string, string[]>();
  let excludedWarmup = 0;
  let lastDay = "";
  const pending: HistoricalMatch[] = [];
  function commitHistory(match: HistoricalMatch) {
    const homeKey = `${match.competition}:${normalizeTeamName(match.homeTeam)}`;
    const awayKey = `${match.competition}:${normalizeTeamName(match.awayTeam)}`;
    const homeStats = stats.get(homeKey) ?? emptyStats();
    const awayStats = stats.get(awayKey) ?? emptyStats();
    const league = leagueHistory.get(match.competition) ?? { homeGoals: 0, awayGoals: 0, matches: 0 };
    homeStats.played += 1; homeStats.goalsFor += match.homeGoals; homeStats.goalsAgainst += match.awayGoals; homeStats.homePlayed += 1; homeStats.homeFor += match.homeGoals; homeStats.homeAgainst += match.awayGoals;
    awayStats.played += 1; awayStats.goalsFor += match.awayGoals; awayStats.goalsAgainst += match.homeGoals; awayStats.awayPlayed += 1; awayStats.awayFor += match.awayGoals; awayStats.awayAgainst += match.homeGoals;
    stats.set(homeKey, homeStats); stats.set(awayKey, awayStats);
    league.homeGoals += match.homeGoals; league.awayGoals += match.awayGoals; league.matches += 1;
    leagueHistory.set(match.competition, league);
    if (match.lineup) {
      priorLineups.set(homeKey, match.lineup.home.starters.map((player) => player.id));
      priorLineups.set(awayKey, match.lineup.away.starters.map((player) => player.id));
    }
  }
  function flushDay() { pending.forEach(commitHistory); pending.length = 0; }
  const splitIndex = Math.floor(sorted.length * Math.min(0.9, Math.max(0.1, config.trainingFraction)));

  sorted.forEach((match, matchIndex) => {
    const day = match.date.slice(0, 10);
    if (lastDay && day !== lastDay) flushDay();
    lastDay = day;
    const homeKey = `${match.competition}:${normalizeTeamName(match.homeTeam)}`;
    const awayKey = `${match.competition}:${normalizeTeamName(match.awayTeam)}`;
    const homeStats = stats.get(homeKey) ?? emptyStats();
    const awayStats = stats.get(awayKey) ?? emptyStats();
    const league = leagueHistory.get(match.competition) ?? { homeGoals: 0, awayGoals: 0, matches: 0 };
    const projectedLineupEligible = priorLineups.has(homeKey) && priorLineups.has(awayKey);
    const actualLineupEligible = match.lineup?.home.starters.length === 11 && match.lineup?.away.starters.length === 11;
    if (matchIndex >= splitIndex && homeStats.played >= 5 && awayStats.played >= 5 && league.matches >= 20) {
      const leagueHome = league.homeGoals / league.matches;
      const leagueAway = league.awayGoals / league.matches;
      const expected = estimateGoals(homeStats, awayStats, leagueHome, leagueAway);
      const simulation = simulateMatch({ homeTeam: match.homeTeam, awayTeam: match.awayTeam, expectedHomeGoals: expected.home, expectedAwayGoals: expected.away, iterations: config.iterations, seed: `${config.seed}:${match.id}`, modelVersion: "historical-goals-0.2", scenario: "baseline" });
      const probabilities: MarketProbabilities = {
        home: simulation.outcomes.home, draw: simulation.outcomes.draw, away: simulation.outcomes.away,
        homeOrDraw: simulation.doubleChance.homeOrDraw, awayOrDraw: simulation.doubleChance.awayOrDraw, homeOrAway: simulation.doubleChance.homeOrAway,
        over15: simulation.totals.over15, under15: 1 - simulation.totals.over15,
        over25: simulation.totals.over25, under25: 1 - simulation.totals.over25,
        over35: simulation.totals.over35, under35: 1 - simulation.totals.over35,
        btts: simulation.bothTeamsScore, bttsNo: 1 - simulation.bothTeamsScore,
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
      predictions.push({ matchId: match.id, date: match.date, competition: match.competition, homeTeam: match.homeTeam, awayTeam: match.awayTeam, actualHomeGoals: match.homeGoals, actualAwayGoals: match.awayGoals, actualOutcome, probabilities, selected, selectedMarket: selection?.[2] ?? null, selectedLabel, selectedProbability: selection?.[1] ?? 0, correct, brier, logLoss: -Math.log(Math.max(1e-9, actualProbability)), expectedHomeGoals: expected.home, expectedAwayGoals: expected.away, oddsUsed, profit: oddsUsed && correct !== null ? (correct ? oddsUsed - 1 : -1) : undefined, projectedLineupEligible, actualLineupEligible });
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
  return {
    config: { ...config },
    matchesSeen: sorted.length, evaluated: predictions.length, excludedWarmup, qualified: qualified.length, correct, incorrect: qualified.length - correct,
    hitRate: qualified.length ? correct / qualified.length : null, brierScore: average("brier"), logLoss: average("logLoss"),
    roi: priced.length && profit !== null ? profit / priced.length : null, profit, oddsCoverage: qualified.length ? priced.length / qualified.length : 0,
    evaluationStart: predictions[0]?.date, predictions, calibration, byCompetition, byMarket,
    modelComparison: [
      { model: "Match history, without lineups", coverage: predictions.length ? 1 : 0, evaluated: predictions.length, brierScore: average("brier"), note: "Uses only results and goals from matches played earlier. It never sees this match's final score before predicting." },
      { model: "Projected starters from earlier matches", coverage: predictions.length ? projectedEligible.length / predictions.length : 0, evaluated: projectedEligible.length, brierScore: subsetBrier(projectedEligible), note: projectedEligible.length ? "Uses real starting lineups from earlier matches to estimate who was likely to start. No made-up player boost is applied." : "Needs more mapped historical lineups before it can be tested." },
      { model: "Real historical starting XI", coverage: predictions.length ? actualEligible.length / predictions.length : 0, evaluated: actualEligible.length, brierScore: subsetBrier(actualEligible), note: actualEligible.length ? "Uses the real historical starters only in the 90-minute-before-kickoff test. It is never leaked into an earlier forecast." : "Needs more ESPN matches to be linked before it can be tested." },
    ],
  };
}
