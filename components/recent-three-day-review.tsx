"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLocalMatchHistoryStatus } from "@/lib/use-local-history";
import {
  buildRecentGameReviews, pacificDayKey, recentPacificDays, type RecentGameReview,
} from "@/lib/recent-review";
import type { Fixture } from "@/lib/types";
import type { ForwardPrediction } from "@/lib/forward-store";
import type { StrongestPickRecord } from "@/lib/strongest-record";
import { Panel, PanelHead } from "./ui";

type Mode = "all" | "recorded" | "replay";
const recordType = (item: RecentGameReview) => {
  if (item.review === "strongest") return "SAVED STRONGEST";
  if (item.review === "forward") return "SAVED 1X2";
  if (item.review === "replay") return "HISTORICAL REPLAY";
  if (item.review === "live") return "LIVE";
  return "NO PAST FORECAST";
};

export function RecentThreeDayReview({
  strongest, forward,
}: {
  strongest: StrongestPickRecord[];
  forward: ForwardPrediction[];
}) {
  const { matches: history, ready: historyReady } = useLocalMatchHistoryStatus();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Mode>("all");

  async function refreshRecent() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/fixtures?recent=1", { cache: "no-store" });
      if (!response.ok) throw new Error("Recent ESPN fixtures unavailable (HTTP " + response.status + ")");
      const payload = await response.json() as { fixtures?: Fixture[]; errors?: string[] };
      if (!Array.isArray(payload.fixtures)) throw new Error("Recent match data was invalid");
      setFixtures(payload.fixtures);
      if (payload.errors?.length) setError("Some competitions could not be checked.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load recent fixtures");
    } finally { setLoading(false); }
  }
  useEffect(() => { void refreshRecent(); }, []);

  const reviews = useMemo(() =>
    buildRecentGameReviews(fixtures, history, strongest, forward),
    [fixtures, history, strongest, forward]);
  const displayed = reviews.filter((item) => filter === "all" ||
    (filter === "recorded" && (item.review === "strongest" || item.review === "forward")) ||
    (filter === "replay" && (item.review === "replay" || item.review === "unavailable")));
  const grouped = useMemo(() => {
    const map = new Map<string, RecentGameReview[]>();
    const days = recentPacificDays();
    for (const day of days) map.set(day, []);
    for (const item of displayed) {
      const day = pacificDayKey(item.kickoff);
      map.set(day, [...(map.get(day) ?? []), item]);
    }
    return [...map].filter(([, items]) => items.length);
  }, [displayed]);
  const saved = reviews.filter((item) => item.review === "strongest" || item.review === "forward");
  const replayed = reviews.filter((item) => item.review === "replay");
  const savedWins = saved.filter((item) => item.verdict === "won").length;

  return <Panel>
    <PanelHead title="Last 3 Days · Match Review"
      meta="Today, yesterday & the day before · Pacific time"
      action={<button className="button" disabled={loading} onClick={() => void refreshRecent()}>
        <RefreshCw size={14} className={loading ? "spin" : ""}/>
        {loading ? "Checking…" : "Refresh"}
      </button>} />
    <div className="recent-review-summary">
      <div><small>Finished games</small><strong>{reviews.filter((item) => item.status === "final").length}</strong></div>
      <div><small>Saved pre-match</small><strong>{saved.length}</strong></div>
      <div><small>Saved picks correct</small><strong>{saved.length ? savedWins + " / " + saved.length : "—"}</strong></div>
      <div><small>Historical replays</small><strong>{replayed.length}</strong></div>
    </div>
    <div className="lab-tabs recent-review-tabs">
      <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All games</button>
      <button className={filter === "recorded" ? "active" : ""} onClick={() => setFilter("recorded")}>Previously saved</button>
      <button className={filter === "replay" ? "active" : ""} onClick={() => setFilter("replay")}>Replays</button>
    </div>
    {error ? <p className="recent-review-error">{error}</p> : null}
    {!historyReady ? <p className="recent-review-help">Loading historical goal data for the optional retrospective analysis. Saved picks and real scores can still appear.</p> : null}
    {!loading && !displayed.length ? <div className="empty-state compact">
      <strong>{filter === "recorded" ? "No previous saved predictions found" : "No recent matches returned"}</strong>
      {filter === "recorded" ? "Older picks are only available if they were stored before kickoff in this browser." :
        "Try Refresh. The schedule provider may not return every match."}
    </div> : null}
    {grouped.map(([day, items]) => <div key={day} className="recent-review-day">
      <h3>{new Date(day + "T20:00:00Z").toLocaleDateString("en-US", {
        timeZone: "America/Los_Angeles", weekday: "long", month: "short", day: "numeric",
      })} <small>{items.length} games</small></h3>
      {items.map((item) => <div className="recent-review-item" key={item.fixtureId}>
        <div className="recent-review-primary">
          <strong>{item.fixtureLabel}</strong>
          <small>{item.league} · {recordType(item)}</small>
          {item.market ? <span>{item.market}{item.probability !== null ? " · " + (item.probability * 100).toFixed(1) + "% model" : ""}</span> :
            <span>{item.review === "unavailable" ? "No qualified historical replay" : "Match in progress"}</span>}
        </div>
        <div className="recent-review-result">
          <strong>{item.score}</strong>
          <span className={"badge " + (item.review === "replay" || item.review === "unavailable" ? "badge-limited" :
            item.verdict === "won" ? "badge-good" :
            item.verdict === "lost" ? "badge-insufficient" : "badge-limited")}>
            {item.review === "replay" ? "REPLAY " + item.verdict.toUpperCase() :
              item.verdict === "not-scored" ? "NO PICK" : item.verdict.toUpperCase()}
          </span>
        </div>
      </div>)}
    </div>)}
    <p className="recent-review-help">
      SAVED = a real pre-kickoff model snapshot in this browser. REPLAY = an after-the-fact model test
      trained on older results only, <strong>never counted as an originally made pick</strong>.
      Older predictions cannot be recovered if they were never saved. The W–L record above stays separate.
    </p>
  </Panel>;
}
