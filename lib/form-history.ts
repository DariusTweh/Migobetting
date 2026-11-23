import { normalizeTeamName, type HistoricalMatch } from "./history";
import type { Fixture } from "./types";

export type FormVenue = "all" | "home" | "away";
export type FormSide = "home" | "away";
export type HistoricalResult = "W" | "D" | "L";

export type TeamPastMatch = {
  id: string;
  date: string;
  competition: string;
  team: string;
  opponent: string;
  venue: "home" | "away";
  goalsFor: number;
  goalsAgainst: number;
  halfTimeFor?: number;
  halfTimeAgainst?: number;
  result: HistoricalResult;
};

export type FormSummary = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  over25: number;
  btts: number;
  under35: number;
  cleanSheets: number;
  currentUnbeaten: number;
  currentLossStreak: number;
  currentWithoutCleanSheet: number;
  firstHalfAvailable: number;
  firstHalfOver05: number;
  firstHalfOver15: number;
};

export type HeadToHeadSummary = {
  played: number;
  firstWins: number;
  draws: number;
  secondWins: number;
  over25: number;
  btts: number;
  firstCleanSheets: number;
  secondCleanSheets: number;
};

export function formTeamKey(name: string): string {
  return normalizeTeamName(name)
    .replace(/^(fc|afc|ac|cf|ssc|ss|as|us|sc) /, "")
    .replace(/ (fc|afc|cf|sc)$/, "")
    .trim();
}

function beforeMatch(history: HistoricalMatch[], fixture: Fixture): HistoricalMatch[] {
  const kickoff = Date.parse(fixture.kickoff);
  if (!Number.isFinite(kickoff)) return [];
  // Football-Data CSV rows are DATE-only and imported at noon UTC. Exclude
  // the entire kickoff UTC date, even if a same-day result looks earlier.
  const cutoff = Date.parse(fixture.kickoff.slice(0, 10) + "T00:00:00Z");
  return history.filter((match) => {
    const date = Date.parse(match.date);
    return Number.isFinite(date) && date < cutoff &&
      Number.isInteger(match.homeGoals) && Number.isInteger(match.awayGoals);
  });
}

const byMostRecent = (a: HistoricalMatch, b: HistoricalMatch) =>
  b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

export function getTeamPastMatches(
  history: HistoricalMatch[], fixture: Fixture, side: FormSide,
  options: { venue?: FormVenue; competitionOnly?: boolean; limit?: number } = {},
): TeamPastMatch[] {
  const team = side === "home" ? fixture.home.name : fixture.away.name;
  const key = formTeamKey(team);
  const matches = beforeMatch(history, fixture)
    .filter((match) => !options.competitionOnly || match.competition === fixture.league)
    .filter((match) => {
      const home = formTeamKey(match.homeTeam) === key;
      const away = formTeamKey(match.awayTeam) === key;
      return home !== away && (options.venue === "home" ? home :
        options.venue === "away" ? away : true);
    }).sort(byMostRecent).slice(0, Math.max(1, Math.min(30, options.limit ?? 10)));
  return matches.map((match) => {
    const isHome = formTeamKey(match.homeTeam) === key;
    const gf = isHome ? match.homeGoals : match.awayGoals;
    const ga = isHome ? match.awayGoals : match.homeGoals;
    const htValid = Number.isInteger(match.halfTimeHomeGoals) &&
      Number.isInteger(match.halfTimeAwayGoals) &&
      match.halfTimeHomeGoals! >= 0 && match.halfTimeAwayGoals! >= 0 &&
      match.halfTimeHomeGoals! <= match.homeGoals &&
      match.halfTimeAwayGoals! <= match.awayGoals;
    return {
      id: match.id, date: match.date, competition: match.competition,
      team, opponent: isHome ? match.awayTeam : match.homeTeam,
      venue: isHome ? "home" : "away",
      goalsFor: gf, goalsAgainst: ga,
      halfTimeFor: htValid ? (isHome ? match.halfTimeHomeGoals : match.halfTimeAwayGoals) : undefined,
      halfTimeAgainst: htValid ? (isHome ? match.halfTimeAwayGoals : match.halfTimeHomeGoals) : undefined,
      result: gf > ga ? "W" : gf < ga ? "L" : "D",
    };
  });
}

export function getHeadToHead(
  history: HistoricalMatch[], fixture: Fixture, limit = 10,
): HistoricalMatch[] {
  const home = formTeamKey(fixture.home.name);
  const away = formTeamKey(fixture.away.name);
  if (!home || !away || home === away) return [];
  return beforeMatch(history, fixture)
    .filter((match) => {
      const a = formTeamKey(match.homeTeam), b = formTeamKey(match.awayTeam);
      return (a === home && b === away) || (a === away && b === home);
    }).sort(byMostRecent).slice(0, Math.max(1, Math.min(30, limit)));
}

export function summarizeTeamForm(matches: TeamPastMatch[]): FormSummary {
  const streak = (test: (match: TeamPastMatch) => boolean) => {
    let run = 0;
    for (const match of matches) { if (!test(match)) break; run++; }
    return run;
  };
  const withHalf = matches.filter((m) =>
    m.halfTimeFor !== undefined && m.halfTimeAgainst !== undefined);
  return {
    played: matches.length,
    wins: matches.filter((m) => m.result === "W").length,
    draws: matches.filter((m) => m.result === "D").length,
    losses: matches.filter((m) => m.result === "L").length,
    goalsFor: matches.reduce((sum, m) => sum + m.goalsFor, 0),
    goalsAgainst: matches.reduce((sum, m) => sum + m.goalsAgainst, 0),
    over25: matches.filter((m) => m.goalsFor + m.goalsAgainst >= 3).length,
    btts: matches.filter((m) => m.goalsFor > 0 && m.goalsAgainst > 0).length,
    under35: matches.filter((m) => m.goalsFor + m.goalsAgainst <= 3).length,
    cleanSheets: matches.filter((m) => m.goalsAgainst === 0).length,
    currentUnbeaten: streak((m) => m.result !== "L"),
    currentLossStreak: streak((m) => m.result === "L"),
    currentWithoutCleanSheet: streak((m) => m.goalsAgainst > 0),
    firstHalfAvailable: withHalf.length,
    firstHalfOver05: withHalf.filter((m) => m.halfTimeFor! + m.halfTimeAgainst! > 0).length,
    firstHalfOver15: withHalf.filter((m) => m.halfTimeFor! + m.halfTimeAgainst! >= 2).length,
  };
}

export function summarizeHeadToHead(matches: HistoricalMatch[], fixture: Fixture): HeadToHeadSummary {
  const homeKey = formTeamKey(fixture.home.name);
  const firstGoals = (m: HistoricalMatch) => formTeamKey(m.homeTeam) === homeKey ? m.homeGoals : m.awayGoals;
  const secondGoals = (m: HistoricalMatch) => formTeamKey(m.homeTeam) === homeKey ? m.awayGoals : m.homeGoals;
  return {
    played: matches.length,
    firstWins: matches.filter((m) => firstGoals(m) > secondGoals(m)).length,
    draws: matches.filter((m) => firstGoals(m) === secondGoals(m)).length,
    secondWins: matches.filter((m) => firstGoals(m) < secondGoals(m)).length,
    over25: matches.filter((m) => m.homeGoals + m.awayGoals >= 3).length,
    btts: matches.filter((m) => m.homeGoals > 0 && m.awayGoals > 0).length,
    firstCleanSheets: matches.filter((m) => secondGoals(m) === 0).length,
    secondCleanSheets: matches.filter((m) => firstGoals(m) === 0).length,
  };
}
