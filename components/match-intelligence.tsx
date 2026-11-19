"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BrainCircuit, CalendarClock, CheckCircle2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { forecastFixture } from "@/lib/model";
import { formatAmerican } from "@/lib/odds";
import type { Fixture, LineupIntelligence, TeamLineup } from "@/lib/types";
import { Notice, Panel, PanelHead } from "./ui";

export function MatchIntelligence({ fixture, lineups }: { fixture: Fixture; lineups: LineupIntelligence }) {
  const [tab, setTab] = useState<"overview" | "lineups">("overview");
  const model = forecastFixture(fixture);
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
    </div>

    <div className="match-tabs"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Match overview</button><button className={tab === "lineups" ? "active" : ""} onClick={() => setTab("lineups")}>Lineup intelligence <span className={`badge ${lineups.home.status === "CONFIRMED" && lineups.away.status === "CONFIRMED" ? "badge-good" : "badge-limited"}`}>{lineups.home.status === lineups.away.status ? lineups.home.status : "MIXED"}</span></button></div>

    {tab === "overview" ? <div className="match-layout">
      <div className="stack">
        <Panel>
          <PanelHead title="Outcome probability" meta={`${model.modelVersion} · ${model.dataQuality} data quality`} />
          <div className="outcome-bars">
            {[[fixture.home.shortName, model.homeWin], ["Draw", model.draw], [fixture.away.shortName, model.awayWin]].map(([label, value], index) => <div className="outcome" key={String(label)}><div><span>{label}</span><strong>{Math.round(Number(value) * 100)}%</strong></div><div className="prob-track"><i style={{ width: `${Number(value) * 100}%` }} className={index === 0 ? "home" : index === 2 ? "away" : "draw"} /></div></div>)}
          </div>
        </Panel>
        <Panel>
          <PanelHead title="Market matrix" meta="Derived from one coherent Poisson score distribution" />
          <div className="market-table">
            <div className="table-head"><span>Market</span><span>Model</span><span>Fair price</span></div>
            {model.markets.map((market) => <div className="table-row" key={market.key}><strong>{market.label}</strong><span>{Math.round(market.probability * 100)}%</span><b>{formatAmerican(market.fairAmerican)}</b></div>)}
          </div>
        </Panel>
      </div>
      <div className="stack">
        <Panel>
          <PanelHead title="Expected score" meta="Most likely scorelines" />
          <div className="expected-score"><strong>{model.expectedHomeGoals.toFixed(2)}</strong><span>xG baseline</span><strong>{model.expectedAwayGoals.toFixed(2)}</strong></div>
          <div className="scoreline-list">{model.scorelines.map((item) => <div key={item.score}><strong>{item.score}</strong><span>{Math.round(item.probability * 100)}%</span></div>)}</div>
        </Panel>
        <Panel>
          <PanelHead title="MIGO Analyst" meta="Evidence check · deterministic fallback" action={<BrainCircuit size={19} className="lime" />} />
          <div className="analyst-body">
            <div className="evidence-block positive"><h3><CheckCircle2 size={16} />Supporting evidence</h3>{model.evidence.map((item) => <p key={item}>{item}</p>)}</div>
            <div className="evidence-block risk"><h3><ShieldAlert size={16} />Why it could fail</h3>{model.risks.map((item) => <p key={item}>{item}</p>)}</div>
            <div className="verdict"><span>Current verdict</span><strong>{model.qualified ? "RESEARCH SHORTLIST" : "PASS"}</strong><p>{model.qualified ? "The probability clears the baseline threshold, but a quoted price is still needed to assess value." : "The evidence is not strong enough for a qualified selection."}</p></div>
          </div>
        </Panel>
        <Notice>AI narrative generation is intentionally inactive until a server-side OpenAI key is configured. All text shown here is deterministic and grounded in visible model inputs.</Notice>
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
