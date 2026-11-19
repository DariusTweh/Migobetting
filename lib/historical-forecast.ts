import type { Fixture, Forecast } from "./types";
import type { HistoricalMatch } from "./history";
import { normalizeTeamName } from "./history";
import { forecastFixture } from "./model";

function teamKey(value: string): string {
  const cleaned = normalizeTeamName(value)
    .replace(/^(fc|afc|cf) /, "").replace(/ (fc|afc|cf|sc)$/,"").trim();
  const aliases: Record<string, string> = {
    "internazionale": "inter", "inter milan": "inter",
    "manchester united": "manchester united", "man united": "manchester united",
    "brighton hove albion": "brighton",
    "tottenham hotspur": "tottenham",
    "athletic club": "athletic bilbao", "ath bilbao": "athletic bilbao",
    "atletico madrid": "atletico madrid", "ath madrid": "atletico madrid",
    "paris saint germain": "paris saint-germain",
    "borussia monchengladbach": "monchengladbach",
  };
  return aliases[cleaned] ?? cleaned;
}

const leagueName = (fixture: Fixture) => fixture.leagueId === "usa.1" ? "MLS" : fixture.league;
const clamp = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));
type TeamGoals = { played: number; homePlayed: number; awayPlayed: number; homeScored: number; homeConceded: number; awayScored: number; awayConceded: number };

function teamGoals(matches: HistoricalMatch[], name: string): TeamGoals {
  const key = teamKey(name);
  const relevant = matches.filter((match) => teamKey(match.homeTeam) === key || teamKey(match.awayTeam) === key).slice(-30);
  const totals: TeamGoals = { played: relevant.length, homePlayed: 0, awayPlayed: 0, homeScored: 0, homeConceded: 0, awayScored: 0, awayConceded: 0 };
  for (const match of relevant) {
    if (teamKey(match.homeTeam) === key) {
      totals.homePlayed++; totals.homeScored += match.homeGoals; totals.homeConceded += match.awayGoals;
    } else {
      totals.awayPlayed++; totals.awayScored += match.awayGoals; totals.awayConceded += match.homeGoals;
    }
  }
  return totals;
}

/**
 * Team-goal model is built ONLY from the user's imported historical results.
 * It is not an xG feed and is not yet calibrated against bookmaker markets.
 */
export function forecastWithHistory(fixture: Fixture, all: HistoricalMatch[]): Forecast {
  const fallback = forecastFixture(fixture);
  const kickoff = Date.parse(fixture.kickoff);
  if (!Number.isFinite(kickoff)) return fallback;
  const eligible = all.filter((match) =>
    match.competition === leagueName(fixture) &&
    Date.parse(match.date) < kickoff &&
    Date.parse(match.date) > kickoff - 730 * 86400000,
  ).sort((a, b) => a.date.localeCompare(b.date));
  if (eligible.length < 70) return fallback;
  const home = teamGoals(eligible, fixture.home.name);
  const away = teamGoals(eligible, fixture.away.name);
  if (home.played < 7 || away.played < 7) return fallback;
  const avgHome = eligible.reduce((sum, match) => sum + match.homeGoals, 0) / eligible.length;
  const avgAway = eligible.reduce((sum, match) => sum + match.awayGoals, 0) / eligible.length;
  if (avgHome < 0.3 || avgAway < 0.3) return fallback;
  const regularized = (goals: number, played: number, prior: number) => (goals + prior * 6) / (played + 6);

  const hAttack = regularized(home.homeScored, home.homePlayed, avgHome);
  const hDefense = regularized(home.homeConceded, home.homePlayed, avgAway);
  const aAttack = regularized(away.awayScored, away.awayPlayed, avgAway);
  const aDefense = regularized(away.awayConceded, away.awayPlayed, avgHome);
  const expectedHomeGoals = clamp(avgHome * (hAttack / avgHome) * (aDefense / avgHome), 0.25, 3.7);
  const expectedAwayGoals = clamp(avgAway * (aAttack / avgAway) * (hDefense / avgAway), 0.20, 3.4);
  const good = home.played >= 16 && away.played >= 16;
  return forecastFixture(fixture, {
    expectedHomeGoals, expectedAwayGoals,
    version: "migo-local-history-0.3",
    quality: good ? "good" : "limited",
    evidence: [
      "Local historical goal data: " + eligible.length + " earlier matches in " + leagueName(fixture) + ".",
      fixture.home.shortName + ": " + home.played + " previous matches; " + home.homePlayed + " home fixtures in the recent sample.",
      fixture.away.shortName + ": " + away.played + " previous matches; " + away.awayPlayed + " away fixtures in the recent sample.",
      "League home/away goal averages: " + avgHome.toFixed(2) + " / " + avgAway.toFixed(2) + ".",
      "Adjusted scoring expectations: " + expectedHomeGoals.toFixed(2) + " / " + expectedAwayGoals.toFixed(2) + " goals.",
    ],
    risks: [
      "Goal-based estimates are not verified expected-goals (xG) or player-specific forecasts.",
      "Unavailable injuries, tactical changes, absences, and confirmed lineups are not yet assigned numerical effects.",
      "Recent match quality and model calibration still require proper out-of-sample verification.",
    ],
  });
}
