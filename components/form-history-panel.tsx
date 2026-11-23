"use client";

import { useMemo, useState } from "react";
import type { Fixture } from "@/lib/types";
import type { HistoricalMatch } from "@/lib/history";
import {
  getTeamPastMatches, getHeadToHead, summarizeTeamForm, summarizeHeadToHead,
  type FormVenue, type FormSide, type TeamPastMatch,
} from "@/lib/form-history";
import { Panel, PanelHead } from "./ui";

type View = "home" | "h2h" | "away";
const scorePct = (numerator: number, denominator: number) =>
  denominator ? numerator + "/" + denominator : "—";
const date = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "2-digit", timeZone: "America/Los_Angeles",
}).format(new Date(value));

function WDL({ value }: { value: "W" | "D" | "L" }) {
  return <span className={"form-wdl form-wdl-" + value.toLowerCase()}>{value}</span>;
}

function FormTiles({ matches, name }: { matches: TeamPastMatch[]; name: string }) {
  const stats = summarizeTeamForm(matches);
  if (!stats.played) return <div className="empty-state compact">No completed matches in this selection.</div>;
  return <div className="form-summary">
    <div className="form-summary-top">
      <strong>{name}</strong>
      <div className="form-badges">{matches.slice(0, 5).map((match) =>
        <WDL key={match.id} value={match.result}/>)}</div>
    </div>
    <div className="form-stat-pills">
      <span><b>{stats.wins}–{stats.draws}–{stats.losses}</b> W–D–L</span>
      <span><b>{stats.goalsFor}–{stats.goalsAgainst}</b> Goals</span>
      <span><b>{scorePct(stats.over25, stats.played)}</b> Over 2.5</span>
      <span><b>{scorePct(stats.btts, stats.played)}</b> BTTS</span>
      <span><b>{scorePct(stats.under35, stats.played)}</b> Under 3.5</span>
      <span><b>{stats.currentUnbeaten}</b> Unbeaten run</span>
      <span><b>{stats.currentWithoutCleanSheet}</b> No clean sheet run</span>
      {stats.firstHalfAvailable > 0 ? <>
        <span><b>{scorePct(stats.firstHalfOver05, stats.firstHalfAvailable)}</b> 1H Over 0.5</span>
        <span><b>{scorePct(stats.firstHalfOver15, stats.firstHalfAvailable)}</b> 1H Over 1.5</span>
      </> : null}
    </div>
  </div>;
}

export function FormHistoryPanel({ fixture, history, ready }: {
  fixture: Fixture;
  history: HistoricalMatch[];
  ready: boolean;
}) {
  const [view, setView] = useState<View>("h2h");
  const [venue, setVenue] = useState<FormVenue>("all");
  const [competitionOnly, setCompetitionOnly] = useState(false);
  const [limit, setLimit] = useState<5 | 10>(10);
  const home = useMemo(() => getTeamPastMatches(history, fixture, "home", {
    venue, competitionOnly, limit,
  }), [history, fixture, venue, competitionOnly, limit]);
  const away = useMemo(() => getTeamPastMatches(history, fixture, "away", {
    venue, competitionOnly, limit,
  }), [history, fixture, venue, competitionOnly, limit]);
  const headToHead = useMemo(() => getHeadToHead(history, fixture, 30)
    .filter((match) => !competitionOnly || match.competition === fixture.league)
    .slice(0, limit), [history, fixture, competitionOnly, limit]);
  const h2hSummary = useMemo(() => summarizeHeadToHead(headToHead, fixture),
    [headToHead, fixture]);
  const side: FormSide = view === "away" ? "away" : "home";
  const teamRows = view === "home" ? home : away;

  return <Panel className="form-history-panel">
    <PanelHead title="Form & past matches" meta="Verified completed scores before this fixture" />
    <div className="form-history-content">
      <div className="form-history-segments" role="group" aria-label="Previous match view">
        {(["home", "h2h", "away"] as const).map((item) =>
          <button type="button" key={item} className={view === item ? "active" : ""}
            aria-pressed={view === item}
            onClick={() => { setView(item); setVenue("all"); }}>
            {item === "home" ? fixture.home.shortName : item === "away" ? fixture.away.shortName : "H2H"}
          </button>)}
      </div>
      <div className="form-history-filters">
        {view !== "h2h" ? <select aria-label="Home or away matches" value={venue}
          onChange={(event) => setVenue(event.target.value as FormVenue)}>
          <option value="all">All venues</option><option value="home">Home only</option>
          <option value="away">Away only</option>
        </select> : null}
        <label><input type="checkbox" checked={competitionOnly}
          onChange={(event) => setCompetitionOnly(event.target.checked)}/>
          {fixture.league} only</label>
        <select aria-label="Number of past matches" value={limit}
          onChange={(event) => setLimit(Number(event.target.value) as 5 | 10)}>
          <option value={5}>Last 5</option><option value={10}>Last 10</option>
        </select>
      </div>
      {!ready ? <div className="empty-state compact">Loading previous results…</div> :
        view === "h2h" ? <>
          <div className="h2h-score-strip">
            <div><strong>{h2hSummary.firstWins}</strong><small>{fixture.home.shortName} wins</small></div>
            <div><strong>{h2hSummary.draws}</strong><small>Draws</small></div>
            <div><strong>{h2hSummary.secondWins}</strong><small>{fixture.away.shortName} wins</small></div>
          </div>
          {h2hSummary.played ? <div className="form-stat-pills">
            <span><b>{scorePct(h2hSummary.over25, h2hSummary.played)}</b> Over 2.5</span>
            <span><b>{scorePct(h2hSummary.btts, h2hSummary.played)}</b> BTTS</span>
            <span><b>{scorePct(h2hSummary.firstCleanSheets, h2hSummary.played)}</b> {fixture.home.shortName} clean sheets</span>
            <span><b>{scorePct(h2hSummary.secondCleanSheets, h2hSummary.played)}</b> {fixture.away.shortName} clean sheets</span>
          </div> : null}
          {headToHead.length ? <div className="form-match-list">{headToHead.map((match) =>
            <div className="form-match-row" key={match.id}>
              <time>{date(match.date)}</time>
              <div><strong>{match.homeTeam}</strong><small>{match.competition}</small>
                <strong>{match.awayTeam}</strong></div>
              <b className="form-match-score">{match.homeGoals}–{match.awayGoals}</b>
            </div>)}</div> : <div className="empty-state compact">No verified earlier H2H matches in this filter.</div>}
        </> : <>
          <FormTiles matches={teamRows} name={side === "home" ? fixture.home.shortName : fixture.away.shortName}/>
          {teamRows.length ? <div className="form-match-list">{teamRows.map((match) =>
            <div className="form-match-row" key={match.id}>
              <time>{date(match.date)}</time>
              <div><strong>{match.opponent}</strong><small>{match.competition} · {match.venue === "home" ? "H" : "A"}</small>
                {match.halfTimeFor !== undefined && match.halfTimeAgainst !== undefined ?
                  <small>HT {match.halfTimeFor}–{match.halfTimeAgainst}</small> : null}
              </div>
              <b className="form-match-score">{match.goalsFor}–{match.goalsAgainst}</b>
              <WDL value={match.result}/>
            </div>)}</div> : <div className="empty-state compact">No previous verified matches for this filter.</div>}
        </>}
      <p className="form-history-source">Historical source: completed match imports. H2H and trends count only returned matches; no corners, cards, manager stats or event timestamps are inferred.</p>
    </div>
  </Panel>;
}
