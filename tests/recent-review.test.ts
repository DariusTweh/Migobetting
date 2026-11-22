import { describe, expect, it } from "vitest";
import {
  buildRecentGameReviews, earliestForwardByFixture, pacificDayKey,
  recentPacificDays, recentGames, validPreKickoffSnapshot,
} from "../lib/recent-review";
import type { Fixture } from "../lib/types";
import type { ForwardPrediction } from "../lib/forward-store";
import type { StrongestPickRecord } from "../lib/strongest-record";
import type { HistoricalMatch } from "../lib/history";

const now = Date.parse("2026-11-21T23:00:00.000Z");
const match = (id: string, kickoff: string, homeGoals = 2, awayGoals = 1): Fixture => ({
  id, leagueId: "eng.1", league: "Premier League", kickoff,
  status: "final", statusLabel: "FT",
  home: { id: "home", name: "Arsenal", shortName: "Arsenal", abbreviation: "ARS", record: "99-0-0", score: homeGoals },
  away: { id: "away", name: "Chelsea", shortName: "Chelsea", abbreviation: "CHE", record: "0-0-99", score: awayGoals },
  source: "ESPN", sourceUpdatedAt: new Date(now).toISOString(),
});
const lastThursday = match("thu", "2026-11-19T19:00:00Z");
const lastFriday = match("fri", "2026-11-20T19:00:00Z");
const lastSaturday = match("sat", "2026-11-21T19:00:00Z");
const oldWednesday = match("wed", "2026-11-18T19:00:00Z");
const futureSunday = match("sun", "2026-11-22T19:00:00Z");

const strongest: StrongestPickRecord = {
  id: "saved", fixtureId: "fri", leagueId: "eng.1", fixtureLabel: "Arsenal vs Chelsea",
  league: "Premier League", kickoff: lastFriday.kickoff, lockedAt: "2026-11-20T10:00:00Z",
  source: "command-center", marketKey: "over-1.5", market: "Over 1.5 goals",
  probability: 0.73, modelVersion: "original-forecast", dataQuality: "good",
  quotedAmerican: -150, bookmaker: "Pinnacle", oddsUpdatedAt: "2026-11-20T09:00:00Z",
  status: "open",
};
const forward: ForwardPrediction = {
  id: "old-forecast", fixtureId: "thu", leagueId: "eng.1",
  fixtureLabel: "Arsenal vs Chelsea", kickoff: lastThursday.kickoff,
  lockedAt: "2026-11-19T10:00:00Z", modelVersion: "pre-match",
  probabilities: { home: .7, draw: .2, away: .1, over15: .7, over25: .5, btts: .4 },
  predictedOutcome: "home", status: "open",
};
const history: HistoricalMatch[] = Array.from({ length: 140 }, (_, i) => ({
  id: "historical-" + i, competition: "Premier League", season: "2025-26",
  date: new Date(Date.UTC(2026, 0, 1 + i * 2, 12)).toISOString(),
  homeTeam: ["Arsenal", "Chelsea", "Liverpool", "Everton"][i % 4],
  awayTeam: ["Chelsea", "Liverpool", "Everton", "Arsenal"][i % 4],
  homeGoals: 1 + i % 3, awayGoals: i % 2,
  result: "H", source: "test historical fixture", importedAt: "2026-11-20T00:00:00Z",
}));

describe("recent three-day review (real snapshots versus reconstructed replays)", () => {
  it("uses Pacific calendar days including DST instead of rolling 72-hour window", () => {
    expect(recentPacificDays(now)).toEqual(["2026-11-21", "2026-11-20", "2026-11-19"]);
    // 07:30 UTC is 00:30 PDT on March 9, after the DST transition.
    expect(recentPacificDays(Date.parse("2026-03-09T07:30:00Z"))).toEqual([
      "2026-03-09", "2026-03-08", "2026-03-07",
    ]);
    expect(pacificDayKey(lastThursday.kickoff)).toBe("2026-11-19");
    expect(recentGames([lastThursday, lastFriday, lastSaturday, oldWednesday, futureSunday], now).map(m => m.id))
      .toEqual(["sat", "fri", "thu"]);
  });

  it("recognizes saved pre-match picks rather than backdating new ones", () => {
    const rows = buildRecentGameReviews([lastThursday, lastFriday], [], [strongest], [forward], now);
    expect(rows.find(r => r.fixtureId === "fri")).toMatchObject({
      review: "strongest", verdict: "won", modelVersion: "original-forecast",
    });
    expect(rows.find(r => r.fixtureId === "thu")).toMatchObject({
      review: "forward", verdict: "won", modelVersion: "pre-match",
    });
    expect(validPreKickoffSnapshot("2026-11-21T20:00:00Z", lastFriday.kickoff)).toBe(false);
  });

  it("excludes invalid post-kickoff forward records and keeps only the earliest saved pre-kickoff version", () => {
    const earlier = { ...forward, lockedAt: "2026-11-18T14:00:00Z", id: "earlier" };
    const after = { ...forward, lockedAt: "2026-11-21T14:00:00Z", id: "after" };
    const saved = earliestForwardByFixture([after, forward, earlier]);
    expect(saved.size).toBe(1);
    expect(saved.get("eng.1:thu")?.id).toBe("earlier");
    const today = buildRecentGameReviews([lastThursday], [], [], [after], now);
    expect(today[0].review).toBe("unavailable");
  });

  it("labels finished games without actual pre-kickoff forecasts as replays, never records", () => {
    const rows = buildRecentGameReviews([lastSaturday], history, [], [], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].review).toBe("replay");
    const alteredScore = buildRecentGameReviews([match("sat", lastSaturday.kickoff, 0, 5)], history, [], [], now)[0];
    expect(alteredScore.market).toBe(rows[0].market);
    expect(alteredScore.probability).toBe(rows[0].probability);
    expect(alteredScore.modelVersion).toBe(rows[0].modelVersion);
  });

  it("does not pretend to have a pre-match forecast when historical goals are missing", () => {
    const rows = buildRecentGameReviews([lastSaturday], [], [], [], now);
    expect(rows[0]).toMatchObject({ review: "unavailable", verdict: "not-scored", market: null });
  });
});
