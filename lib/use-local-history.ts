"use client";

import { useEffect, useState } from "react";
import { getHistoricalMatches, importHistoricalMatches } from "./history-store";
import { parseHistoricalCsv, type HistoricalMatch } from "./history";

const CORE = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1"];
const MIN_MATCHES_PER_LEAGUE = 40;
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
  const saved = await getHistoricalMatches();
  if (hasCoreHistory(saved)) return saved;
  const response = await fetch("/api/historical?bundle=core");
  if (!response.ok) throw new Error("Historical score provider unavailable (HTTP " + response.status + ")");
  const bundle = await response.json() as {
    datasets?: Array<{ csv: string; season: string; url: string }>;
    errors?: string[];
  };
  if (!Array.isArray(bundle.datasets) || bundle.datasets.length === 0) {
    throw new Error("No completed historical score datasets returned");
  }
  const parsed = bundle.datasets.flatMap((dataset) =>
    parseHistoricalCsv(dataset.csv, { season: dataset.season, source: dataset.url }).matches);
  if (parsed.length === 0) throw new Error("No valid completed historical scorelines returned");
  await importHistoricalMatches(parsed);
  const merged = await getHistoricalMatches();
  window.dispatchEvent(new Event("migo:history"));
  return merged;
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
