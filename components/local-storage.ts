"use client";

import type { PaperBet } from "@/lib/types";

const BET_KEY = "migo:paper-bets:v1";
const BANKROLL_KEY = "migo:bankroll:v1";

export function getPaperBets(): PaperBet[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(BET_KEY) ?? "[]") as PaperBet[]; } catch { return []; }
}

export function savePaperBet(bet: PaperBet) {
  const bets = getPaperBets();
  localStorage.setItem(BET_KEY, JSON.stringify([bet, ...bets]));
  window.dispatchEvent(new Event("migo:storage"));
}

export function getBankroll(): number {
  if (typeof window === "undefined") return 1000;
  const value = Number(localStorage.getItem(BANKROLL_KEY));
  return Number.isFinite(value) && value > 0 ? value : 1000;
}

export function setBankroll(value: number) {
  localStorage.setItem(BANKROLL_KEY, String(value));
  window.dispatchEvent(new Event("migo:storage"));
}

export function resetLocalData() {
  [BET_KEY, BANKROLL_KEY, "migo:leagues:v1", "migo:confidence:v1", "migo:paper-parlays:v1", "migo:forward-predictions:v1", "migo:strongest-picks:v1", "migo:historical-replay-record:v1"].forEach((key) => localStorage.removeItem(key));
  window.dispatchEvent(new Event("migo:storage"));
}
