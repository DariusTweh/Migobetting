"use client";

import { useEffect, useMemo, useState } from "react";
import type { Fixture } from "@/lib/types";
import type { HistoricalMatch } from "@/lib/history";
import { importHistoricalMatches } from "@/lib/history-store";
import { estimateFirstHalf, firstHalfCoverage } from "@/lib/first-half-model";
import { Panel, PanelHead } from "./ui";

type Backfill = {
  league: string;
  matches: HistoricalMatch[];
  coverage: Array<{ season: string; validHalfTime: number; completed: number }>;
  warnings: string[];
};
const SUPPORTED = new Set(["eng.1", "esp.1", "ger.1", "ita.1", "fra.1"]);
// Shared session promise prevents a new request for each selected fixture.
const requests = new Map<string, Promise<Backfill>>();
async function loadHalfTimeHistory(leagueId: string): Promise<Backfill> {
  let promise = requests.get(leagueId);
  if (!promise) {
    promise = (async () => {
      const response = await fetch("/api/historical/halftime?league=" + encodeURIComponent(leagueId));
      const payload = await response.json() as Partial<Backfill> & { error?: string };
      if (!response.ok || !payload.matches?.length) throw new Error(payload.error || "Halftime provider returned no matches.");
      await importHistoricalMatches(payload.matches);
      window.dispatchEvent(new Event("migo:history"));
      return {
        league: payload.league || leagueId, matches: payload.matches,
        coverage: payload.coverage || [], warnings: payload.warnings || [],
      };
    })().catch((error) => {
      requests.delete(leagueId); // a later visit can retry a transient error
      throw error;
    });
    requests.set(leagueId, promise);
  }
  return promise;
}

export function FirstHalfPanel({ fixture, history, ready }: {
  fixture: Fixture;
  history: HistoricalMatch[];
  ready: boolean;
}) {
  const supported = SUPPORTED.has(fixture.leagueId);
  const [backfill, setBackfill] = useState<Backfill | null>(null);
  const [loading, setLoading] = useState(supported);
  const [warning, setWarning] = useState("");
  useEffect(() => {
    let alive = true;
    setBackfill(null);
    setWarning("");
    setLoading(supported);
    if (!supported) return;
    void loadHalfTimeHistory(fixture.leagueId).then((data) => {
      if (alive) setBackfill(data);
    }).catch((cause) => {
      if (alive) setWarning(cause instanceof Error ? cause.message : "Unable to refresh earlier halftime scores.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fixture.leagueId, supported]);

  const all = useMemo(() => {
    if (!backfill) return history;
    // Earlier scores fetched just now override stale missing-half values in the browser cache.
    const byId = new Map(history.map((m) => [m.id, m]));
    for (const m of backfill.matches) byId.set(m.id, m);
    return [...byId.values()];
  }, [history, backfill]);
  const available = ready || !!backfill;
  const model = useMemo(() => available ? estimateFirstHalf(all, fixture) : null,
    [available, all, fixture]);
  const coverage = useMemo(() => firstHalfCoverage(all, fixture), [all, fixture]);
  return <Panel className="first-half-panel">
    <PanelHead title="First-half goal model"
      meta="Real half-time scores · three complete seasons + current"
      action={model ? <span className={"badge " + (model.quality === "good" ? "badge-good" : "badge-limited")}>
        {model.quality.toUpperCase()} DATA
      </span> : undefined}/>
    {loading ? <div className="fh-data-banner">
      <span className="fh-sync-dot"/> Loading verified historical half-time scores for {fixture.league}…
    </div> : null}
    {warning ? <div className="fh-data-warning">Historical halftime refresh failed: {warning}.
      {coverage.validHalfTime ? " Available local scores are used below." : " Try refreshing this page later."}</div> : null}
    {!supported && !model ? <div className="empty-state compact">
      <strong>Halftime source not connected for {fixture.league}</strong>
      The current three-season feed covers Premier League, La Liga, Bundesliga, Serie A and Ligue 1.
      This competition needs its own verified halftime event source. Full-time goals are not substituted.
    </div> : !available && loading ? <div className="empty-state compact">
      Waiting for verified halftime imports…
    </div> : !model ? <div className="empty-state compact">
      <strong>{loading ? "Checking historical coverage…" : "Not enough verified halftime data for this fixture"}</strong>
      <div className="fh-coverage-inline">
        <span><b>{coverage.validHalfTime}</b> valid half-time scores</span>
        <span><b>{coverage.homeMatches}</b> {fixture.home.shortName} matches</span>
        <span><b>{coverage.awayMatches}</b> {fixture.away.shortName} matches</span>
      </div>
      Need 60 earlier matches in this league and at least four previous matches for each team, with usable recent weighting.
      {coverage.earlierMatches > coverage.validHalfTime ? " Some earlier results contain no verified half-time score." : ""}
    </div> : <>
      <div className="fh-data-banner fh-data-success">
        <span className="fh-sync-dot"/> {model.historicalMatches.toLocaleString()} verified earlier halftime matches ·
        {model.homeTeamMatches} {fixture.home.shortName} · {model.awayTeamMatches} {fixture.away.shortName}
      </div>
      <div className="first-half-expected">
        <div><small>{fixture.home.shortName} · 1H goals</small>
          <strong>{model.expectedHomeGoals.toFixed(2)}</strong></div>
        <div><small>Combined 1H expected goals</small>
          <strong>{(model.expectedHomeGoals + model.expectedAwayGoals).toFixed(2)}</strong></div>
        <div><small>{fixture.away.shortName} · 1H goals</small>
          <strong>{model.expectedAwayGoals.toFixed(2)}</strong></div>
      </div>
      <div className="first-half-market-list">
        {model.markets.map((market) => <div className="first-half-market-row" key={market.key}>
          <span>{market.label}</span>
          <div><strong>{(market.probability * 100).toFixed(1)}%</strong>
            <div className="prob-track"><i className="home"
              style={{ width: (market.probability * 100).toFixed(1) + "%" }}/></div></div>
        </div>)}
      </div>
      <div className="first-half-scores">
        <span>Most frequent halftime scores</span>
        <div>{model.halfTimeScores.map((item) =>
          <span key={item.score}><b>{item.score}</b><small>{(item.probability * 100).toFixed(1)}%</small></span>)}</div>
      </div>
    </>}
    <div className="fh-season-coverage">
      <strong>Verified halftime coverage</strong>
      {backfill?.coverage?.length ? <div className="fh-season-grid">
        {backfill.coverage.map((season) => <div key={season.season}>
          <b>{season.season}</b><span>{season.validHalfTime} / {season.completed}</span>
        </div>)}
      </div> : <small>{supported ? "Awaiting direct provider response or using local match history." :
        "No three-season source configured for this competition."}</small>}
    </div>
    <p className="first-half-foot">
      First-half Poisson v1 estimates are not independently calibrated or sportsbook prices.
      Training excludes the current fixture and all later matches.
      Data: football-data.co.uk CSV archives for supported domestic leagues.
    </p>
  </Panel>;
}
