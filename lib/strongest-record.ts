"use client";

import type { LeagueId, Fixture } from "./types";
import type { MarketKey } from "./market-odds";
import type { StrongestPick } from "./strongest-pick";
import type { MatchFinal } from "./paper-parlays";

const KEY = "migo:strongest-picks:v1";
const allowed = new Set<MarketKey>([
  "home", "draw", "away", "home-draw", "away-draw",
  "over-1.5", "over-2.5", "under-3.5", "btts",
]);

export type StrongestPickRecord = {
  id: string;
  fixtureId: string;
  leagueId: LeagueId;
  fixtureLabel: string;
  league: string;
  kickoff: string;
  lockedAt: string;
  source: "command-center" | "fixture";
  marketKey: MarketKey;
  market: string;
  probability: number;
  modelVersion: string;
  dataQuality: "good" | "limited" | "insufficient";
  quotedAmerican: number | null;
  bookmaker: string | null;
  oddsUpdatedAt: string | null;
  status: "open" | "won" | "lost";
  result?: { homeGoals: number; awayGoals: number; checkedAt: string };
};

export function readStrongestPicks(): StrongestPickRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(saved) ? saved as StrongestPickRecord[] : [];
  } catch {
    return [];
  }
}

function write(items: StrongestPickRecord[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("migo:strongest"));
}

export function buildStrongestPickRecord(
  pick: StrongestPick, fixture: Fixture,
  source: StrongestPickRecord["source"], now = Date.now(),
): StrongestPickRecord | null {
  const kickoff = Date.parse(fixture.kickoff);
  if (fixture.status !== "scheduled" || !Number.isFinite(kickoff) || kickoff <= now ||
      pick.fixtureId !== fixture.id || !allowed.has(pick.marketKey as MarketKey) ||
      !Number.isFinite(pick.probability) || pick.probability <= 0 || pick.probability >= 1 ||
      pick.quality === "insufficient") return null;
  return {
    id: "migo-strongest:" + fixture.leagueId + ":" + fixture.id,
    fixtureId: fixture.id,
    leagueId: fixture.leagueId,
    fixtureLabel: pick.fixtureLabel,
    league: fixture.league,
    kickoff: fixture.kickoff,
    lockedAt: new Date(now).toISOString(),
    source,
    marketKey: pick.marketKey as MarketKey,
    market: pick.market,
    probability: pick.probability,
    modelVersion: pick.modelVersion,
    dataQuality: pick.quality,
    quotedAmerican: pick.quotedAmerican,
    bookmaker: pick.bookmaker,
    oddsUpdatedAt: pick.updatedAt,
    status: "open",
  };
}

/**
 * Save the first eligible pre-kickoff selection per fixture and never overwrite
 * its model, market, odds or timestamp when the page is revisited or refreshed.
 * Browser-local storage is not tamper-proof and exists only on this browser.
 */
export function snapshotStrongestPick(
  pick: StrongestPick, fixture: Fixture,
  source: StrongestPickRecord["source"], now = Date.now(),
): StrongestPickRecord | null {
  const record = buildStrongestPickRecord(pick, fixture, source, now);
  if (!record || typeof window === "undefined") return null;
  const saved = readStrongestPicks();
  const existing = saved.find((item) => item.id === record.id);
  if (existing) return existing;
  try {
    write([record, ...saved]);
    return record;
  } catch { return null; }
}

/**
 * Lock every visible, eligible fixture's actual strongest market in one local
 * storage transaction. This is not a retroactive backfill; buildStrongestPickRecord
 * rejects started/final matches. Existing locked selections always take priority.
 */
export function snapshotStrongestPicks(
  selections: Array<{ pick: StrongestPick; fixture: Fixture; source: StrongestPickRecord["source"] }>,
  now = Date.now(),
): number {
  if (typeof window === "undefined") return 0;
  const saved = readStrongestPicks();
  const known = new Set(saved.map((item) => item.id));
  const additions: StrongestPickRecord[] = [];
  for (const entry of selections) {
    const record = buildStrongestPickRecord(entry.pick, entry.fixture, entry.source, now);
    if (!record || known.has(record.id)) continue;
    known.add(record.id);
    additions.push(record);
  }
  if (!additions.length) return 0;
  try {
    write([...additions, ...saved]);
    return additions.length;
  } catch { return 0; }
}

/** Grade the selected canonical market against actual ESPN full-time scores. */
export function strongestMarketWins(key: MarketKey, home: number, away: number): boolean {
  switch (key) {
    case "home": return home > away;
    case "draw": return home === away;
    case "away": return away > home;
    case "home-draw": return home >= away;
    case "away-draw": return away >= home;
    case "over-1.5": return home + away >= 2;
    case "over-2.5": return home + away >= 3;
    case "under-3.5": return home + away <= 3;
    case "btts": return home > 0 && away > 0;
  }
}

export function gradeStrongestPick(
  record: StrongestPickRecord, final: MatchFinal, checkedAt = new Date().toISOString(),
): StrongestPickRecord {
  if (record.status !== "open" || final.fixtureId !== record.fixtureId ||
      !final.completed || !Number.isInteger(final.homeGoals) || !Number.isInteger(final.awayGoals) ||
      final.homeGoals! < 0 || final.awayGoals! < 0) return record;
  return {
    ...record,
    status: strongestMarketWins(record.marketKey, final.homeGoals!, final.awayGoals!) ? "won" : "lost",
    result: { homeGoals: final.homeGoals!, awayGoals: final.awayGoals!, checkedAt },
  };
}

export function applyStrongestPickResults(finals: MatchFinal[]): StrongestPickRecord[] {
  const previous = readStrongestPicks();
  const byId = new Map(finals.map((item) => [item.fixtureId, item]));
  const next = previous.map((record) => {
    const final = byId.get(record.fixtureId);
    return final ? gradeStrongestPick(record, final) : record;
  });
  if (next.some((record, i) => record.status !== previous[i].status)) {
    try { write(next); } catch { /* retain in-memory grade; retry after refresh */ }
  }
  return next;
}
