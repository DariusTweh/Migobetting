"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarClock, CheckCircle2, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocalMatchHistoryStatus } from "@/lib/use-local-history";
import { FixtureStrongestPick } from "./fixture-strongest-pick";
import { forecastWithHistory } from "@/lib/historical-forecast";
import { describeScoreUncertainty } from "@/lib/score-context";
import { formatAmerican } from "@/lib/odds";
import type { Fixture, LineupIntelligence, TeamLineup } from "@/lib/types";
import { Notice, Panel, PanelHead } from "./ui";

export function MatchIntelligence({ fixture, lineups }: { fixture: Fixture; lineups: LineupIntelligence }) {
  const [tab, setTab] = useState<"overview" | "lineups">("overview");
  const { matches: history, ready: historyReady } = useLocalMatchHistoryStatus();
  const model = useMemo(() => forecastWithHistory(fixture, history), [fixture, history]);
  const scoreContext = useMemo(() => describeScoreUncertainty(model), [model]);
  const date = new Date(fixture.kickoff);
  return <>
    <Link href="/" className="back-link"><ArrowLeft size={15} />Back to fixtures</Link>
    <div className="match-hero">
      <div className="match-meta"><span className="badge">{fixture.league}</span><span><CalendarClock size={14} />{date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span></div>
      <div className="matchup">
        <TeamBlock team={fixture.home} side="Home" />
        <div className="versus"><span>VS</span><small>{fixture.statusLabel}</small></div>
        <TeamBlock team={fixture.away} side="Away" />
      </div>
      <div className="source-bar"><span><i /> LIVE PROVIDER DATA</span><span>ESPN · fetched {new Date(fixture.sourceUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
      <div className="playback-actions">
        <Link href={"/simulation?view=live&fixture=" + encodeURIComponent(fixture.id)} className="button button-primary">Watch simulated match</Link>
        <Link href="/builder?mode=daily-double" className="button">Build Daily Double / Banger</Link>
      </div>
    </div>

    <div className="fixture-strongest-placement"><FixtureStrongestPick fixture={fixture} history={history} historyReady={historyReady} /></div>

    <div className="match-tabs"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Match overview</button><button className={tab === "lineups" ? "active" : ""} onClick={() => setTab("lineups")}>Lineup intelligence <span className={`badge ${lineups.home.status === "CONFIRMED" && lineups.away.status === "CONFIRMED" ? "badge-good" : "badge-limited"}`}>{lineups.home.status === lineups.away.status ? lineups.home.status : "MIXED"}</span></button></div>

    {tab === "overview" ? <div className="match-layout">
      <div className="stack">
        <Panel>
          <PanelHead title="Match probabilities" meta={`${model.dataQuality} data · ${model.modelVersion}`} />
          <div className="outcome-bars">
            {[[fixture.home.shortName, model.homeWin], ["Draw", model.draw], [fixture.away.shortName, model.awayWin]].map(([label, value], index) => <div className="outcome" key={String(label)}><div><span>{label}</span><strong>{Math.round(Number(value) * 100)}%</strong></div><div className="prob-track"><i style={{ width: `${Number(value) * 100}%` }} className={index === 0 ? "home" : index === 2 ? "away" : "draw"} /></div></div>)}
          </div>
        </Panel>
        <Panel>
          <PanelHead title="Model markets" meta="Estimated probabilities · not sportsbook prices" />
          <div className="market-table">
            <div className="table-head"><span>Market</span><span>Model</span><span>Fair price</span></div>
            {model.markets.map((market) => <div className="table-row" key={market.key}><strong>{market.label}</strong><span>{Math.round(market.probability * 100)}%</span><b>{formatAmerican(market.fairAmerican)}</b></div>)}
          </div>
        </Panel>
      </div>
      <div className="stack">
        <Panel>
          <PanelHead title="Goal forecast" meta="Projected goals and score ranges" />
          <div className="expected-score"><strong>{model.expectedHomeGoals.toFixed(2)}</strong><span>modeled goals</span><strong>{model.expectedAwayGoals.toFixed(2)}</strong></div>
          <div className="goal-forecast-explainer">
            <strong>Most frequent exact score: {scoreContext.modalScore}</strong>
            <p>{(scoreContext.modalProbability * 100).toFixed(1)}% exact-score chance · {(scoreContext.probabilityOtherScores * 100).toFixed(1)}% other results</p>
          </div>
          <div className="goal-range-grid">
            {scoreContext.goalRanges.map((range) => <div key={range.label}>
              <small>{range.label}</small>
              <strong>{(range.probability * 100).toFixed(1)}%</strong>
              <div className="prob-track"><i className="home" style={{ width: (range.probability * 100).toFixed(1) + "%" }}/></div>
            </div>)}
          </div>
          <div className="scoreline-list">{model.scorelines.map((item) => <div key={item.score}><strong>{item.score}</strong><span>{Math.round(item.probability * 100)}%</span></div>)}</div>
        </Panel>
        <details className="model-notes">
          <summary>Model details · {model.dataQuality} data</summary>
          <div className="model-notes-content">
            <strong>Evidence</strong>
            {model.evidence.slice(0, 4).map((item, index) => <p key={index}>{item}</p>)}
            <strong>Limitations</strong>
            {model.risks.slice(0, 3).map((item, index) => <p key={index}>{item}</p>)}
          </div>
        </details>
      </div>
    </div> : <LineupView fixture={fixture} lineups={lineups} baselineHome={model.expectedHomeGoals} baselineAway={model.expectedAwayGoals} />}
  </>;
}

function LineupView({ fixture, lineups, baselineHome, baselineAway }: { fixture: Fixture; lineups: LineupIntelligence; baselineHome: number; baselineAway: number }) {
  return <div className="stack"><div className="lineup-status-banner"><div><span className="badge badge-limited">90-minute policy</span><strong>{lineups.minutesToKickoff > 90 ? `Projected XI · confirmation window opens in ${Math.round(lineups.minutesToKickoff - 90)} min` : "Confirmation window active · ESPN checked"}</strong></div><p>Checked {new Date(lineups.checkedAt).toLocaleString()}. An XI is only marked confirmed when ESPN returns 11 starters inside the operational window.</p></div><div className="lineup-grid"><LineupCard lineup={lineups.home} /><LineupCard lineup={lineups.away} /></div><Panel><PanelHead title="Lineup scenario impact" meta="Match-history baseline vs evidence-supported adjustment" /><div className="lineup-impact"><div><span>Baseline expected goals</span><strong>{baselineHome.toFixed(2)} – {baselineAway.toFixed(2)}</strong></div><div><span>Lineup-adjusted expected goals</span><strong>{(baselineHome + lineups.impact.homeExpectedGoalsDelta).toFixed(2)} – {(baselineAway + lineups.impact.awayExpectedGoalsDelta).toFixed(2)}</strong></div><div><span>Applied adjustment</span><strong className="neutral-impact">Neutral</strong></div></div><p className="impact-reason">{lineups.impact.reason}</p></Panel><div className="grid-2"><Panel><PanelHead title="Evidence ledger" meta="Every claim includes source and observation time" /><div className="evidence-ledger">{lineups.evidence.map((item) => <div key={item.claim}><CheckCircle2 size={15} /><span><strong>{item.claim}</strong><small>{item.source} · {new Date(item.timestamp).toLocaleString()}</small></span></div>)}</div></Panel><Panel><PanelHead title="Uncertainty and PASS conditions" meta="No unsupported player penalties" /><div className="warning-list">{lineups.warnings.map((warning) => <div key={warning}><ShieldAlert size={15} /><span>{warning}</span></div>)}</div></Panel></div><Notice>Historical completed-match lineups can establish prior participation. They are never treated as if they were known before their own kickoff unless a publication timestamp proves that availability.</Notice></div>;
}

function LineupCard({ lineup }: { lineup: TeamLineup }) {
  return <Panel><PanelHead title={lineup.teamName} meta={`${lineup.formation ?? "Formation unavailable"} · ${lineup.observedMatches} earlier lineups`} action={<span className={`badge ${lineup.status === "CONFIRMED" ? "badge-good" : lineup.status === "PROJECTED" ? "badge-limited" : "badge-insufficient"}`}>{lineup.status}</span>} />{lineup.players.length ? <div className="player-grid">{lineup.players.map((player) => <div className="player-row" key={player.id}><span className="player-shirt">{player.jersey ?? player.position}</span><div><strong>{player.name}</strong><small>{player.position} · {player.starts}/{player.observedMatches} recent starts</small></div><div className={`confidence confidence-${player.confidence}`}><b>{Math.round(player.startingProbability * 100)}%</b><small>{player.confidence}</small></div></div>)}</div> : <div className="empty-state"><strong>Lineup unknown</strong>No eligible starting-XI history was returned for this team.</div>}{lineup.missingPlayers.length ? <div className="missing-players"><strong>Provider-listed absences</strong>{lineup.missingPlayers.map((player) => <span key={player.name}>{player.name} · {player.reason}</span>)}</div> : <div className="no-absence">No verified absence list returned by ESPN.</div>}</Panel>;
}

function TeamBlock({ team, side }: { team: Fixture["home"]; side: string }) {
  return <div className="hero-team">{team.logo ? <Image src={team.logo} alt="" width={68} height={68} unoptimized /> : <div className="crest-fallback">{team.abbreviation}</div>}<div><small>{side}</small><h1>{team.shortName}</h1><span>{team.record ? `${team.record} season record` : "Season record unavailable"}</span></div></div>;
}
