import type { Fixture, Forecast } from "./types";
import type { HistoricalMatch } from "./history";
import { estimateHistoricalGoals } from "./history";
import { forecastFixture } from "./model";
import { ftVersion, isUefaMen } from "./uefa-competitions";
import { calibrateFullTimeForecast } from "./full-time-calibration";

const leagueName = (fixture: Fixture) => fixture.leagueId === "usa.1" ? "MLS" : fixture.league;

/** Uses only results available before kickoff and falls back to the record model. */
export function forecastWithHistory(fixture: Fixture, all: HistoricalMatch[]): Forecast {
  const fallback = forecastFixture(fixture);
  const estimate = estimateHistoricalGoals(all, {
    competition: leagueName(fixture),
    homeTeam: fixture.home.name,
    awayTeam: fixture.away.name,
    kickoff: fixture.kickoff,
  });
  if (!estimate) return fallback;
  const good = estimate.homeMatches >= 16 && estimate.awayMatches >= 16 && estimate.effectiveMatches >= 40;
  return calibrateFullTimeForecast(forecastFixture(fixture, {
    expectedHomeGoals: estimate.expectedHomeGoals,
    expectedAwayGoals: estimate.expectedAwayGoals,
    lowScoreCorrelation: estimate.lowScoreCorrelation,
    version: ftVersion(leagueName(fixture)),
    quality: good ? "good" : "limited",
    evidence: [
      "Recency-weighted local history: " + estimate.matches + " earlier " + (isUefaMen(leagueName(fixture))?"domestic and UEFA":leagueName(fixture)) + " matches (" + estimate.effectiveMatches.toFixed(1) + " effective).",
      fixture.home.shortName + ": " + estimate.homeMatches + " previous matches; " + fixture.away.shortName + ": " + estimate.awayMatches + ".",
      "Opponent-adjusted league home/away averages: " + estimate.leagueHomeAverage.toFixed(2) + " / " + estimate.leagueAwayAverage.toFixed(2) + ".",
      "Adjusted scoring expectations: " + estimate.expectedHomeGoals.toFixed(2) + " / " + estimate.expectedAwayGoals.toFixed(2) + " goals.",
      "Fitted low-score correlation: " + estimate.lowScoreCorrelation.toFixed(2) + ".",
    ],
    risks: [
      ...(estimate.homeMatches < 7 || estimate.awayMatches < 7
        ? ["At least one team has fewer than seven matches in this league, so its rating is heavily shrunk toward the fitted league average."]
        : []),
      ...(isUefaMen(leagueName(fixture))?["Cross-league ratings normalize scoring environments; absolute league-strength differences still require validation."]:[]),
      "Opponent-adjusted goal estimates are not verified expected-goals (xG) or player-specific forecasts.",
      "Unavailable injuries, tactical changes, absences, and confirmed lineups are not yet assigned numerical effects.",
      "The fitted probabilities still require rolling out-of-sample calibration before real-money use.",
    ],
  }), leagueName(fixture), fixture.kickoff);
}
