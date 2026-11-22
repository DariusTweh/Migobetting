import { afterEach, describe, expect, it, vi } from "vitest";
import {
  historicalReplayStats, readHistoricalReplayRecords, snapshotHistoricalReplayRecords,
} from "../lib/historical-replay-record";
import type { RecentGameReview } from "../lib/recent-review";

const replay = (fixtureId: string, verdict: "won" | "lost"): RecentGameReview => ({
  fixtureId, leagueId: "eng.1", fixtureLabel: "Arsenal vs Chelsea",
  league: "Premier League", kickoff: "2026-11-20T19:00:00Z",
  status: "final", score: "2–1", review: "replay",
  market: "Over 2.5 goals", probability: 0.68, verdict,
  modelVersion: "historical-v1",
});

function browser() {
  const memory = new Map<string, string>();
  const dispatchEvent = vi.fn();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
  });
  vi.stubGlobal("window", { dispatchEvent });
  return { dispatchEvent, memory };
}
afterEach(() => vi.unstubAllGlobals());

describe("cumulative historical replay W-L record", () => {
  it("counts wins losses and hit rate without conflating missing data", () => {
    browser();
    const records = snapshotHistoricalReplayRecords([
      replay("one", "won"), replay("two", "lost"), replay("three", "won"),
    ]);
    expect(historicalReplayStats(records)).toMatchObject({
      wins: 2, losses: 1, graded: 3,
    });
    expect(historicalReplayStats(records).hitRate).toBeCloseTo(2 / 3);
    expect(historicalReplayStats([])).toMatchObject({ wins: 0, losses: 0, graded: 0, hitRate: null });
  });

  it("saves old replay outcomes only once, keeping cumulative results beyond the 3-day window", () => {
    const { dispatchEvent } = browser();
    const saved = snapshotHistoricalReplayRecords([replay("a", "won"), replay("b", "lost")]);
    expect(saved).toHaveLength(2);
    expect(historicalReplayStats(saved)).toMatchObject({ wins: 1, losses: 1 });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const later = snapshotHistoricalReplayRecords([
      { ...replay("a", "lost"), modelVersion: "future-model" }, // no rewriting after model updates
      { ...replay("c", "won"), kickoff: "2026-11-24T19:00:00Z" },
    ]);
    expect(later).toHaveLength(3);
    expect(later.find(item => item.fixtureId === "a")).toMatchObject({
      status: "won", modelVersion: "historical-v1",
    });
    expect(historicalReplayStats(later)).toMatchObject({ wins: 2, losses: 1 });
    expect(snapshotHistoricalReplayRecords([replay("a", "won")])).toHaveLength(3);
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
  });

  it("never adds genuine pre-kickoff picks, live matches, no-data fixtures or unresolved scores", () => {
    browser();
    const mixed: RecentGameReview[] = [
      replay("qualified", "won"),
      { ...replay("saved", "won"), review: "strongest" },
      { ...replay("forward", "won"), review: "forward" },
      { ...replay("live", "won"), status: "live" },
      { ...replay("unavailable", "lost"), review: "unavailable" },
      { ...replay("badscore", "won"), score: "—" },
      { ...replay("noproba", "won"), probability: null },
    ];
    expect(snapshotHistoricalReplayRecords(mixed).map(r => r.fixtureId)).toEqual(["qualified"]);
    expect(readHistoricalReplayRecords()).toHaveLength(1);
  });

  it("saves league-qualified IDs so identical provider fixture IDs from other leagues never collide", () => {
    browser();
    const matches = [replay("shared", "won"), { ...replay("shared", "lost"), leagueId: "ita.1" as const, league: "Serie A" }];
    expect(snapshotHistoricalReplayRecords(matches)).toHaveLength(2);
  });
});
