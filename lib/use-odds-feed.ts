"use client";

import { useCallback, useEffect, useState } from "react";
import type { OddsFeed } from "./market-odds";

let last: { at: number; feed: OddsFeed } | null = null;
let pending: Promise<OddsFeed> | null = null;
const CACHE_MS = 3 * 60 * 1000;

async function loadOdds(force = false): Promise<OddsFeed> {
  if (!force && last && Date.now() - last.at < CACHE_MS) return last.feed;
  if (pending) return pending;
  pending = fetch("/api/odds", { cache: "no-store" }).then(async (res) => {
    if (!res.ok) throw new Error("Odds endpoint returned HTTP " + res.status);
    const feed = await res.json() as OddsFeed;
    if (!Array.isArray(feed.quotes)) throw new Error("Unexpected odds response");
    last = { at: Date.now(), feed };
    return feed;
  }).finally(() => { pending = null; });
  return pending;
}

export function useOddsFeed(enabled = true) {
  const [feed, setFeed] = useState<OddsFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async (force = false) => {
    setLoading(true); setError("");
    try { setFeed(await loadOdds(force)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load odds"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (enabled) void refresh();
    else setLoading(false);
  }, [enabled, refresh]);
  return { feed, loading, error, refresh };
}
