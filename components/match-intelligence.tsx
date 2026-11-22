"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Play, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocalMatchHistoryStatus } from "@/lib/use-local-history";
import { FixtureStrongestPick } from "./fixture-strongest-pick";
import { forecastWithHistory } from "@/lib/historical-forecast";
import { describeScoreUncertainty } from "@/lib/score-context";
import { formatMatchDateTime } from "@/lib/date-time";
import { formatAmerican } from "@/lib/odds";
import type { Fixture, LineupIntelligence, TeamLineup } from "@/lib/types";
import { Notice, Panel, PanelHead } from "./ui";

type DetailTab = "overview" | "markets" | "lineups" | "simulation" | "history";

export function MatchIntelligence({ fixture, lineups }: { fixture: Fixture; lineups: LineupIntelligence }) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const { matches: history, ready: historyReady } = useLocalMatchHistoryStatus();
  const model = useMemo(() => forecastWithHistory(fixture, history), [fixture, history]);
  const scoreContext = useMemo(() => describeScoreUncertainty(model), [model]);
  const hasScore = (fixture.status === "live" || fixture.status === "final") && fixture.home.score !== undefined && fixture.away.score !== undefined;
  return <>
    <Link href="/#matches" className="back-link"><ArrowLeft size={15}/>Matches</Link>
    <section className={`match-hero match-hero-${fixture.status}`}>
      <div className="match-meta"><span>{fixture.league}</span><span>{formatMatchDateTime(fixture.kickoff)}</span></div>
      <div className="matchup">
        <TeamBlock team={fixture.home}/>
        <div className="versus"><span>{hasScore ? `${fixture.home.score} – ${fixture.away.score}` : "VS"}</span><small className={fixture.status === "live" ? "live-text" : ""}>{fixture.status === "final" ? "FULL TIME" : fixture.statusLabel}</small></div>
        <TeamBlock team={fixture.away}/>
      </div>
      <div className="match-hero-footer"><span>ESPN provider data · updated {new Date(fixture.sourceUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><Link href={`/simulation?view=live&fixture=${encodeURIComponent(fixture.id)}`}><Play size={14}/>Simulate</Link></div>
    </section>

    <FixtureStrongestPick fixture={fixture} history={history} historyReady={historyReady}/>

    <div className="match-tabs" role="tablist" aria-label="Match details">
      {(["overview", "markets", "lineups", "simulation", "history"] as DetailTab[]).map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}
    </div>

    {tab === "overview" ? <div className="match-layout">
      <Panel className="probability-card"><PanelHead title="1X2 probability" meta={`${model.dataQuality} data · ${model.modelVersion}`}/><div className="probability-labels"><span>{fixture.home.shortName}<b>{Math.round(model.homeWin * 100)}%</b></span><span>Draw<b>{Math.round(model.draw * 100)}%</b></span><span>{fixture.away.shortName}<b>{Math.round(model.awayWin * 100)}%</b></span></div><div className="probability-bar" aria-label={`Home ${Math.round(model.homeWin * 100)}%, draw ${Math.round(model.draw * 100)}%, away ${Math.round(model.awayWin * 100)}%`}><i style={{ width: `${model.homeWin * 100}%` }}/><i style={{ width: `${model.draw * 100}%` }}/><i style={{ width: `${model.awayWin * 100}%` }}/></div></Panel>
      <GoalForecast fixture={fixture} model={model} scoreContext={scoreContext}/>
    </div> : null}
    {tab === "markets" ? <Panel><PanelHead title="Model markets" meta="One coherent score distribution · not sportsbook prices"/><div className="market-table"><div className="table-head"><span>Market</span><span>Model</span><span>Fair price</span></div>{model.markets.map((market) => <div className="table-row" key={market.key}><strong>{market.label}</strong><span>{Math.round(market.probability * 100)}%</span><b>{formatAmerican(market.fairAmerican)}</b></div>)}</div></Panel> : null}
    {tab === "lineups" ? <LineupView fixture={fixture} lineups={lineups} baselineHome={model.expectedHomeGoals} baselineAway={model.expectedAwayGoals}/> : null}
    {tab === "simulation" ? <Panel className="simulation-cta"><Play size={30}/><div><h2>30,000-match simulation</h2><p>Explore the full forecast distribution or play a clearly labeled synthetic match.</p></div><Link className="button button-primary" href={`/simulation?view=live&fixture=${encodeURIComponent(fixture.id)}`}>Open simulation</Link></Panel> : null}
    {tab === "history" ? <Panel><PanelHead title="Model history and limits" meta={`${model.modelVersion} · ${model.dataQuality} data`}/><div className="model-history-grid"><div><strong>Supporting evidence</strong>{model.evidence.map((item) => <p key={item}>{item}</p>)}</div><div><strong>What is not modeled</strong>{model.risks.map((item) => <p key={item}>{item}</p>)}</div></div></Panel> : null}
  </>;
}

function GoalForecast({ fixture, model, scoreContext }: { fixture: Fixture; model: ReturnType<typeof forecastWithHistory>; scoreContext: ReturnType<typeof describeScoreUncertainty> }) {
  return <Panel><PanelHead title="Goal forecast" meta="Ranges matter more than one exact score"/><div className="expected-score"><strong>{model.expectedHomeGoals.toFixed(2)}<small>{fixture.home.shortName}</small></strong><span>modeled goals</span><strong>{model.expectedAwayGoals.toFixed(2)}<small>{fixture.away.shortName}</small></strong></div><div className="goal-range-grid">{scoreContext.goalRanges.map((range) => <div key={range.label}><small>{range.label}</small><strong>{(range.probability * 100).toFixed(1)}%</strong><div className="prob-track"><i className="home" style={{ width: `${range.probability * 100}%` }}/></div></div>)}</div><div className="scoreline-context"><span>Most frequent exact score <b>{scoreContext.modalScore}</b></span><small>Only {(scoreContext.modalProbability * 100).toFixed(1)}%; all other scores total {(scoreContext.probabilityOtherScores * 100).toFixed(1)}%.</small></div><div className="scoreline-list">{model.scorelines.map((item) => <div key={item.score}><strong>{item.score}</strong><span>{Math.round(item.probability * 100)}%</span></div>)}</div></Panel>;
}

function LineupView({ fixture, lineups, baselineHome, baselineAway }: { fixture: Fixture; lineups: LineupIntelligence; baselineHome: number; baselineAway: number }) {
  return <div className="stack"><div className="lineup-status-banner"><div><span className="badge badge-limited">90-minute policy</span><strong>{lineups.minutesToKickoff > 90 ? `Projected XI · confirmation in ${Math.round(lineups.minutesToKickoff - 90)} min` : "Confirmation window active"}</strong></div><p>Checked {new Date(lineups.checkedAt).toLocaleString()}.</p></div><div className="lineup-grid"><LineupCard lineup={lineups.home}/><LineupCard lineup={lineups.away}/></div><Panel><PanelHead title="Lineup scenario impact" meta="No unsupported player penalty is applied"/><div className="lineup-impact"><div><span>Baseline goals</span><strong>{baselineHome.toFixed(2)} – {baselineAway.toFixed(2)}</strong></div><div><span>Adjusted goals</span><strong>{(baselineHome + lineups.impact.homeExpectedGoalsDelta).toFixed(2)} – {(baselineAway + lineups.impact.awayExpectedGoalsDelta).toFixed(2)}</strong></div><div><span>Adjustment</span><strong className="neutral-impact">Neutral</strong></div></div><p className="impact-reason">{lineups.impact.reason}</p></Panel><div className="grid-2"><Panel><PanelHead title="Evidence"/><div className="evidence-ledger">{lineups.evidence.map((item) => <div key={item.claim}><CheckCircle2 size={15}/><span><strong>{item.claim}</strong><small>{item.source}</small></span></div>)}</div></Panel><Panel><PanelHead title="Uncertainty"/><div className="warning-list">{lineups.warnings.map((warning) => <div key={warning}><ShieldAlert size={15}/><span>{warning}</span></div>)}</div></Panel></div><Notice>{fixture.league} historical lineups never substitute for a confirmed current XI.</Notice></div>;
}

function LineupCard({ lineup }: { lineup: TeamLineup }) {
  return <Panel><PanelHead title={lineup.teamName} meta={`${lineup.formation ?? "Formation unavailable"} · ${lineup.observedMatches} earlier lineups`} action={<span className={`badge ${lineup.status === "CONFIRMED" ? "badge-good" : lineup.status === "PROJECTED" ? "badge-limited" : "badge-insufficient"}`}>{lineup.status}</span>}/>{lineup.players.length ? <div className="player-grid">{lineup.players.map((player) => <div className="player-row" key={player.id}><span className="player-shirt">{player.jersey ?? player.position}</span><div><strong>{player.name}</strong><small>{player.position} · {player.starts}/{player.observedMatches} starts</small></div><div className={`confidence confidence-${player.confidence}`}><b>{Math.round(player.startingProbability * 100)}%</b><small>{player.confidence}</small></div></div>)}</div> : <div className="empty-state compact"><strong>Lineup unknown</strong>No verified starting-XI history.</div>}</Panel>;
}

function TeamBlock({ team }: { team: Fixture["home"] }) {
  return <div className="hero-team">{team.logo ? <Image src={team.logo} alt="" width={72} height={72} unoptimized/> : <div className="crest-fallback">{team.abbreviation}</div>}<h1>{team.shortName}</h1><span>{team.record ?? "Record unavailable"}</span></div>;
}
