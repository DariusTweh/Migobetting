import { describe, expect, it } from "vitest";
import { forecastWithHistory } from "../lib/historical-forecast";
import type { HistoricalMatch } from "../lib/history";
import type { Fixture } from "../lib/types";

const fixture: Fixture = {
  id: "1", leagueId: "eng.1", league: "Premier League", kickoff: "2026-11-25T18:00:00Z",
  status: "scheduled", statusLabel: "Scheduled",
  home: { id: "a", name: "Arsenal FC", shortName: "Arsenal", abbreviation: "ARS", record: "10-2-1" },
  away: { id: "b", name: "Chelsea FC", shortName: "Chelsea", abbreviation: "CHE", record: "6-2-5" },
  source: "ESPN", sourceUpdatedAt: "2026-11-18T18:00:00Z",
};
function buildHistory(): HistoricalMatch[] {
  const teams = ["Arsenal", "Chelsea", "Liverpool", "Fulham", "Everton", "Newcastle", "Brentford", "West Ham"];
  return Array.from({ length: 160 }, (_, i) => {
    const homeTeam = teams[i % teams.length];
    const awayTeam = teams[(i + 1 + Math.floor(i / teams.length)) % teams.length];
    const homeGoals = i % 3 + 1;
    const awayGoals = i % 2;
    return { id: String(i), competition: "Premier League", season: "2025-26",
      date: new Date(Date.UTC(2026, 0, i % 250 + 1)).toISOString(),
      homeTeam, awayTeam, homeGoals, awayGoals,
      result: homeGoals > awayGoals ? "H" : homeGoals === awayGoals ? "D" : "A",
      source: "test", importedAt: "2026-11-19T00:00:00Z",
    };
  });
}
describe("scoring-based fixture forecasts", () => {
  it("uses imported prior scores rather than future outcomes", () => {
    const matches = buildHistory();
    const baseline = forecastWithHistory(fixture, matches);
    expect(baseline.modelVersion).toBe("migo-local-history-0.3");
    const future: HistoricalMatch = { ...matches[0], id: "future", date: "2027-01-01T00:00:00Z", homeGoals: 40, awayGoals: 40 };
    const altered = forecastWithHistory(fixture, [...matches, future]);
    expect(altered.expectedHomeGoals).toBe(baseline.expectedHomeGoals);
    expect(altered.expectedAwayGoals).toBe(baseline.expectedAwayGoals);
  });
  it("falls back when there is no imported history", () => {
    expect(forecastWithHistory(fixture, []).modelVersion).toBe("migo-baseline-0.1");
  });
});
