import { describe, expect, it } from "vitest";
import {
  getHeadToHead, getTeamPastMatches, summarizeHeadToHead,
  summarizeTeamForm, formTeamKey,
} from "../lib/form-history";
import { parseHistoricalCsv, type HistoricalMatch } from "../lib/history";
import type { Fixture } from "../lib/types";

const fixture: Fixture = {
  id: "sample", leagueId: "ita.1", league: "Serie A",
  kickoff: "2026-11-23T19:00:00Z", status: "scheduled",
  statusLabel: "Scheduled", source: "ESPN",
  sourceUpdatedAt: "2026-11-20T10:00:00Z",
  home: { id: "a", name: "AC Monza", shortName: "Monza", abbreviation: "MON" },
  away: { id: "b", name: "Fiorentina", shortName: "Fiorentina", abbreviation: "FIO" },
};
const game = (id: string, date: string, homeTeam: string, awayTeam: string, hg: number, ag: number,
  competition = "Serie A"): HistoricalMatch => ({
  id, date, homeTeam, awayTeam, competition, season: "2026-27",
  homeGoals: hg, awayGoals: ag,
  result: hg > ag ? "H" : hg < ag ? "A" : "D",
  source: "fixture-test", importedAt: "2026-11-22T12:00:00Z",
});
const history: HistoricalMatch[] = [
  game("h2h-old", "2024-11-01T12:00:00Z", "Fiorentina", "Monza", 2, 2),
  game("h2h-recent", "2026-11-02T12:00:00Z", "AC Monza", "Fiorentina", 1, 2),
  game("home", "2026-11-10T12:00:00Z", "Monza", "Inter", 2, 0),
  game("away", "2026-11-18T12:00:00Z", "Juventus", "Monza", 0, 1),
  game("other", "2026-11-15T12:00:00Z", "Napoli", "Fiorentina", 2, 1),
  game("future", "2026-11-25T12:00:00Z", "Monza", "Fiorentina", 9, 0),
  game("same-day", "2026-11-23T00:00:00Z", "Monza", "Fiorentina", 9, 0),
  game("cup", "2026-11-19T12:00:00Z", "Fiorentina", "Monza", 0, 0, "Coppa Italia"),
];

describe("match form, H2H and league history", () => {
  it("matches AC/FC team variants and never leaks same-day or future scores", () => {
    expect(formTeamKey("AC Monza")).toBe(formTeamKey("Monza"));
    const items = getHeadToHead(history, fixture, 10);
    expect(items.map((item) => item.id)).toEqual(["cup", "h2h-recent", "h2h-old"]);
    expect(items).not.toContainEqual(expect.objectContaining({ id: "future" }));
    expect(items).not.toContainEqual(expect.objectContaining({ id: "same-day" }));
  });
  it("filters recent home/away matches, competition, and maintains stable date order", () => {
    const all = getTeamPastMatches(history, fixture, "home", { limit: 10 });
    expect(all.map((item) => item.id)).toEqual(["cup", "away", "home", "h2h-recent", "h2h-old"]);
    expect(all.find((item) => item.id === "away")).toMatchObject({
      venue: "away", result: "W", goalsFor: 1, goalsAgainst: 0,
    });
    const homeOnly = getTeamPastMatches(history, fixture, "home", { venue: "home", competitionOnly: true });
    expect(homeOnly.map((item) => item.id)).toEqual(["home", "h2h-recent"]);
    const awayTeam = getTeamPastMatches(history, fixture, "away", { competitionOnly: true });
    expect(awayTeam.map((item) => item.id)).toEqual(["other", "h2h-recent", "h2h-old"]);
  });
  it("counts correct H2H outcomes independent of venue", () => {
    const summary = summarizeHeadToHead(getHeadToHead(history, fixture, 10), fixture);
    expect(summary).toMatchObject({
      played: 3, firstWins: 0, draws: 2, secondWins: 1, btts: 2,
    });
  });
  it("computes WDL and only actual half-time streak data", () => {
    const matches = getTeamPastMatches(history, fixture, "home", { limit: 10 });
    const s = summarizeTeamForm(matches);
    expect(s).toMatchObject({ played: 5, wins: 2, losses: 1, draws: 2, firstHalfAvailable: 0 });
    expect(s.currentUnbeaten).toBe(3);
    expect(s.currentWithoutCleanSheet).toBe(0);
  });
  it("never converts missing or invalid CSV halftime values to zero", () => {
    const csv = [
      "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG",
      "I1,01/11/2026,Monza,Fiorentina,2,1,H,,",
      "I1,02/11/2026,Fiorentina,Monza,1,0,H,1,",
      "I1,03/11/2026,Monza,Fiorentina,2,2,D,3,1",
      "I1,04/11/2026,Fiorentina,Monza,2,1,H,1,0",
    ].join("\n");
    const parsed = parseHistoricalCsv(csv, { season: "2026-27" }).matches;
    expect(parsed).toHaveLength(4);
    expect(parsed[0].halfTimeHomeGoals).toBeUndefined();
    expect(parsed[1].halfTimeHomeGoals).toBeUndefined();
    expect(parsed[2].halfTimeHomeGoals).toBeUndefined();
    expect(parsed[3]).toMatchObject({ halfTimeHomeGoals: 1, halfTimeAwayGoals: 0 });
  });
});
