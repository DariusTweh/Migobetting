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
import {
  historicalReplayStats, readHistoricalReplayRecords, snapshotHistoricalReplayRecords,
  HISTORICAL_REPLAY_CHANGE_EVENT, type HistoricalReplayRecord,
} from "@/lib/historical-replay-record";

type Mode = "all" | "recorded" | "replay";
const recordType = (item: RecentGameReview) => {
  if (item.review === "strongest") return "SAVED STRONGEST";
  if (item.review === "forward") return "SAVED 1X2 · NOT STRONGEST";
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
  const [replayLedger, setReplayLedger] = useState<HistoricalReplayRecord[]>([]);
  useEffect(() => {
    const load = () => setReplayLedger(readHistoricalReplayRecords());
    load();
    window.addEventListener(HISTORICAL_REPLAY_CHANGE_EVENT, load);
    return () => window.removeEventListener(HISTORICAL_REPLAY_CHANGE_EVENT, load);
  }, []);

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
  useEffect(() => {
    if (historyReady) snapshotHistoricalReplayRecords(reviews);
  }, [historyReady, reviews]);
  const stats = useMemo(() => historicalReplayStats(replayLedger), [replayLedger]);
  const currentReplayStats = useMemo(() => historicalReplayStats(replayLedger.filter((item) =>
    recentPacificDays().includes(pacificDayKey(item.kickoff)))), [replayLedger]);
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
  const strongestSaved = reviews.filter((item) => item.review === "strongest");
  const outcomes1X2 = reviews.flatMap((item) =>
    item.review === "forward" ? [{ verdict: item.verdict }] :
    item.additional1X2 ? [{ verdict: item.additional1X2.verdict }] : []);
  const replayed = reviews.filter((item) => item.review === "replay");
  const strongestWins = strongestSaved.filter((item) => item.verdict === "won").length;
  const outcomes1X2Wins = outcomes1X2.filter((item) => item.verdict === "won").length;

  return <Panel>
    <PanelHead title="Last 3 Days · Match Review"
      meta="Today, yesterday & the day before · Pacific time"
      action={<button className="button" disabled={loading} onClick={() => void refreshRecent()}>
        <RefreshCw size={14} className={loading ? "spin" : ""}/>
        {loading ? "Checking…" : "Refresh"}
      </button>} />
    <div className="recent-review-summary">
      <div><small>Finished games</small><strong>{reviews.filter((item) => item.status === "final").length}</strong></div>
      <div><small>Strongest W–L</small><strong>{strongestWins}–{strongestSaved.length - strongestWins}</strong></div>
      <div><small>Separate 1X2 W–L</small><strong>{outcomes1X2Wins}–{outcomes1X2.length - outcomes1X2Wins}</strong></div>
      <div><small>Historical replays</small><strong>{replayed.length}</strong></div>
    </div>
    <section className="historical-replay-scorecard" aria-label="Cumulative historical replay record">
      <div className="historical-replay-title">
        <strong>Historical Replay W–L</strong><span>Cumulative · retrospective only</span>
      </div>
      <div className="recent-review-summary historical-replay-metrics">
        <div><small>Wins</small><strong>{stats.wins}</strong></div>
        <div><small>Losses</small><strong>{stats.losses}</strong></div>
        <div><small>Hit rate</small><strong>{stats.hitRate === null ? "—" : (stats.hitRate * 100).toFixed(1) + "%"}</strong></div>
        <div><small>Last 3 days</small><strong>{currentReplayStats.wins}–{currentReplayStats.losses}</strong></div>
      </div>
      <details className="historical-replay-history">
        <summary>View {stats.graded} saved replay results</summary>
        {stats.graded ? <div className="historical-replay-rows">
          {replayLedger.slice().sort((a, b) => b.kickoff.localeCompare(a.kickoff)).map((record) => (
            <div className="recent-review-item" key={record.id}>
              <div className="recent-review-primary">
                <strong>{record.fixtureLabel}</strong>
                <small>{record.league} · {new Date(record.kickoff).toLocaleDateString()} · HISTORICAL REPLAY</small>
                <span>{record.market} · {(record.modelProbability * 100).toFixed(1)}% model</span>
              </div>
              <div className="recent-review-result">
                <strong>{record.finalScore}</strong>
                <span className={"badge " + (record.status === "won" ? "badge-good" : "badge-insufficient")}>
                  {record.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div> : <p className="recent-review-help">No qualified retrospective picks recorded yet.</p>}
      </details>
    </section>
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
          {item.additional1X2 ? <div className="recent-review-secondary">
            <small>ALSO SAVED · 1X2 OUTCOME ONLY (SEPARATE MODEL TEST)</small>
            <span>{item.additional1X2.market} · {(item.additional1X2.probability * 100).toFixed(1)}% model</span>
            <b className={item.additional1X2.verdict === "won" ? "secondary-won" : "secondary-lost"}>
              {item.additional1X2.verdict.toUpperCase()}
            </b>
          </div> : null}
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
      SAVED STRONGEST tracks the actual selected market, including goal totals.
      SAVED 1X2 is a <strong>separate</strong> home/draw/away prediction and must never replace or be counted as a strongest-market pick.
      REPLAY means a retrospective test, not a pre-match saved pick. Each record uses its own W–L totals.
    </p>
  </Panel>;
}
