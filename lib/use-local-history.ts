"use client";

import { useEffect, useState } from "react";
import { getHistoricalMatches } from "./history-store";
import type { HistoricalMatch } from "./history";

export function useLocalMatchHistory() {
  const [history, setHistory] = useState<HistoricalMatch[]>([]);
  useEffect(() => {
    let alive = true;
    getHistoricalMatches().then((matches) => { if (alive) setHistory(matches); }).catch(() => undefined);
    const reload = () => { getHistoricalMatches().then((matches) => { if (alive) setHistory(matches); }).catch(() => undefined); };
    window.addEventListener("migo:history", reload);
    return () => { alive = false; window.removeEventListener("migo:history", reload); };
  }, []);
  return history;
}
