"use client";

import { useEffect, useState } from "react";
import { getHistoricalMatches } from "./history-store";
import type { HistoricalMatch } from "./history";

export function useLocalMatchHistory() {
  return useLocalMatchHistoryStatus().matches;
}

export function useLocalMatchHistoryStatus() {
  const [history, setHistory] = useState<HistoricalMatch[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    getHistoricalMatches().then((matches) => { if (alive) setHistory(matches); })
      .catch(() => undefined).finally(() => { if (alive) setReady(true); });
    const reload = () => { getHistoricalMatches().then((matches) => { if (alive) setHistory(matches); }).catch(() => undefined); };
    window.addEventListener("migo:history", reload);
    return () => { alive = false; window.removeEventListener("migo:history", reload); };
  }, []);
  return { matches: history, ready };
}
