"use client";

import { useEffect, useMemo, useState } from "react";
import type { Fixture } from "@/lib/types";
import type { HistoricalMatch } from "@/lib/history";
import { importHistoricalMatches } from "@/lib/history-store";
import { estimateFirstHalf, firstHalfCoverage, isContinentalMen } from "@/lib/first-half-model";
import { Panel, PanelHead } from "./ui";

type Backfill = {
  league: string;
  matches: HistoricalMatch[];
  coverage: Array<{ season: string; validHalfTime: number; completed: number }>;
  warnings: string[];
};
type UefaBackfill = {
  matches: HistoricalMatch[];
  coverage?: { monthsRequested: number; monthsReturned: number;
    previousCompletedMatchesForTeams: number; verifiedHalftimeScores: number; unverifiedMatches: number };
  warnings?: string[];
};
const DOMESTIC = ["eng.1","esp.1","ger.1","ita.1","fra.1"] as const;
const OTHER_EUROPE = ["nl.1","por.1","bel.1","tur.1","gre.1","sco.1"] as const;
const CLUB_FEEDS:string[] = [...DOMESTIC,...OTHER_EUROPE];
const requestCache = new Map<string,Promise<Backfill>>();
const uefaCache = new Map<string,Promise<UefaBackfill>>();

async function fetchDomestic(code:string):Promise<Backfill> {
  let promise=requestCache.get(code);
  if(!promise){
    promise=(async()=>{
      const response=await fetch("/api/historical/halftime?league="+encodeURIComponent(code));
      const payload=await response.json() as Partial<Backfill>&{error?:string};
      if(!response.ok || !payload.matches?.length)
        throw new Error(code+": "+(payload.error||"No verified halftime data returned"));
      await importHistoricalMatches(payload.matches);
      window.dispatchEvent(new Event("migo:history"));
      return {
        league:payload.league??code,matches:payload.matches,
        coverage:payload.coverage??[],warnings:payload.warnings??[],
      };
    })().catch(error=>{requestCache.delete(code);throw error;});
    requestCache.set(code,promise);
  }
  return promise;
}
async function fetchUefa(fixture:Fixture):Promise<UefaBackfill> {
  const key=[fixture.leagueId,fixture.home.name,fixture.away.name,fixture.kickoff.slice(0,10)].join("|");
  let promise=uefaCache.get(key);
  if(!promise){
    promise=(async()=>{
      const query=new URLSearchParams({league:fixture.leagueId,home:fixture.home.name,
        away:fixture.away.name,kickoff:fixture.kickoff});
      const response=await fetch("/api/historical/continental-halftime?"+query);
      const payload=await response.json() as UefaBackfill&{error?:string};
      if(!response.ok)throw new Error(payload.error||"UEFA event provider unavailable");
      if(payload.matches?.length){
        await importHistoricalMatches(payload.matches);
        window.dispatchEvent(new Event("migo:history"));
      }
      return {matches:payload.matches??[],coverage:payload.coverage,warnings:payload.warnings??[]};
    })().catch(error=>{uefaCache.delete(key);throw error;});
    uefaCache.set(key,promise);
  }
  return promise;
}
type PullState = {
  matches:HistoricalMatch[];
  leagues:Backfill[];
  uefa:UefaBackfill|null;
  warnings:string[];
};
const EMPTY:PullState={matches:[],leagues:[],uefa:null,warnings:[]};

export function FirstHalfPanel({fixture,history,ready}:{
  fixture:Fixture;history:HistoricalMatch[];ready:boolean;
}){
  const clubCompetition=isContinentalMen(fixture);
  const uefaWomen=fixture.leagueId==="uefa.wchampions";
  const supported=CLUB_FEEDS.includes(fixture.leagueId)||clubCompetition||uefaWomen;
  const [pull,setPull]=useState<PullState>(EMPTY);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    let alive=true;
    setPull(EMPTY);
    if(!supported){setLoading(false);return;}
    setLoading(true);
    const sources=clubCompetition?CLUB_FEEDS:
      DOMESTIC.includes(fixture.leagueId as typeof DOMESTIC[number]) ||
      OTHER_EUROPE.includes(fixture.leagueId as typeof OTHER_EUROPE[number])
        ?[fixture.leagueId]:[];
    // Competition history supplements domestic history; it never replaces it.
    void Promise.all([
      Promise.allSettled(sources.map(code=>fetchDomestic(code))),
      clubCompetition||uefaWomen ?
        fetchUefa(fixture).then(value=>({status:"fulfilled" as const,value}),
          reason=>({status:"rejected" as const,reason})) :
        Promise.resolve(null),
    ]).then(([domestic,uefa])=>{
      if(!alive)return;
      const successful=domestic.flatMap(result=>result.status==="fulfilled"?[result.value]:[]);
      const failures=domestic.flatMap(result=>
        result.status==="rejected"?[String(result.reason instanceof Error?result.reason.message:result.reason)]:[]);
      const espn=uefa?.status==="fulfilled"?uefa.value:null;
      if(uefa?.status==="rejected")failures.push("ESPN: "+String(uefa.reason));
      const byId=new Map<string,HistoricalMatch>();
      for(const dataset of successful)for(const match of dataset.matches)byId.set(match.id,match);
      if(espn)for(const match of espn.matches)byId.set(match.id,match);
      setPull({matches:[...byId.values()],leagues:successful,uefa:espn,
        warnings:[...failures,...successful.flatMap(x=>x.warnings.slice(0,1)),...(espn?.warnings??[]).slice(0,2)]});
    }).finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[fixture.leagueId,fixture.home.name,fixture.away.name,fixture.kickoff,supported,clubCompetition,uefaWomen]);

  const all=useMemo(()=>{
    const map=new Map(history.map(m=>[m.id,m]));
    for(const match of pull.matches)map.set(match.id,match);
    return [...map.values()];
  },[history,pull]);
  const available=ready||pull.matches.length>0;
  const model=useMemo(()=>available?estimateFirstHalf(all,fixture):null,[available,all,fixture]);
  const coverage=useMemo(()=>firstHalfCoverage(all,fixture),[all,fixture]);
  const seasons=useMemo(()=>{
    const bySeason=new Map<string,{valid:number;completed:number}>();
    for(const league of pull.leagues)for(const season of league.coverage){
      const value=bySeason.get(season.season)??{valid:0,completed:0};
      value.valid+=season.validHalfTime;value.completed+=season.completed;
      bySeason.set(season.season,value);
    }
    return [...bySeason].sort(([a],[b])=>b.localeCompare(a));
  },[pull.leagues]);
  const home=model?.homeSignals,away=model?.awaySignals;

  return <Panel className="first-half-panel">
    <PanelHead title="First-half goal intelligence"
      meta="Club attack + defensive vulnerability · opponent and venue adjusted"
      action={model?<span className={"badge "+(model.quality==="good"?"badge-good":"badge-limited")}>
        {model.quality.toUpperCase()} DATA
      </span>:undefined}/>
    {loading?<div className="fh-data-banner"><span className="fh-sync-dot"/>
      Updating {clubCompetition?"club domestic leagues + ESPN Champions League":"verified halftime records"}…
    </div>:null}
    {pull.warnings.length?<div className="fh-data-warning">
      Partial data coverage: {pull.warnings.slice(0,2).join(" · ")}
    </div>:null}
    {!supported?<div className="empty-state compact">
      <strong>Verified halftime feed not yet configured</strong>
      This competition is not connected to a verified halftime provider. No made-up 1H figures are displayed.
    </div>:!available&&loading?<div className="empty-state compact">Checking verified club first-half history…</div>:
      !model?<div className="empty-state compact">
        <strong>{loading?"Calculating from club records…":"Insufficient verified club halftime history"}</strong>
        <div className="fh-coverage-inline">
          <span><b>{coverage.validHalfTime}</b> eligible historic 1H scores</span>
          <span><b>{coverage.homeMatches}</b> {fixture.home.shortName} matches</span>
          <span><b>{coverage.awayMatches}</b> {fixture.away.shortName} matches</span>
        </div>
        Predictions need at least 60 earlier recorded halftime results in the training pool
        and four matching previous club results for each team.
        {clubCompetition?" Domestic European records are counted even if the Champions League season just started.":""}
      </div>:<>
      <div className="fh-data-banner fh-data-success"><span className="fh-sync-dot"/>
        {model.homeTeamMatches} {fixture.home.shortName} games · {model.awayTeamMatches} {fixture.away.shortName} games
        · {model.trainingCompetitions.length} source leagues
      </div>
      <div className="fh-club-signals">
        {([["home",fixture.home.shortName,home],["away",fixture.away.shortName,away]] as const).map(([side,name,s])=>
          <section className="fh-club-signal" key={side}>
            <div className="fh-club-signal-title"><strong>{name}</strong><span>{side==="home"?"HOME ATTACK":"AWAY ATTACK"}</span></div>
            <div className="fh-club-signal-metrics">
              <div><small>1H scored / game</small><b>{s!.recentFirstHalfScored.toFixed(2)}</b></div>
              <div><small>1H allowed / game</small><b>{s!.recentFirstHalfAllowed.toFixed(2)}</b></div>
              <div><small>Attack index</small><b>{s!.attackIndex.toFixed(2)}×</b></div>
              <div><small>Defensive leak</small><b>{s!.defensiveVulnerability.toFixed(2)}×</b></div>
            </div>
            <small className="fh-club-signal-footer">Last {s!.recentSample} verified 1H games · Attack &amp; defense indexed vs opponent/league baseline. Above 1.00× defensive leak = more goals conceded than expected.</small>
          </section>)}
      </div>
      <div className="first-half-expected">
        <div><small>{fixture.home.shortName} expected 1H</small><strong>{model.expectedHomeGoals.toFixed(2)}</strong></div>
        <div><small>Combined expected 1H</small><strong>{(model.expectedHomeGoals+model.expectedAwayGoals).toFixed(2)}</strong></div>
        <div><small>{fixture.away.shortName} expected 1H</small><strong>{model.expectedAwayGoals.toFixed(2)}</strong></div>
      </div>
      <div className="first-half-market-list">{model.markets.map(m=>
        <div className="first-half-market-row" key={m.key}>
          <span>{m.label}</span>
          <div><strong>{(m.probability*100).toFixed(1)}%</strong>
            <div className="prob-track"><i className="home" style={{width:(m.probability*100).toFixed(1)+"%"}}/></div>
          </div>
        </div>)}</div>
      <div className="first-half-scores"><span>Likeliest half-time scorelines</span><div>
        {model.halfTimeScores.map(s=><span key={s.score}><b>{s.score}</b><small>{(s.probability*100).toFixed(1)}%</small></span>)}
      </div></div>
      <div className="fh-training-sources"><strong>Evidence from prior competitions</strong>
        <div>{model.trainingCompetitions.slice(0,9).map(c=>
          <span key={c.name}>{c.name} <b>{c.matches.toLocaleString()}</b></span>)}</div>
      </div>
    </>}
    <div className="fh-season-coverage">
      <strong>Verified halftime coverage</strong>
      {seasons.length?<div className="fh-season-grid">{seasons.map(([year,counts])=>
        <div key={year}><b>{year}</b><span>{counts.valid} / {counts.completed}</span></div>)}</div>:
        <small>{loading?"Downloading club history…":coverage.validHalfTime+
          " eligible verified halftime records in local history."}</small>}
      {pull.uefa?.coverage?<small>
        ESPN UEFA event check: {pull.uefa.coverage.verifiedHalftimeScores} verified halftime records
        from {pull.uefa.coverage.previousCompletedMatchesForTeams} prior completed games for these clubs.
      </small>:null}
    </div>
    <p className="first-half-foot">
      Cross-league Poisson v2 uses actual first-half goals scored and conceded, opponent-adjusted attack/defense,
      home/away splits, recency and league normalization. No future results, no invented HT scores.
      UEFA data may remain sparse; these experimental estimates are not independently calibrated or bookmaker prices.
    </p>
  </Panel>;
}
