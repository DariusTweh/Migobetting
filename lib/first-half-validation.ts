import type { HistoricalMatch } from "./history";
import type { Fixture } from "./types";
import { estimateFirstHalf, type FirstHalfMarketKey } from "./first-half-model";

export const FIRST_HALF_VALIDATION_MARKETS = [
  { key: "first-half-over-0.5", label: "1H Over 0.5" },
  { key: "first-half-over-1.5", label: "1H Over 1.5" },
  { key: "home-first-half-goal", label: "Home 1H goal" },
  { key: "away-first-half-goal", label: "Away 1H goal" },
  { key: "half-time-draw", label: "HT draw" },
] as const;

export type FirstHalfValidationSample = {
  matchId: string; season: string; date: string; home: string; away: string;
  market: FirstHalfMarketKey; probability: number; observed: boolean;
};
export type FirstHalfValidationMetric = {
  market: FirstHalfMarketKey;
  label: string;
  evaluated: number;
  predictedRate: number | null;
  observedRate: number | null;
  brier: number | null;
  logLoss: number | null;
  passesAt68: number;
  hitsAt68: number;
};
export type FirstHalfSeasonValidation = {
  season: string; candidates: number; scored: number;
  metrics: FirstHalfValidationMetric[];
};
export type FirstHalfValidationReport = {
  competition: string;
  modelVersion: "migo-first-half-cross-league-v2";
  candidates: number; scored: number;
  dateRange: { from: string; to: string } | null;
  perSeason: FirstHalfSeasonValidation[];
  /** Each forecast was generated using only prior games, suitable for chronological calibration. */
  samples: FirstHalfValidationSample[];
  metrics: FirstHalfValidationMetric[];
  calibration: Record<"first-half-over-0.5" | "first-half-over-1.5",
    Array<{ band: string; count: number; predicted: number; observed: number }>>;
};

const validHT = (m: HistoricalMatch): boolean =>
  Number.isInteger(m.halfTimeHomeGoals) && Number.isInteger(m.halfTimeAwayGoals) &&
  m.halfTimeHomeGoals! >= 0 && m.halfTimeAwayGoals! >= 0 &&
  m.halfTimeHomeGoals! <= m.homeGoals && m.halfTimeAwayGoals! <= m.awayGoals;

const sampleMetric = (
  samples: FirstHalfValidationSample[], market: FirstHalfMarketKey, label: string,
): FirstHalfValidationMetric => {
  const rows = samples.filter((s) => s.market === market);
  const n = rows.length;
  const confident = rows.filter((s) => s.probability >= 0.68);
  return {
    market, label, evaluated: n,
    predictedRate: n ? rows.reduce((sum, s) => sum + s.probability, 0) / n : null,
    observedRate: n ? rows.filter((s) => s.observed).length / n : null,
    brier: n ? rows.reduce((sum, s) => sum + (s.probability - Number(s.observed)) ** 2, 0) / n : null,
    logLoss: n ? rows.reduce((sum, s) => {
      const p = Math.max(.000001, Math.min(.999999, s.probability));
      return sum - (s.observed ? Math.log(p) : Math.log(1 - p));
    }, 0) / n : null,
    passesAt68: confident.length, hitsAt68: confident.filter((s) => s.observed).length,
  };
};

function calibration(samples: FirstHalfValidationSample[], market: FirstHalfMarketKey) {
  const filtered = samples.filter((item) => item.market === market);
  return Array.from({ length: 5 }, (_, n) => {
    const band = filtered.filter((item) => item.probability >= n * .2 &&
      (n === 4 ? item.probability <= 1 : item.probability < (n + 1) * .2));
    return {
      band: (n * 20) + "–" + ((n + 1) * 20) + "%",
      count: band.length,
      predicted: band.length ? band.reduce((s, item) => s + item.probability, 0) / band.length : 0,
      observed: band.length ? band.filter((item) => item.observed).length / band.length : 0,
    };
  });
}

/**
 * Test first-half forecasts on genuine later matches, with all model inputs
 * strictly preceding each target UTC match day. Full-time scores are never
 * used to infer missing halftime values. This is a retrospective walk-forward
 * evaluation: it does not establish forward-logged profitability or price value.
 */
export function validateFirstHalfMultiSeason(
  history: HistoricalMatch[], competition: string, maxPerSeason = 300,
): FirstHalfValidationReport {
  const rows = [...new Map(history.filter((m) => m.competition === competition && validHT(m))
    .map((m) => [m.id, m])).values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const seasonMap = new Map<string, HistoricalMatch[]>();
  for (const row of rows) {
    if (!seasonMap.has(row.season)) seasonMap.set(row.season, []);
    seasonMap.get(row.season)!.push(row);
  }
  const keys = FIRST_HALF_VALIDATION_MARKETS;
  const allSamples: FirstHalfValidationSample[] = [];
  const cap = Math.max(25, Math.min(500, Math.floor(maxPerSeason)));
  const perSeason: FirstHalfSeasonValidation[] = [...seasonMap].map(([season, matches]) => {
    const targets = matches.slice(-cap);
    const samples: FirstHalfValidationSample[] = [];
    let scored = 0;
    for (const match of targets) {
      const fixture: Fixture = {
        id: match.id, leagueId: competition === "Champions League" ? "uefa.champions" :
          competition === "Europa League" ? "uefa.europa" :
          competition === "UEFA Conference League" ? "uefa.europa.conf" :
          competition === "UEFA Women's Champions League" ? "uefa.wchampions" : "eng.1",
        league: competition, kickoff: match.date,
        status: "scheduled", statusLabel: "Historical", source: "ESPN",
        sourceUpdatedAt: match.date,
        home: { id: "home", name: match.homeTeam, shortName: match.homeTeam, abbreviation: "H" },
        away: { id: "away", name: match.awayTeam, shortName: match.awayTeam, abbreviation: "A" },
      };
      // Evaluate the target competition, but let the model train on all
      // earlier eligible domestic/European club results for UEFA fixtures.
      const forecast = estimateFirstHalf(history, fixture);
      if (!forecast) continue;
      scored++;
      const h = match.halfTimeHomeGoals!, a = match.halfTimeAwayGoals!;
      const outcomes: Record<FirstHalfMarketKey, boolean> = {
        "first-half-over-0.5": h + a >= 1,
        "first-half-over-1.5": h + a >= 2,
        "home-first-half-goal": h > 0,
        "away-first-half-goal": a > 0,
        "half-time-draw": h === a,
      };
      for (const market of forecast.markets) {
        samples.push({ matchId: match.id, date: match.date, season,
          home: match.homeTeam, away: match.awayTeam,
          market: market.key, probability: market.probability, observed: outcomes[market.key] });
      }
    }
    allSamples.push(...samples);
    return { season, candidates: targets.length, scored,
      metrics: keys.map((k) => sampleMetric(samples, k.key, k.label)) };
  });
  const reviewed = [...new Set(allSamples.map((sample) => sample.matchId))];
  const uniqueMatches = rows.filter((m) => reviewed.includes(m.id));
  return {
    competition, modelVersion: "migo-first-half-cross-league-v2",
    candidates: perSeason.reduce((sum, s) => sum + s.candidates, 0),
    scored: reviewed.length,
    dateRange: uniqueMatches.length ? {
      from: uniqueMatches[0].date, to: uniqueMatches[uniqueMatches.length - 1].date,
    } : null,
    perSeason, samples: allSamples,
    metrics: keys.map((k) => sampleMetric(allSamples, k.key, k.label)),
    calibration: {
      "first-half-over-0.5": calibration(allSamples, "first-half-over-0.5"),
      "first-half-over-1.5": calibration(allSamples, "first-half-over-1.5"),
    },
  };
}
