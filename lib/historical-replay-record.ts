"use client";

import type { RecentGameReview } from "./recent-review";

const KEY = "migo:historical-replay-record:v1";
const EVENT = "migo:historical-replay";

export type HistoricalReplayRecord = {
  id: string;
  fixtureId: string;
  leagueId: string;
  fixtureLabel: string;
  league: string;
  kickoff: string;
  evaluatedAt: string;
  market: string;
  modelProbability: number;
  modelVersion: string;
  finalScore: string;
  status: "won" | "lost";
  source: "retrospective";
};

export type HistoricalReplayStats = {
  wins: number;
  losses: number;
  graded: number;
  hitRate: number | null;
};

export function historicalReplayStats(records: readonly HistoricalReplayRecord[]): HistoricalReplayStats {
  const wins = records.filter((record) => record.status === "won").length;
  const losses = records.filter((record) => record.status === "lost").length;
  const graded = wins + losses;
  return { wins, losses, graded, hitRate: graded > 0 ? wins / graded : null };
}

function isReplay(value: unknown): value is HistoricalReplayRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<HistoricalReplayRecord>;
  return typeof record.id === "string" && typeof record.fixtureId === "string" &&
    typeof record.leagueId === "string" && typeof record.fixtureLabel === "string" &&
    typeof record.kickoff === "string" && Number.isFinite(Date.parse(record.kickoff)) &&
    typeof record.market === "string" && typeof record.finalScore === "string" &&
    typeof record.modelVersion === "string" && typeof record.evaluatedAt === "string" &&
    typeof record.modelProbability === "number" && record.modelProbability > 0 && record.modelProbability < 1 &&
    (record.status === "won" || record.status === "lost") && record.source === "retrospective";
}

export function readHistoricalReplayRecords(): HistoricalReplayRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter(isReplay) : [];
  } catch {
    return [];
  }
}

/**
 * Cumulative RETROSPECTIVE W-L, not original picks. Existing outcomes are never
 * overwritten after the model is edited, so today's refresh can't rewrite
 * yesterday's saved replay. No records are created for live, missing-data or
 * genuine pre-match-saved matches.
 */
export function snapshotHistoricalReplayRecords(
  reviews: readonly RecentGameReview[], evaluatedAt = new Date().toISOString(),
): HistoricalReplayRecord[] {
  const existing = readHistoricalReplayRecords();
  if (typeof window === "undefined") return existing;
  const known = new Set(existing.map((record) => record.id));
  const additions: HistoricalReplayRecord[] = [];
  for (const review of reviews) {
    if (review.review !== "replay" || review.status !== "final" ||
        (review.verdict !== "won" && review.verdict !== "lost") ||
        !review.market || !review.modelVersion || review.probability === null ||
        !Number.isFinite(review.probability) ||
        !/^\d+–\d+$/.test(review.score) || !Number.isFinite(Date.parse(review.kickoff))) continue;
    const id = review.leagueId + ":" + review.fixtureId;
    if (known.has(id)) continue;
    known.add(id);
    additions.push({
      id, fixtureId: review.fixtureId, leagueId: review.leagueId,
      fixtureLabel: review.fixtureLabel, league: review.league,
      kickoff: review.kickoff, evaluatedAt, market: review.market,
      modelProbability: review.probability,
      modelVersion: review.modelVersion, finalScore: review.score,
      status: review.verdict, source: "retrospective",
    });
  }
  if (!additions.length) return existing;
  const updated = [...additions, ...existing];
  try {
    localStorage.setItem(KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event(EVENT));
    return updated;
  } catch {
    return existing;
  }
}

export const HISTORICAL_REPLAY_CHANGE_EVENT = EVENT;
