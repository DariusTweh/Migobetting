"use client";

import { forecastFixture } from "./model";
import type { Fixture, LeagueId } from "./types";

const KEY = "migo:forward-predictions:v1";

export type ForwardPrediction = {
  id: string;
  fixtureId: string;
  leagueId: LeagueId;
  fixtureLabel: string;
  kickoff: string;
  lockedAt: string;
  modelVersion: string;
  probabilities: { home: number; draw: number; away: number; over15: number; over25: number; btts: number };
  predictedOutcome: "home" | "draw" | "away";
  status: "open" | "graded";
  actual?: { homeGoals: number; awayGoals: number; outcome: "home" | "draw" | "away" };
  correct?: boolean;
  brier?: number;
};

export type FinalResult = { fixtureId: string; completed: boolean; homeGoals?: number; awayGoals?: number };

export function readForwardPredictions(): ForwardPrediction[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as ForwardPrediction[]; } catch { return []; }
}

function save(items: ForwardPrediction[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("migo:forward"));
}

export function snapshotUpcomingFixtures(fixtures: Fixture[], now = Date.now()) {
  const existing = readForwardPredictions();
  const ids = new Set(existing.map((item) => item.id));
  const additions = fixtures.flatMap((fixture): ForwardPrediction[] => {
    if (fixture.status !== "scheduled" || new Date(fixture.kickoff).getTime() <= now) return [];
    const forecast = forecastFixture(fixture);
    if (forecast.dataQuality === "insufficient") return [];
    const outcomes = [["home", forecast.homeWin], ["draw", forecast.draw], ["away", forecast.awayWin]] as const;
    const predictedOutcome = outcomes.reduce((best, item) => item[1] > best[1] ? item : best)[0];
    const id = `${fixture.id}:${forecast.modelVersion}`;
    if (ids.has(id)) return [];
    return [{ id, fixtureId: fixture.id, leagueId: fixture.leagueId, fixtureLabel: `${fixture.home.shortName} vs ${fixture.away.shortName}`, kickoff: fixture.kickoff, lockedAt: new Date(now).toISOString(), modelVersion: forecast.modelVersion, probabilities: { home: forecast.homeWin, draw: forecast.draw, away: forecast.awayWin, over15: forecast.markets.find((item) => item.key === "over-1.5")?.probability ?? 0, over25: forecast.markets.find((item) => item.key === "over-2.5")?.probability ?? 0, btts: forecast.markets.find((item) => item.key === "btts")?.probability ?? 0 }, predictedOutcome, status: "open" }];
  });
  if (additions.length) save([...existing, ...additions]);
  return additions.length;
}

export function gradePrediction(prediction: ForwardPrediction, result: FinalResult): ForwardPrediction {
  if (!result.completed || result.homeGoals === undefined || result.awayGoals === undefined) return prediction;
  const outcome = result.homeGoals > result.awayGoals ? "home" : result.homeGoals < result.awayGoals ? "away" : "draw";
  const actual = outcome === "home" ? [1, 0, 0] : outcome === "draw" ? [0, 1, 0] : [0, 0, 1];
  const probabilities = [prediction.probabilities.home, prediction.probabilities.draw, prediction.probabilities.away];
  const brier = probabilities.reduce((sum, probability, index) => sum + (probability - actual[index]) ** 2, 0) / 3;
  return { ...prediction, status: "graded", actual: { homeGoals: result.homeGoals, awayGoals: result.awayGoals, outcome }, correct: prediction.predictedOutcome === outcome, brier };
}

export function applyFinalResults(results: FinalResult[]) {
  const byId = new Map(results.map((result) => [result.fixtureId, result]));
  const current = readForwardPredictions();
  const graded = current.map((prediction) => {
    const result = byId.get(prediction.fixtureId);
    return result ? gradePrediction(prediction, result) : prediction;
  });
  if (graded.some((item, index) => item.status !== current[index].status)) save(graded);
  return graded;
}
