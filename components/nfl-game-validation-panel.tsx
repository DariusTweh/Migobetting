"use client";
import {useState} from "react";
import {Activity,BarChart3,CheckCircle2,RefreshCw,ShieldAlert} from "lucide-react";
import type {NflGameValidation} from "@/lib/nfl/game-validation";
const num=(x:number|null,d=3)=>x===null?"—":x.toFixed(d);
export function NflGameValidationPanel(){
 const [result,setResult]=useState<NflGameValidation|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 async function run(){
  if(loading)return;
  setLoading(true);setError("");
  try{
   const response=await fetch("/api/nfl/game-validation",{cache:"no-store"});
   const json=await response.json() as NflGameValidation&{error?:string};
   if(!response.ok||json.error)throw Error(json.error||"Game market evaluation is unavailable");
   setResult(json);
  }catch(e){setError(e instanceof Error?e.message:"Unable to validate NFL markets");}
  finally{setLoading(false);}
 }
 return <section className="nm-game-validation">
   <div className="nm-section-header">
    <div><div className="nm-eyebrow">HISTORICAL TRAINING / PROSPECTIVE GATE</div>
     <h2>NFL game market evaluation</h2>
     <p>Training data: 2023–2025 · true held-out 2026 games before the current week</p></div>
    <button onClick={run} className="nm-link-outline" disabled={loading}>
     {loading?<RefreshCw className="nm-spin" size={16}/>:<BarChart3 size={16}/>}
     {loading?"Validating completed weeks…":"Evaluate moneyline / spreads / totals"}</button>
   </div>
   {error?<div className="nm-info-strip nm-danger"><ShieldAlert size={18}/><p>{error}</p></div>:null}
   {!result?<div className="nm-card"><div className="nm-empty-inner">
    <strong>No market calibration has been activated.</strong>
    <p>The model can fit scoring parameters from completed seasons. This test separately scores its moneyline, spread and total predictions against held-out 2026 results.</p>
   </div></div>:<>
    <div className="nm-stats-grid">
     <div className="nm-data-stat"><small>TRAINING GAMES</small><strong>{result.historicalTrainingGames.toLocaleString()}</strong><span>2023–2025</span></div>
     <div className="nm-data-stat"><small>HELD-OUT GAMES</small><strong>{result.gamesEvaluated}</strong><span>2026 through Week {result.lastGradedWeek??"—"}</span></div>
     <div className="nm-data-stat"><small>MARKETS GRADED</small><strong>{result.marketsGraded.toLocaleString()}</strong><span>Independent threshold observations</span></div>
    </div>
    <section className="nm-card">
     <div className="nm-card-head"><div><h3>Held-out predictive error</h3><span>Lower Brier and log loss are better · uncalibrated research</span></div><span className="nm-stat-label">{result.status}</span></div>
     <div className="nm-game-validation-grid">
      <div><span>Overall raw Brier</span><strong>{num(result.overall.brier)}</strong></div>
      <div><span>Historical-frequency baseline</span><strong>{num(result.overall.baselineBrier)}</strong></div>
      <div><span>Log loss</span><strong>{num(result.overall.logLoss)}</strong></div>
      <div><span>Expected calibration error</span><strong>{num(result.overall.ece)}</strong></div>
     </div>
     <div className="nm-game-validation-table"><table>
      <thead><tr><th>Market</th><th>Graded</th><th>Raw Brier</th><th>Baseline</th><th>Log loss</th></tr></thead>
      <tbody>{result.markets.map(m=><tr key={m.market}><td>{m.market}</td>
       <td>{m.metric.count.toLocaleString()}</td><td>{num(m.metric.brier)}</td><td>{num(m.metric.baselineBrier)}</td><td>{num(m.metric.logLoss)}</td></tr>)}</tbody>
     </table></div>
    </section>
    <section className="nm-card">
      <div className="nm-card-head"><div><h3>Learned scoring parameters</h3>
       <span>{result.model.status} · based on {result.model.trainingGames} chronological observations</span></div><CheckCircle2 size={19}/></div>
      <div className="nm-game-validation-grid">
       <div><span>League points per team</span><strong>{num(result.model.leaguePointsPerTeam,1)}</strong></div>
       <div><span>Recent form weight</span><strong>{Math.round(result.model.recencyWeight*100)}%</strong></div>
       <div><span>Home field effect</span><strong>{num(result.model.homeAdvantage,1)}</strong></div>
       <div><span>Scoring residual SD</span><strong>{num(result.model.scoreResidualStd,1)}</strong></div>
      </div>
    </section>
    <div className="nm-info-strip"><ShieldAlert size={18}/><p>
     RESEARCH ONLY: This analysis does not prove profitable betting probabilities or enable fair odds. It evaluates past 2026 games using completed earlier-week scores; injury and weather snapshots are not retrospectively reconstructed.
    </p></div>
   </>}
 </section>;
}
