"use client";

import { useEffect, useState } from "react";
import type { OddsFeed } from "./market-odds";

export function useOddsFeed() {
  const [feed, setFeed] = useState<OddsFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/odds");
        if (!response.ok) throw new Error("Odds endpoint returned HTTP " + response.status);
        const data = await response.json() as OddsFeed;
        if (active) { setFeed(data); setError(""); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load current odds");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);
  return { feed, loading, error };
}
