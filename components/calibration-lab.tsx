"use client";

import { useEffect, useState } from "react";
import { useLocalMatchHistoryStatus } from "@/lib/use-local-history";
import { runHistoricalBacktest, type HistoricalMatch } from "@/lib/history";
import { getHistoricalMatches, importHistoricalMatches } from "@/lib/history-store";
import { validateFirstHalfMultiSeason } from "@/lib/first-half-validation";
import { fullTimeCalibrationSamples, firstHalfSamplesForCompetition } from "@/lib/calibration-sources";
import {
  evaluateCalibrationGroups, readCalibrationProfile, saveApprovedCalibrations,
  type CalibrationDecision,
} from "@/lib/out-of-sample-calibration";
import { Metric, Notice, Panel, PanelHead } from "./ui";

const LEAGUES=[
  "Premier League","La Liga","Bundesliga","Serie A","Ligue 1",
  "Champions League","Europa League","UEFA Conference League","UEFA Women's Champions League",
];
const UEFA_HISTORY:Record<string,string>={
  "Champions League":"uefa.champions","Europa League":"uefa.europa","UEFA Conference League":"uefa.europa.conf",
};
const DOMESTIC_HISTORY=["eng.1","esp.1","ger.1","ita.1","fra.1","nl.1","por.1","bel.1","tur.1","gre.1","sco.1"];
async function importCalibrationHistory(url:string,label:string,issues:string[]){
  try{
    const response=await fetch(url);
    const payload=await response.json() as {matches?:HistoricalMatch[];error?:string;errors?:string[];warnings?:string[]};
    if(!response.ok||!payload.matches?.length)throw new Error(payload.error||"No verified matches returned");
    await importHistoricalMatches(payload.matches);
    if(payload.errors?.length)issues.push(label+": partial provider coverage ("+payload.errors.length+" failed months).");
  }catch(cause){issues.push(label+": "+String(cause instanceof Error?cause.message:cause));}
}
const short=(n:number|null)=>(n===null?"—":n.toFixed(3));
const sleep=()=>new Promise<void>(resolve=>setTimeout(resolve,16));

export function CalibrationLab(){
  const {matches,ready,syncing,error}=useLocalMatchHistoryStatus();
  const [league,setLeague]=useState("all");
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState("");
  const [decisions,setDecisions]=useState<CalibrationDecision[]>([]);
  const [warnings,setWarnings]=useState<string[]>([]);
  const [savedCount,setSavedCount]=useState<number|null>(null);
  const [active,setActive]=useState(0);
  useEffect(()=>{setActive(readCalibrationProfile()?.corrections.length??0);},[]);

  async function validateAndApply(){
    if(!ready||running||!matches.length)return;
    setRunning(true);setDecisions([]);setWarnings([]);setSavedCount(null);
    const competitions=league==="all"?LEAGUES:[league];
    const reviewed:CalibrationDecision[]=[];
    const issues:string[]=[];
    try{
      let history=matches;
      if(competitions.some(c=>UEFA_HISTORY[c])){
        setProgress("Importing verified domestic club history for UEFA calibration");
        for(const id of DOMESTIC_HISTORY){
          await importCalibrationHistory("/api/historical/halftime?league="+id,id,issues);
        }
        const year=new Date().getUTCFullYear();
        for(const competition of competitions.filter(c=>UEFA_HISTORY[c])){
          for(let y=year-3;y<=year;y++){
            setProgress("Importing "+competition+" · "+y);
            await importCalibrationHistory("/api/historical/espn?league="+UEFA_HISTORY[competition]+"&year="+y,competition+" "+y,issues);
          }
        }
        history=await getHistoricalMatches();
        window.dispatchEvent(new Event("migo:history"));
      }
      for(const competition of competitions){
        setProgress("Validating "+competition+" · full-time goals and match outcomes");
        await sleep();
        const rows=history.filter(m=>m.competition===competition);
        if(rows.length<150){
          issues.push(competition+": fewer than 150 completed matches; cannot independently validate all markets.");
          continue;
        }
        const completed=[...new Map(rows.map(m=>[m.id,m])).values()]
          .sort((a,b)=>a.date.localeCompare(b.date));
        const result=runHistoricalBacktest(completed,{
          market:"best-pick",threshold:.68,iterations:1000,seed:"calibration-oos",trainingFraction:.2,
        });
        const ft=evaluateCalibrationGroups(fullTimeCalibrationSamples(result.predictions));
        reviewed.push(...ft);
        setProgress("Validating "+competition+" · first-half goals");
        await sleep();
        const ht=validateFirstHalfMultiSeason(history,competition,400);
        if(ht.scored){
          reviewed.push(...evaluateCalibrationGroups(firstHalfSamplesForCompetition(ht.samples,competition)));
        }else{
          issues.push(competition+": no qualifying independent first-half forecasts; 1H percentages stay raw.");
        }
        setDecisions([...reviewed]);
        setWarnings([...issues]);
      }
      // A correction is published ONLY if its chronologically later test
      // independently improves BOTH Brier and log-loss.
      const profile=saveApprovedCalibrations(reviewed);
      setSavedCount(reviewed.filter(d=>d.decision==="approved").length);
      setActive(profile?.corrections.length??0);
    }catch(cause){
      issues.push("Validation failed: "+String(cause instanceof Error?cause.message:cause));
      setWarnings(issues);
    }finally{setRunning(false);setProgress("");}
  }

  const checked=decisions.length;
  const approved=decisions.filter(d=>d.decision==="approved").length;
  const rejected=decisions.filter(d=>d.decision==="rejected").length;
  const insufficient=decisions.filter(d=>d.decision==="insufficient").length;
  return <div className="stack">
    <Panel>
      <PanelHead title="Out-of-sample calibration"
        meta="Train on earlier predictions · verify on later games · apply only passing markets"/>
      <div className="calibration-workspace">
        <div className="calibration-guide">
          <span><b>1</b> Older forecasts fit a restrained correction</span>
          <span><b>2</b> Later fixtures validate it</span>
          <span><b>3</b> A separate final period must improve Brier AND log-loss</span>
          <span><b>4</b> Passing market corrections become active for future fixtures only</span>
        </div>
        <label className="calibration-selector">Competition
          <select className="select" value={league} onChange={e=>setLeague(e.target.value)}>
            <option value="all">All supported competitions</option>
            {LEAGUES.map(name=><option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <button className="button button-primary" disabled={!ready||running||!matches.length}
          onClick={()=>{void validateAndApply();}}>
          {running?"Testing model markets…":"Validate & apply only passing markets"}
        </button>
        {running?<div className="calibration-progress" role="status">{progress}</div>:null}
        {!ready?<p className="first-half-foot">{syncing?
          "Importing real completed match history…":"Historical results not ready."}</p>:null}
        {error?<p className="first-half-foot">Data coverage: {error}</p>:null}
      </div>
    </Panel>
    {active>0&&savedCount===null?<Panel>
      <PanelHead title="Previously approved calibration" meta="Stored in this browser · applied to eligible future fixtures"/>
      <div className="calibration-workspace">
        <strong>{active} validated market corrections active</strong>
        <small>Re-run validation when new completed matches become available. Old saved paper predictions remain unchanged.</small>
      </div>
    </Panel>:null}
    {savedCount!==null?<Panel>
      <PanelHead title="Calibration verdict"
        meta="Results saved locally · future model views automatically use approved corrections"/>
      <div className="calibration-summary">
        <Metric label="Market tests" value={checked.toString()}/>
        <Metric label="Approved" value={approved.toString()}/>
        <Metric label="Rejected" value={rejected.toString()}/>
        <Metric label="Insufficient" value={insufficient.toString()}/>
      </div>
      <p className="first-half-foot">
        {savedCount} independently passing corrections activated in this run;
        {active} total currently active in this browser. A failed re-test revokes an earlier correction.
        Raw probabilities remain for every unapproved market. A saved paper pick is never overwritten.
      </p>
    </Panel>:null}
    {warnings.length?<Notice>{warnings.slice(0,8).join(" · ")}</Notice>:null}
    {checked?<Panel>
      <PanelHead title="Market-by-market verdict"
        meta="Final untouched period · lower Brier / log-loss indicates better probability quality"/>
      <div className="calibration-table">
        <div className="calibration-row calibration-head">
          <span>Market</span><span>Gate</span><span>Raw Brier</span><span>Adjusted</span><span>Test N</span>
        </div>
        {decisions.map(d=><div className="calibration-row" key={d.competition+d.market}>
          <span><small>{d.competition}</small><strong>{d.market}</strong></span>
          <span className={"calibration-verdict "+d.decision}>{d.decision.toUpperCase()}</span>
          <span>{short(d.rawBrier)}</span><span>{short(d.calibratedBrier)}</span>
          <span>{d.correction?.nTest??"—"}</span>
        </div>)}
      </div>
    </Panel>:null}
    <p className="first-half-foot">
      This is historical probability validation, not a guarantee of wins or profitable odds.
      The calibration test never changes the raw score-generation engine or historical saved picks.
      Calibrated first-half and full-time markets remain separate; dependent 1X2/double-chance probabilities are kept consistent.
    </p>
  </div>;
}
