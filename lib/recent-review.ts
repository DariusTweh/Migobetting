import type { Fixture } from "./types";
import type { HistoricalMatch } from "./history";
import type { ForwardPrediction } from "./forward-store";
import type { StrongestPickRecord } from "./strongest-record";
import { forecastWithHistory } from "./historical-forecast";
import { strongestUnpricedMarket } from "./strongest-pick";
import { strongestMarketWins } from "./strongest-record";
import type { MarketKey } from "./market-odds";

const TIME_ZONE = "America/Los_Angeles";
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

export function pacificDayKey(when: string | number | Date): string {
  const date = new Date(when);
  if (Number.isNaN(date.getTime())) return "";
  const parts = formatter.formatToParts(date);
  const get = (part: string) => parts.find((entry) => entry.type === part)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

/** Exactly the current and two previous calendar days in America/Los_Angeles. */
export function recentPacificDays(now = Date.now()): string[] {
  const today = pacificDayKey(now);
  const [year, month, day] = today.split("-").map(Number);
  if (!year || !month || !day) return [];
  // 20:00 UTC is always in the target US Pacific calendar day, including DST.
  return Array.from({ length: 3 }, (_, offset) =>
    pacificDayKey(Date.UTC(year, month - 1, day - offset, 20, 0, 0)));
}

export function recentGames(fixtures: Fixture[], now = Date.now()): Fixture[] {
  const days = new Set(recentPacificDays(now));
  return fixtures.filter((fixture) =>
    days.has(pacificDayKey(fixture.kickoff)) &&
    Date.parse(fixture.kickoff) <= now &&
    (fixture.status === "final" || fixture.status === "live"),
  ).sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
}

export function validPreKickoffSnapshot(lockedAt: string, kickoff: string): boolean {
  const saved = Date.parse(lockedAt);
  const start = Date.parse(kickoff);
  return Number.isFinite(saved) && Number.isFinite(start) && saved < start;
}

/** Choose earliest genuine pre-match snapshot if multiple model versions exist. */
export function earliestForwardByFixture(items: ForwardPrediction[]): Map<string, ForwardPrediction> {
  const result = new Map<string, ForwardPrediction>();
  for (const prediction of [...items].sort((a, b) => a.lockedAt.localeCompare(b.lockedAt))) {
    if (!validPreKickoffSnapshot(prediction.lockedAt, prediction.kickoff)) continue;
    const key = prediction.leagueId + ":" + prediction.fixtureId;
    if (!result.has(key)) result.set(key, prediction);
  }
  return result;
}

export type RecentGameReview = {
  fixtureId: string;
  fixtureLabel: string;
  league: string;
  kickoff: string;
  status: "final" | "live";
  score: string;
  review: "strongest" | "forward" | "replay" | "unavailable" | "live";
  market: string | null;
  probability: number | null;
  verdict: "won" | "lost" | "pending" | "not-scored";
  modelVersion: string | null;
};

/**
 * Recorded picks have priority, followed by existing pre-kickoff forward forecasts.
 * Unrecorded completed matches MAY be reconstructed from only earlier historical
 * scores, but those replays never enter the actual strongest-pick win/loss ledger.
 */
export function buildRecentGameReviews(
  fixtures: Fixture[],
  history: HistoricalMatch[],
  strongest: StrongestPickRecord[],
  forward: ForwardPrediction[],
  now = Date.now(),
): RecentGameReview[] {
  const realStrongest = new Map(strongest
    .filter((p) => validPreKickoffSnapshot(p.lockedAt, p.kickoff))
    .map((p) => [p.leagueId + ":" + p.fixtureId, p]));
  const realForward = earliestForwardByFixture(forward);

  return recentGames(fixtures, now).map((fixture): RecentGameReview => {
    const key = fixture.leagueId + ":" + fixture.id;
    const score = Number.isInteger(fixture.home.score) && Number.isInteger(fixture.away.score)
      ? fixture.home.score + "–" + fixture.away.score : "—";
    const base = {
      fixtureId: fixture.id,
      fixtureLabel: fixture.home.shortName + " vs " + fixture.away.shortName,
      league: fixture.league,
      kickoff: fixture.kickoff,
      status: fixture.status as "live" | "final",
      score,
    };
    if (fixture.status !== "final" ||
      !Number.isInteger(fixture.home.score) || !Number.isInteger(fixture.away.score)) {
      return { ...base, review: "live", market: null, probability: null, verdict: "pending", modelVersion: null };
    }
    const home = fixture.home.score!;
    const away = fixture.away.score!;
    const strongestRecord = realStrongest.get(key);
    if (strongestRecord) {
      const correct = strongestMarketWins(strongestRecord.marketKey, home, away);
      return { ...base, review: "strongest", market: strongestRecord.market,
        probability: strongestRecord.probability,
        verdict: correct ? "won" : "lost", modelVersion: strongestRecord.modelVersion };
    }
    const forwardRecord = realForward.get(key);
    if (forwardRecord) {
      const actual = home > away ? "home" : home < away ? "away" : "draw";
      const market = forwardRecord.predictedOutcome === "home" ? fixture.home.shortName + " win" :
        forwardRecord.predictedOutcome === "away" ? fixture.away.shortName + " win" : "Draw";
      return { ...base, review: "forward", market, probability: forwardRecord.probabilities[forwardRecord.predictedOutcome],
        verdict: forwardRecord.predictedOutcome === actual ? "won" : "lost",
        modelVersion: forwardRecord.modelVersion };
    }
    // football-data.co.uk has date-only timestamps at 12:00 UTC. Use the
    // START of the UTC match day to exclude all same-day results from training.
    const dayStart = fixture.kickoff.slice(0, 10) + "T00:00:00.000Z";
    const noFinalRecord = {
      ...fixture, kickoff: dayStart,
      home: { ...fixture.home, record: undefined },
      away: { ...fixture.away, record: undefined },
    };
    const replay = forecastWithHistory(noFinalRecord, history);
    if (replay.modelVersion === "migo-baseline-0.1") {
      return { ...base, review: "unavailable", market: null, probability: null,
        verdict: "not-scored", modelVersion: null };
    }
    const market = strongestUnpricedMarket(replay);
    if (!market) {
      return { ...base, review: "unavailable", market: null, probability: null,
        verdict: "not-scored", modelVersion: replay.modelVersion };
    }
    return { ...base, review: "replay", market: market.label,
      probability: market.probability,
      verdict: strongestMarketWins(market.key as MarketKey, home, away) ? "won" : "lost",
      modelVersion: replay.modelVersion };
  });
}
