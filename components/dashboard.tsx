"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Satellite } from "lucide-react";
import { AutoParlayCards } from "./auto-parlay-cards";
import { FixtureCard } from "./fixture-card";
import { Metric, Notice, PageHeader, Panel, PanelHead } from "./ui";
import { LEAGUES } from "@/lib/leagues";
import { forecastWithHistory } from "@/lib/historical-forecast";
import { useLocalMatchHistoryStatus } from "@/lib/use-local-history";
import type { Fixture } from "@/lib/types";
import { applyFinalResults, readForwardPredictions, snapshotUpcomingFixtures } from "@/lib/forward-store";

type Data = { fixtures: Fixture[]; errors: string[]; fetchedAt: string };

export function Dashboard({ initialData }: { initialData: Data }) {
  const [data, setData] = useState(initialData);
  const { matches: history, ready: historyReady, syncing: historySyncing, error: historyError } = useLocalMatchHistoryStatus();
  const [league, setLeague] = useState("all");
  const [loading, setLoading] = useState(false);
  const fixtures = useMemo(() => league === "all" ? data.fixtures : data.fixtures.filter((fixture) => fixture.leagueId === league), [data.fixtures, league]);
  const fixturesByDay = useMemo(() => {
    const groups = new Map<string, Fixture[]>();
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "short", day: "numeric", year: "numeric" });
    for (const fixture of fixtures) {
      const label = formatter.format(new Date(fixture.kickoff));
      groups.set(label, [...(groups.get(label) ?? []), fixture]);
    }
    return [...groups.entries()];
  }, [fixtures]);
  const forecasts = fixtures
    .filter((fixture) => fixture.status === "scheduled" && Date.parse(fixture.kickoff) > Date.now())
    .map((fixture) => ({ fixture, forecast: forecastWithHistory(fixture, history) }));
  const qualified = forecasts.filter((item) => item.forecast.qualified && item.forecast.dataQuality !== "insufficient");

  useEffect(() => {
    if (!historyReady) return;
    snapshotUpcomingFixtures(data.fixtures, history);
    const due = readForwardPredictions().filter((item) => item.status === "open" && new Date(item.kickoff).getTime() < Date.now()).slice(0, 50);
    if (!due.length) return;
    fetch("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: due.map((item) => ({ fixtureId: item.fixtureId, leagueId: item.leagueId })) }) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Result check failed")))
      .then((payload: { results: Parameters<typeof applyFinalResults>[0] }) => applyFinalResults(payload.results))
      .catch(() => undefined);
  }, [data.fixtures, history, historyReady]);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/fixtures", { cache: "no-store" });
      if (!response.ok) throw new Error("Refresh failed");
      setData(await response.json());
    } finally { setLoading(false); }
  }

  return (
    <>
      <PageHeader eyebrow="Live research terminal" title="Command Center" description="Yesterday's results, upcoming fixtures, transparent model signals, and paper-tested decisions—without the noise." action={<button className="button" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />{loading ? "Refreshing" : "Refresh data"}</button>} />
      <div className="metrics-grid">
        <Metric label="Upcoming fixtures" value={String(fixtures.filter((f) => f.status === "scheduled").length)} sub="selected competitions" />
        <Metric label="Qualified signals" value={String(qualified.length)} sub="baseline threshold ≥68%" tone="green" />
        <Metric label="Live now" value={String(fixtures.filter((f) => f.status === "live").length)} sub="ESPN match status" tone={fixtures.some((f) => f.status === "live") ? "orange" : "default"} />
        <Metric label="Paper bankroll" value="$1,000" sub="set locally in Settings" />
      </div>

      <div className="league-tabs" role="tablist" aria-label="Filter by league">
        <button className={league === "all" ? "active" : ""} onClick={() => setLeague("all")}>All matches</button>
        {LEAGUES.map((item) => <button key={item.id} className={league === item.id ? "active" : ""} onClick={() => setLeague(item.id)}>{item.short}</button>)}
      </div>

      {data.errors.length > 0 && <Notice>Some providers did not respond: {data.errors.join(" · ")}. Available competitions are still shown.</Notice>}
      {historySyncing ? <Notice>Loading completed-match scoring records for stronger league-specific predictions…</Notice> :
        historyError ? <Notice>Historical scoring update was unavailable: {historyError}. Cached results are used when possible; otherwise model estimates are limited.</Notice> : null}
      <div className="grid-2 dashboard-grid">
        <Panel>
          <PanelHead title="Fixture intelligence" meta={`${fixtures.length} fixtures · yesterday through the next 10 days · all returned matches shown`} action={<span className="freshness"><Satellite size={13} /> updated {new Date(data.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>} />
          <div className="fixture-list">
            {fixturesByDay.length > 0 ? fixturesByDay.map(([day, events]) => <div key={day}>
              <h3 className="fixture-day-heading">{day} · {events.length} {events.length === 1 ? "match" : "matches"}</h3>
              <div className="fixture-day-games">{events.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} forecast={forecastWithHistory(fixture, history)} />)}</div>
            </div>) : <div className="empty-state"><strong>No fixtures returned</strong>ESPN did not list a match for this competition in the requested dates. Try refreshing or a later schedule window.</div>}
          </div>
        </Panel>
        <div className="stack">
          <AutoParlayCards fixtures={fixtures} />
          <Panel>
            <PanelHead title="Strongest model signals" meta="Not recommendations · baseline model" />
            <div className="signal-list">
              {qualified.slice(0, 5).map(({ fixture, forecast }, index) => {
                const best = forecast.markets[0];
                return <div className="signal-row" key={fixture.id}><span className="signal-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{best.label}</strong><small>{fixture.home.shortName} vs {fixture.away.shortName}</small></div><b>{Math.round(best.probability * 100)}%</b></div>;
              })}
              {qualified.length === 0 && <div className="empty-state compact"><strong>No qualified signals</strong>That is a valid model outcome.</div>}
            </div>
          </Panel>
          <Notice>MIGO uses recency-weighted, opponent-adjusted historical goals with a fitted low-score correction when available; season W-D-L is the fallback. Probabilities remain uncalibrated and are not evidence of real-money betting value.</Notice>
        </div>
      </div>
    </>
  );
}
