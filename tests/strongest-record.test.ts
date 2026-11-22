import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStrongestPickRecord, gradeStrongestPick, readStrongestPicks,
  snapshotStrongestPick, snapshotStrongestPicks, strongestMarketWins,
} from "../lib/strongest-record";
import type { StrongestPick } from "../lib/strongest-pick";
import type { Fixture } from "../lib/types";

const now = Date.parse("2029-12-01T12:00:00Z");
const fixture: Fixture = {
  id: "match-001", leagueId: "eng.1", league: "Premier League",
  kickoff: new Date(now + 24 * 3600000).toISOString(),
  status: "scheduled", statusLabel: "Scheduled",
  home: { id: "h", name: "Arsenal", shortName: "Arsenal", abbreviation: "ARS", record: "12-1-2" },
  away: { id: "a", name: "Chelsea", shortName: "Chelsea", abbreviation: "CHE", record: "5-3-7" },
  source: "ESPN", sourceUpdatedAt: new Date(now).toISOString(),
};
const pick: StrongestPick = {
  fixtureId: fixture.id, marketKey: "over-1.5",
  fixtureLabel: "Arsenal vs Chelsea", league: fixture.league, kickoff: fixture.kickoff,
  market: "Over 1.5 goals", probability: 0.69, quality: "good",
  modelVersion: "test-model", evidence: "Historical scoring",
  pricing: "quoted", quotedAmerican: -150, bookmaker: "Pinnacle",
  updatedAt: new Date(now - 120000).toISOString(), indicativeEdge: 0.09,
};

afterEach(() => vi.unstubAllGlobals());

describe("prospective strongest model pick tracking", () => {
  it("rejects recording a pick after kickoff or on a completed fixture", () => {
    expect(buildStrongestPickRecord(pick, fixture, "fixture", now + 25 * 3600000)).toBeNull();
    expect(buildStrongestPickRecord(pick, { ...fixture, status: "final" }, "fixture", now)).toBeNull();
    expect(buildStrongestPickRecord({ ...pick, fixtureId: "wrong" }, fixture, "fixture", now)).toBeNull();
  });
  it("grades the original market, not simply the winner of the game", () => {
    const saved = buildStrongestPickRecord(pick, fixture, "command-center", now)!;
    expect(gradeStrongestPick(saved, { fixtureId: fixture.id, completed: false }).status).toBe("open");
    const won = gradeStrongestPick(saved, { fixtureId: fixture.id, completed: true, homeGoals: 1, awayGoals: 1 });
    expect(won.status).toBe("won");
    expect(won.result).toMatchObject({ homeGoals: 1, awayGoals: 1 });
    expect(gradeStrongestPick(saved, { fixtureId: fixture.id, completed: true, homeGoals: 1, awayGoals: 0 }).status).toBe("lost");
    expect(gradeStrongestPick(won, { fixtureId: fixture.id, completed: true, homeGoals: 1, awayGoals: 0 }).status).toBe("won");
  });
  it("covers other supported canonical markets", () => {
    expect(strongestMarketWins("home", 2, 1)).toBe(true);
    expect(strongestMarketWins("away", 2, 1)).toBe(false);
    expect(strongestMarketWins("draw", 1, 1)).toBe(true);
    expect(strongestMarketWins("home-draw", 1, 1)).toBe(true);
    expect(strongestMarketWins("away-draw", 2, 1)).toBe(false);
    expect(strongestMarketWins("over-2.5", 2, 1)).toBe(true);
    expect(strongestMarketWins("under-3.5", 2, 1)).toBe(true);
    expect(strongestMarketWins("btts", 2, 0)).toBe(false);
  });
  it("records every future match's strongest market once and preserves it across refreshes", () => {
    const data = new Map<string, string>();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    });
    vi.stubGlobal("window", { dispatchEvent });
    const other: Fixture = {
      ...fixture, id: "match-002", kickoff: new Date(now + 48 * 3600000).toISOString(),
    };
    const selections = [
      { fixture, pick, source: "command-center" as const },
      { fixture: other, pick: { ...pick, fixtureId: other.id, marketKey: "home",
          market: "Arsenal win", probability: 0.7 }, source: "command-center" as const },
    ];
    expect(snapshotStrongestPicks(selections, now)).toBe(2);
    expect(readStrongestPicks().length).toBe(2);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(snapshotStrongestPicks(selections.map((entry) => ({
      ...entry, pick: { ...entry.pick, market: "Changed after refresh" },
    })), now + 100000)).toBe(0);
    expect(readStrongestPicks().find((p) => p.fixtureId === fixture.id)?.market).toBe("Over 1.5 goals");
    expect(snapshotStrongestPicks(selections, now + 72 * 3600000)).toBe(0);
  });

  it("locks one original pick per fixture and never changes its price or market", () => {
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, value); },
    });
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    const first = snapshotStrongestPick(pick, fixture, "command-center", now)!;
    const later = snapshotStrongestPick({ ...pick, marketKey: "home", market: "Arsenal win",
      quotedAmerican: -120, probability: 0.72 }, fixture, "fixture", now + 300000)!;
    expect(later).toEqual(first);
    expect(readStrongestPicks()).toHaveLength(1);
    expect(readStrongestPicks()[0]).toMatchObject({ marketKey: "over-1.5", quotedAmerican: -150, source: "command-center" });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
