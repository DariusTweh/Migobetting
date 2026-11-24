"use client";

import { americanToDecimal } from "./odds";
import { marketWins } from "./parlay";
import { isCurrentDayCard } from "./daily-slate";
import type { PricedCard } from "./priced-cards";
import type { LeagueId } from "./types";

const KEY = "migo:paper-parlays:v1";

export type LockedParlayLeg = {
  fixtureId: string;
  fixtureLabel: string;
  leagueId: LeagueId;
  kickoff: string;
  market: string;
  americanOdds: number;
  bookmaker?: string;
  oddsSource?: string;
  quoteUpdatedAt?: string;
  result?: {
    status: "won" | "lost";
    homeGoals: number;
    awayGoals: number;
  };
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
  origin?: "manual" | "migo-auto";
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
  if ((input.kind === "daily-double" || input.kind === "banger") && !isCurrentDayCard(input.legs, now)) {
    throw new Error("Daily Double and Banger tickets only accept today's remaining matches (Pacific time). For another date, use a custom parlay.");
  }
  const decimalOdds = input.legs.reduce((acc, leg) => acc * americanToDecimal(leg.americanOdds), 1);
  return {
    id: crypto.randomUUID(), kind: input.kind, legs: input.legs.map((leg) => ({ ...leg })),
    lockedAt: new Date(now).toISOString(), stake: input.stake, decimalOdds, status: "open", origin: "manual",
  };
}

export function savePaperParlay(parlay: PaperParlay) {
  write([parlay, ...readPaperParlays()]);
}

function pacificCalendarKey(now: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(now));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

/** Locks at most one qualifying automatic ticket of each kind per local day. */
export function createAutoPaperParlay(card: PricedCard, now = Date.now(), stake = 10): PaperParlay | null {
  if (!card.legs.length || !Number.isFinite(stake) || stake <= 0 ||
    !isCurrentDayCard(card.legs, now)) return null;
  const legs: LockedParlayLeg[] = card.legs.map((leg) => ({
    fixtureId: leg.fixtureId,
    fixtureLabel: leg.fixtureLabel,
    leagueId: leg.leagueId,
    kickoff: leg.kickoff,
    market: leg.market,
    americanOdds: leg.americanOdds,
    bookmaker: leg.bookmaker,
    oddsSource: leg.source,
    quoteUpdatedAt: leg.updatedAt,
  }));
  return {
    id: `migo-auto:${card.kind}:${pacificCalendarKey(now)}`,
    kind: card.kind,
    lockedAt: new Date(now).toISOString(),
    legs,
    stake,
    decimalOdds: legs.reduce((product, leg) => product * americanToDecimal(leg.americanOdds), 1),
    status: "open",
    origin: "migo-auto",
  };
}

export function snapshotAutoPaperParlays(cards: PricedCard[], now = Date.now(), stake = 10): PaperParlay[] {
  const previous = readPaperParlays();
  const ids = new Set(previous.map((card) => card.id));
  const additions = cards.flatMap((card) => {
    const parlay = createAutoPaperParlay(card, now, stake);
    if (!parlay || ids.has(parlay.id)) return [];
    ids.add(parlay.id);
    return [parlay];
  });
  if (additions.length) write([...additions, ...previous]);
  return additions;
}

export function gradePaperParlay(parlay: PaperParlay, finals: MatchFinal[]): PaperParlay {
  if (parlay.status === "void") return parlay;
  const results = new Map(finals.map((result) => [result.fixtureId, result]));
  const legs = parlay.legs.map((leg) => {
    const result = results.get(leg.fixtureId);
    if (!result?.completed || result.homeGoals === undefined || result.awayGoals === undefined) {
      return leg;
    }
    return {
      ...leg,
      result: {
        status: marketWins(leg.market, result.homeGoals, result.awayGoals) ? "won" as const : "lost" as const,
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
      },
    };
  });
  if (legs.some((leg) => leg.result?.status === "lost")) {
    return { ...parlay, legs, status: "lost", payout: 0 };
  }
  if (legs.every((leg) => leg.result?.status === "won")) {
    return { ...parlay, legs, status: "won", payout: parlay.stake * parlay.decimalOdds };
  }
  return { ...parlay, legs };
}

export function applyPaperParlayResults(finals: MatchFinal[]): PaperParlay[] {
  const previous = readPaperParlays();
  const next = previous.map((parlay) => gradePaperParlay(parlay, finals));
  if (JSON.stringify(next) !== JSON.stringify(previous)) write(next);
  return next;
}
