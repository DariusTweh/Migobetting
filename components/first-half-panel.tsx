"use client";

import { useMemo } from "react";
import type { Fixture } from "@/lib/types";
import type { HistoricalMatch } from "@/lib/history";
import { estimateFirstHalf } from "@/lib/first-half-model";
import { Panel, PanelHead } from "./ui";

export function FirstHalfPanel({ fixture, history, ready }: {
  fixture: Fixture;
  history: HistoricalMatch[];
  ready: boolean;
}) {
  const model = useMemo(() => ready ? estimateFirstHalf(history, fixture) : null,
    [ready, history, fixture]);

  return <Panel className="first-half-panel">
    <PanelHead title="First-half goal model" meta="Experimental · verified half-time scores only"
      action={model ? <span className={"badge " +
        (model.quality === "good" ? "badge-good" : "badge-limited")}>
        {model.quality.toUpperCase()} DATA
      </span> : undefined}/>
    {!ready ? <div className="empty-state compact">Loading halftime history…</div> :
      !model ? <div className="empty-state compact">
        <strong>First-half forecast unavailable</strong>
        Need at least 60 earlier verified halftime scores in this competition, with a usable sample for both teams.
        No synthetic halftime percentages are shown.
      </div> : <>
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
        <p className="first-half-foot">
          {model.historicalMatches} prior matches with real HT scores ·
          {model.homeTeamMatches} {fixture.home.shortName} matches ·
          {model.awayTeamMatches} {fixture.away.shortName} matches.
          Venue-adjusted Poisson v1; probabilities are not yet independently calibrated.
          These are model estimates, not bookmaker prices.
        </p>
      </>}
  </Panel>;
}
