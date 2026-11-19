"use client";

import { americanToDecimal } from "./odds";
import { marketWins } from "./parlay";
import type { LeagueId } from "./types";

const KEY = "migo:paper-parlays:v1";

export type LockedParlayLeg = {
  fixtureId: string;
  fixtureLabel: string;
  leagueId: LeagueId;
  kickoff: string;
  market: string;
  americanOdds: number;
};
export type PaperParlay = {
  id: string;
  kind: "daily-double" | "banger" | "manual";
  lockedAt: string;
  legs: LockedParlayLeg[];
  stake: number;
  decimalOdds: number;
  status: "open" | "won" | "lost" | "void";
  payout?: number;
};
export type MatchFinal = { fixtureId: string; completed: boolean; homeGoals?: number; awayGoals?: number };

export function readPaperParlays(): PaperParlay[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(saved) ? saved as PaperParlay[] : [];
  } catch { return []; }
}

function write(items: PaperParlay[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("migo:storage"));
}

export function createPaperParlay(input: Pick<PaperParlay, "kind" | "legs" | "stake">, now = Date.now()): PaperParlay {
  if (!input.legs.length || !Number.isFinite(input.stake) || input.stake <= 0) throw new Error("Select priced legs and a positive stake");
  const ids = input.legs.map((leg) => leg.fixtureId);
  if (new Set(ids).size !== ids.length) throw new Error("Use only one selection per fixture in the initial parlay mode");
  if (input.legs.some((leg) => Date.parse(leg.kickoff) <= now || !Number.isFinite(leg.americanOdds) || leg.americanOdds === 0)) {
    throw new Error("Every leg must have a valid entered price and a future kickoff");
  }
  const decimalOdds = input.legs.reduce((acc, leg) => acc * americanToDecimal(leg.americanOdds), 1);
  return {
    id: crypto.randomUUID(), kind: input.kind, legs: input.legs.map((leg) => ({ ...leg })),
    lockedAt: new Date(now).toISOString(), stake: input.stake, decimalOdds, status: "open",
  };
}

export function savePaperParlay(parlay: PaperParlay) {
  write([parlay, ...readPaperParlays()]);
}

export function gradePaperParlay(parlay: PaperParlay, finals: MatchFinal[]): PaperParlay {
  if (parlay.status !== "open") return parlay;
  const results = new Map(finals.map((result) => [result.fixtureId, result]));
  let pending = false;
  for (const leg of parlay.legs) {
    const result = results.get(leg.fixtureId);
    if (!result?.completed || result.homeGoals === undefined || result.awayGoals === undefined) {
      pending = true;
      continue;
    }
    if (!marketWins(leg.market, result.homeGoals, result.awayGoals)) {
      return { ...parlay, status: "lost", payout: 0 };
    }
  }
  return pending ? parlay : { ...parlay, status: "won", payout: parlay.stake * parlay.decimalOdds };
}

export function applyPaperParlayResults(finals: MatchFinal[]): PaperParlay[] {
  const previous = readPaperParlays();
  const next = previous.map((parlay) => gradePaperParlay(parlay, finals));
  if (next.some((parlay, index) => parlay.status !== previous[index].status)) write(next);
  return next;
}
