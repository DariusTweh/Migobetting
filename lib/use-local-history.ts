"use client";

import { useEffect, useState } from "react";
import { getHistoricalMatches, importHistoricalMatches } from "./history-store";
import { parseHistoricalCsv, type HistoricalMatch } from "./history";
import { ESPN_HISTORY_COMPETITIONS, type EspnHistoryLeague } from "./espn-history";

const CORE = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1"];
const MIN_MATCHES_PER_LEAGUE = 40;
const CORE_SYNC_KEY = "migo:core-history-updated:v3"; // refresh once for corrected missing-HT parsing
const CORE_SYNC_MAX_AGE_MS = 12 * 3600000;
const currentSeason = () => {
  const now = new Date();
  const year = now.getUTCMonth() < 7 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  return year + "-" + String((year + 1) % 100).padStart(2, "0");
};
function shouldRefreshCore(matches: HistoricalMatch[]): boolean {
  if (!hasCoreHistory(matches)) return true;
  // Old 2023–26 data alone does not train November 2026 fixtures properly.
  const season = currentSeason();
  if (CORE.some((league) => matches.filter((match) => match.competition === league && match.season === season).length < 8)) return true;
  try {
    const last = Number(window.localStorage.getItem(CORE_SYNC_KEY) ?? 0);
    return !Number.isFinite(last) || Date.now() - last > CORE_SYNC_MAX_AGE_MS;
  } catch { return true; }
}
let initialLoad: Promise<HistoricalMatch[]> | null = null;
let initialError = "";

function hasCoreHistory(matches: HistoricalMatch[]): boolean {
  return CORE.every((competition) => matches.filter((match) => match.competition === competition).length >= MIN_MATCHES_PER_LEAGUE);
}

/**
 * Shared once-per-session bootstrap: dashboard, fixtures and simulations should
 * not silently use the same hardcoded W-D-L goal means just because Backtesting
 * Lab has never been visited. Only genuine completed matches are imported.
 */
async function loadAvailableHistory(): Promise<HistoricalMatch[]> {
  let saved = await getHistoricalMatches();
  const warnings: string[] = [];
  if (shouldRefreshCore(saved)) {
    try {
      const response = await fetch("/api/historical?bundle=core");
      if (!response.ok) throw new Error("Historical score provider HTTP " + response.status);
      const bundle = await response.json() as {
        datasets?: Array<{ csv: string; season: string; url: string }>;
        errors?: string[];
      };
      if (!Array.isArray(bundle.datasets) || !bundle.datasets.length) throw new Error("No completed domestic-league history returned");
      const parsed = bundle.datasets.flatMap((dataset) =>
        parseHistoricalCsv(dataset.csv, { season: dataset.season, source: dataset.url }).matches);
      if (!parsed.length) throw new Error("No valid completed domestic-league scorelines returned");
      await importHistoricalMatches(parsed);
      try { window.localStorage.setItem(CORE_SYNC_KEY, String(Date.now())); } catch { /* IndexedDB remains authoritative */ }
      warnings.push(...(bundle.errors ?? []).slice(0, 2));
      saved = await getHistoricalMatches();
    } catch (reason) {
      warnings.push(reason instanceof Error ? reason.message : "Could not import domestic-league history");
    }
  }

  // MLS and the women's Champions League have materially different scoring
  // environments, and must NOT be estimated from generic men's W-D-L averages.
  // Only completed real ESPN events are imported; no invented results.
  const years = [new Date().getUTCFullYear() - 1, new Date().getUTCFullYear()];
  for (const [id, competition] of Object.entries(ESPN_HISTORY_COMPETITIONS) as Array<[EspnHistoryLeague, string]>) {
    // Men's UEFA halftime is fetched on demand alongside club domestic form.
    // Avoid 24 additional ESPN month requests on every app startup.
    if (id === "uefa.champions") continue;
    const count = saved.filter((match) => match.competition === competition).length;
    if (count >= 40) continue;
    const settled = await Promise.allSettled(years.map(async (year) => {
      const response = await fetch("/api/historical/espn?league=" + encodeURIComponent(id) + "&year=" + year);
      if (!response.ok) throw new Error(competition + " " + year + ": provider HTTP " + response.status);
      const payload = await response.json() as { matches?: HistoricalMatch[] };
      return payload.matches ?? [];
    }));
    const completed = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (completed.length) {
      await importHistoricalMatches(completed);
      saved = await getHistoricalMatches();
    } else {
      warnings.push(competition + ": verified recent historical scores unavailable");
    }
  }
  initialError = warnings.join(" · ");
  window.dispatchEvent(new Event("migo:history"));
  return saved;
}

export function useLocalMatchHistory() {
  return useLocalMatchHistoryStatus().matches;
}

export function useLocalMatchHistoryStatus() {
  const [matches, setMatches] = useState<HistoricalMatch[]>([]);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    // Display existing records immediately even while fetching missing leagues.
    void getHistoricalMatches().then((saved) => { if (alive) setMatches(saved); }).catch(() => undefined);
    if (!initialLoad) {
      initialLoad = loadAvailableHistory().catch(async (cause) => {
        initialError = cause instanceof Error ? cause.message : "Historical sync failed";
        return getHistoricalMatches().catch(() => []);
      });
    }
    void initialLoad.then((saved) => {
      if (alive) {
        setMatches(saved);
        setError(initialError);
        setReady(true);
        setSyncing(false);
      }
    });
    const reload = () => {
      void getHistoricalMatches().then((saved) => { if (alive) setMatches(saved); }).catch(() => undefined);
    };
    window.addEventListener("migo:history", reload);
    return () => { alive = false; window.removeEventListener("migo:history", reload); };
  }, []);
  return { matches, ready, syncing, error };
}
