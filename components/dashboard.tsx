"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AutoParlayCards } from "./auto-parlay-cards";
import { DateStrip, type MatchView } from "./date-strip";
import { FixtureCard } from "./fixture-card";
import { Notice } from "./ui";
import { LEAGUES } from "@/lib/leagues";
import { formatDayLabel, localDateKey, todayKey } from "@/lib/date-time";
import { useLocalMatchHistoryStatus } from "@/lib/use-local-history";
import type { Fixture } from "@/lib/types";
import { applyFinalResults, readForwardPredictions, snapshotUpcomingFixtures } from "@/lib/forward-store";
import { useOddsFeed } from "@/lib/use-odds-feed";
import { strongestModelPick, type StrongestPick } from "@/lib/strongest-pick";
import { readStrongestPicks, snapshotStrongestPicks, type StrongestPickRecord } from "@/lib/strongest-record";
import type { MarketQuote } from "@/lib/market-odds";

type Data = { fixtures: Fixture[]; errors: string[]; fetchedAt: string };
const EMPTY_QUOTES: MarketQuote[] = [];
const COUNTRY: Record<string, string> = { "eng.1": "England", "esp.1": "Spain", "ger.1": "Germany", "ita.1": "Italy", "fra.1": "France", "usa.1": "United States", "uefa.champions": "Europe", "uefa.wchampions": "Europe" };

export function Dashboard({ initialData }: { initialData: Data }) {
  const [data, setData] = useState(initialData);
  const { matches: history, ready: historyReady, syncing: historySyncing, error: historyError } = useLocalMatchHistoryStatus();
  const [league, setLeague] = useState("all");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [view, setView] = useState<MatchView>("date");
  const [loading, setLoading] = useState(false);
  const { feed: oddsFeed, loading: oddsLoading } = useOddsFeed();
  const quotes = oddsFeed?.quotes ?? EMPTY_QUOTES;
  const [lockedStrongest, setLockedStrongest] = useState<StrongestPickRecord[]>([]);
  useEffect(() => {
    const sync = () => setLockedStrongest(readStrongestPicks());
    sync();
    window.addEventListener("migo:strongest", sync);
    return () => window.removeEventListener("migo:strongest", sync);
  }, []);

  // The match rows and the saved strongest-pick ledger use ONE selector.
  // Wait for historical scores and quotes before locking a market, so a cheap
  // preliminary display cannot silently overwrite the eventual priced pick.
  const fixturePicks = useMemo(() => {
    const picks = new Map<string, StrongestPick>();
    if (!historyReady || oddsLoading) return picks;
    const now = Date.now();
    for (const fixture of data.fixtures) {
      if (fixture.status !== "scheduled" || Date.parse(fixture.kickoff) <= now) continue;
      const pick = strongestModelPick([fixture], quotes, history, now, Number.POSITIVE_INFINITY);
      if (pick) picks.set(fixture.leagueId + ":" + fixture.id, pick);
    }
    return picks;
  }, [data.fixtures, history, historyReady, quotes, oddsLoading]);

  useEffect(() => {
    if (!historyReady || oddsLoading || !fixturePicks.size) return;
    snapshotStrongestPicks(data.fixtures.flatMap((fixture) => {
      const pick = fixturePicks.get(fixture.leagueId + ":" + fixture.id);
      return pick ? [{ fixture, pick, source: "command-center" as const }] : [];
    }));
  }, [fixturePicks, data.fixtures, historyReady, oddsLoading]);

  const lockedByFixture = useMemo(() =>
    new Map(lockedStrongest.map((item) => [item.leagueId + ":" + item.fixtureId, item])),
    [lockedStrongest]);
  const filtered = useMemo(() => data.fixtures.filter((fixture) =>
    (league === "all" || fixture.leagueId === league) &&
    (view === "all" || (view === "live" ? fixture.status === "live" : localDateKey(fixture.kickoff) === selectedDate))
  ), [data.fixtures, league, selectedDate, view]);
  const days = useMemo(() => {
    const byDay = new Map<string, Fixture[]>();
    for (const fixture of filtered) {
      const key = localDateKey(fixture.kickoff);
      byDay.set(key, [...(byDay.get(key) ?? []), fixture]);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  useEffect(() => {
    if (!historyReady) return;
    snapshotUpcomingFixtures(data.fixtures, history);
    const due = readForwardPredictions().filter((item) => item.status === "open" && Date.parse(item.kickoff) < Date.now()).slice(0, 50);
    if (!due.length) return;
    fetch("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: due.map((item) => ({ fixtureId: item.fixtureId, leagueId: item.leagueId })) }) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Result check failed")))
      .then((payload: { results: Parameters<typeof applyFinalResults>[0] }) => applyFinalResults(payload.results)).catch(() => undefined);
  }, [data.fixtures, history, historyReady]);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/fixtures", { cache: "no-store" });
      if (!response.ok) throw new Error("Refresh failed");
      setData(await response.json());
    } finally { setLoading(false); }
  }

  return <div className="sports-home">
    <header className="home-heading"><div><span>Match center</span><h1>Today&apos;s football</h1></div><button className="icon-button refresh-button" onClick={refresh} disabled={loading} aria-label="Refresh fixtures"><RefreshCw size={18} className={loading ? "spin" : ""}/></button></header>
    <DateStrip fixtures={data.fixtures} selectedDate={selectedDate} mode={view} onDate={setSelectedDate} onMode={setView}/>
    <div className="league-tabs" role="tablist" aria-label="Filter by league">
      <button className={league === "all" ? "active" : ""} onClick={() => setLeague("all")}>All leagues</button>
      {LEAGUES.map((item) => <button key={item.id} className={league === item.id ? "active" : ""} onClick={() => setLeague(item.id)}>{item.short}</button>)}
    </div>
    {data.errors.length ? <Notice>Some competitions could not refresh. Available matches are still shown.</Notice> : null}
    {historyError && !historySyncing ? <Notice>Historical model data is partially cached; fixture scores remain live.</Notice> : null}
    <AutoParlayCards fixtures={data.fixtures}/>
    <section id="matches" className="match-browser" aria-live="polite">
      <div className="match-browser-heading"><div><span>{view === "live" ? "Live now" : view === "all" ? "Schedule" : formatDayLabel(selectedDate)}</span><strong>{filtered.length} {filtered.length === 1 ? "match" : "matches"}</strong></div><small>{historyReady ? "Model ready" : "Loading model history"} · ESPN updated {new Date(data.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></div>
      {loading ? <div className="match-skeletons">{Array.from({ length: 6 }, (_, index) => <div className="match-skeleton" key={index}/>)}</div> : days.length ? days.map(([day, fixtures]) => <DayGroup key={day} day={day} fixtures={fixtures} strongestPicks={fixturePicks} lockedPicks={lockedByFixture} picksReady={historyReady && !oddsLoading} showDay={view !== "date"}/>) : <div className="empty-state compact"><strong>No matches here</strong>{view === "live" ? "There are no live matches in the selected competitions." : "Choose another date or league."}</div>}
    </section>
  </div>;
}

function DayGroup({ day, fixtures, strongestPicks, lockedPicks, picksReady, showDay }: {
  day: string;
  fixtures: Fixture[];
  strongestPicks: Map<string, StrongestPick>;
  lockedPicks: Map<string, StrongestPickRecord>;
  picksReady: boolean;
  showDay: boolean;
}) {
  const groups = [...fixtures.reduce((map, fixture) => {
    map.set(fixture.leagueId, [...(map.get(fixture.leagueId) ?? []), fixture]);
    return map;
  }, new Map<string, Fixture[]>()).entries()];
  return <div className="match-day-group">
    {showDay ? <h2>{formatDayLabel(day)}<span>{fixtures.length} matches</span></h2> : null}
    {groups.map(([leagueId, events]) => <details className="league-section" open key={leagueId}>
      <summary><span className="league-emblem">{events[0].league.slice(0, 1)}</span><span><strong>{events[0].league}</strong><small>{COUNTRY[leagueId] ?? "International"}</small></span><b>{events.length}</b></summary>
      <div>{events.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture}
            strongest={lockedPicks.get(fixture.leagueId + ":" + fixture.id) ??
              strongestPicks.get(fixture.leagueId + ":" + fixture.id) ?? null}
            picksReady={picksReady} />)}</div>
    </details>)}
  </div>;
}
