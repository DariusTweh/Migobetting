"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, RefreshCw, ShieldAlert } from "lucide-react";
import type { NflValidationReport, NflScore, NflMarketValidation } from "@/lib/nfl/validation";
const format = (value:number|null,digits=3) => value === null ? "—" : value.toFixed(digits);
const percent = (value:number|null) => value === null ? "—" : (value*100).toFixed(1)+"%";
function Metric({name,metric}: {name:string,metric:NflScore}) {
  return <div className="nfl-cal-metric"><span>{name}</span><strong>{format(metric.brier)}</strong>
    <small>Log loss {format(metric.logLoss)} · ECE {percent(metric.ece)} · {metric.count} graded</small></div>;
}
function MarketRow({data}:{data:NflMarketValidation}){
  return <tr><td><strong>{data.market}</strong><small>{data.status.replaceAll("_"," ")}</small></td>
    <td>{data.trainCount}</td><td>{data.testCount}</td>
    <td>{format(data.uncalibrated.brier)}</td>
    <td>{format(data.priorHitRateBaseline.brier)}</td>
    <td>{format(data.researchCalibrated?.brier??null)}</td>
  </tr>;
}
export function NflValidationDashboard(){
  const [data,setData]=useState<NflValidationReport|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function run(){
    if(busy)return;
    setError("");setBusy(true);setData(null);
    try{
      const response=await fetch("/api/nfl/validation",{cache:"no-store"});
      const result=await response.json();
      if(!response.ok)throw Error(result.error??"Validation could not complete");
      setData(result as NflValidationReport);
    }catch(e){setError(e instanceof Error?e.message:"Validation unavailable");}
    finally{setBusy(false);}
  }
  return <div className="nfl-page">
    <header className="page-header">
      <div><div className="eyebrow">MIGO NFL Intelligence · Phase 4</div>
        <h1>Walk-forward validation</h1>
        <p>Measure what the NFL simulator predicted before each historical week, then compare against results that week.</p>
      </div>
      <div className="nfl-cal-actions">
        <Link href="/nfl" className="button"><ArrowLeft size={16}/> NFL Prop Lab</Link>
        <button className="button button-primary" disabled={busy} onClick={run}>
          {busy?<RefreshCw size={16} className="nfl-cal-spin"/>:<BarChart3 size={16}/>}
          {busy?"Evaluating historical games…":"Run historical evaluation"}
        </button>
      </div>
    </header>
    <div className="nfl-warning"><ShieldAlert size={18}/><div>
      <strong>RESEARCH ONLY · NO PRODUCTION CALIBRATION</strong>
      <div>Backtests are strictly ordered by NFL week. Historical market spreads, injuries and archived pregame snapshots are unavailable, so these are retrospective diagnostics rather than proof of betting accuracy. Live fair prices remain disabled.</div>
    </div></div>
    {error?<p role="alert" className="nfl-error">{error}</p>:null}
    {!data?<section className="panel nfl-cal-empty">
      <strong>{busy?"Running the historical evaluation":"Ready to evaluate 2026 NFL historical weeks"}</strong>
      <p>{busy?"Reading nflverse weekly game and participation records, replaying earlier-week scenarios and grading held-out weeks.":"Runs a bounded 500-draw simulation for each eligible historical fixture. A calibration map is fitted to earlier weeks, and the next two available completed weeks are held out."}</p>
    </section>:<>
      <section className="nfl-cal-stats">
        <div><span>Eligible historical games</span><strong>{data.gamesEvaluated}</strong></div>
        <div><span>Graded prop predictions</span><strong>{data.predictionsGraded}</strong></div>
        <div><span>Training weeks</span><strong>{data.trainingWeeks.join(", ")||"—"}</strong></div>
        <div><span>Held-out weeks</span><strong>{data.heldoutWeeks.join(", ")||"—"}</strong></div>
      </section>
      <section className="panel nfl-cal-panel">
        <div className="panel-head"><div><h2>Held-out scoring</h2><span>2026 season · validation status: {data.status} · deployment gate: {data.deploymentGate}</span></div></div>
        {data.overall.testCount?<>
          <div className="nfl-cal-metrics">
            <Metric name="Raw Monte Carlo" metric={data.overall.uncalibrated}/>
            <Metric name="Historical-hit baseline" metric={data.overall.priorHitRateBaseline}/>
            <Metric name="Research calibration, held out" metric={data.overall.researchCalibrated??{count:0,brier:null,logLoss:null,observedRate:null,meanPredicted:null,ece:null}}/>
          </div>
          <p className="nfl-footnote">Lower Brier/log loss is better. ECE estimates deviation of prediction buckets from observed frequencies. The fitted research map cannot be deployed from retrospective scores alone.</p>
          <p className="nfl-cal-status"><strong>{data.overall.status.replaceAll("_"," ")}</strong> — {data.overall.explanation}</p>
        </>:<p className="nfl-footnote">Insufficient verified held-out games: {data.notes[0]??"No score available"}.</p>}
      </section>
      <section className="panel nfl-cal-panel">
        <div className="panel-head"><div><h2>Market-level diagnostics</h2><span>Training-only mapping measured against held-out weeks</span></div></div>
        <div className="nfl-cal-table"><table><thead><tr><th>Market</th><th>Train</th><th>Test</th>
          <th>Raw Brier</th><th>Baseline Brier</th><th>Mapped Brier</th></tr></thead>
          <tbody>{data.markets.map(row=><MarketRow key={row.market} data={row}/>)}</tbody></table></div>
      </section>
      <section className="panel nfl-cal-panel"><div className="panel-head"><div><h2>Interpretation and safeguards</h2></div></div>
        <ul className="nfl-cal-notes">{data.notes.map((note,i)=><li key={i}>{note}</li>)}</ul>
        <p className="nfl-footnote">Model {data.modelVersion} · Diagnostic {data.version} · {data.simulationsPerGame} simulation draws per historical game.</p>
      </section>
    </>}
  </div>;
}
