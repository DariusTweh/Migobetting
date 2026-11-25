"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
 ArrowLeft, ArrowRight, Activity, AlertTriangle, BarChart3, Check, ChevronRight,
 Clipboard, Clock3, Layers3, ListFilter, RefreshCw, ShieldAlert, ShieldCheck, Target,
 TrendingUp, X
} from "lucide-react";
import type { NflGame, NflProp, NflMarket } from "@/lib/nfl/engine";
import type { NflSimulationSummary } from "@/lib/nfl/simulation";
import type { GameMarket, GameMarketReport, UnavailablePlayer } from "@/lib/nfl/game-markets";
type Preview = {
 game:NflGame; fetchedAt:string; props:NflProp[]; simulation?:NflSimulationSummary;
 gameMarkets?:GameMarketReport; unavailablePlayers?:UnavailablePlayer[];
 coverage?:{completedGames:number;playerLines:number;note:string};
 supplementalCoverage?:{stats:string;snaps:string;injuries:string;rosters?:string;schedules?:string;injuryRows:number;unavailableCount?:number;week?:number|null;season?:number|null;sourceWarnings?:string[]};
 error?:string;
};
type DetailTab = "overview"|"markets"|"players"|"injuries"|"method";
type MarketType = "moneyline"|"spread"|"total";
type Selected = {id:string;label:string;kind:"game"|"prop";market:string};
const formatKickoff=(date:string)=>new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",weekday:"long",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(date));
const fmt=(n:number|null|undefined,d=1)=>n===null||n===undefined?"—":n.toFixed(d);
const pct=(n:number|null|undefined)=>n===null||n===undefined?"—":(n*100).toFixed(1)+"%";
const groupLabel:Record<NflMarket,string>={passingYards:"Passing yards",passingTds:"Passing TDs",rushingYards:"Rushing yards",receivingYards:"Receiving yards",receptions:"Receptions"};
function TeamBadge({team}:{team:NflGame["home"]}){return <div className="nm-team-badge">
 <div className="nm-team-logo">{team.logo?<img src={team.logo} alt="" />:<span>{team.abbreviation}</span>}</div>
 <strong>{team.abbreviation}</strong><span>{team.name}</span><small>{team.record||"Record unavailable"}</small>
</div>;}
function RateBar({home,away}:{home:number;away:number}){return <div className="nm-rate-bar"><div style={{width:Math.max(0,Math.min(100,home*100))+"%"}}/><div style={{width:Math.max(0,Math.min(100,away*100))+"%"}}/></div>;}
function Uncalibrated(){return <span className="nm-uncalibrated"><Activity size={12}/> UNCALIBRATED</span>;}
function Stat({label,value,sub}:{label:string;value:string;sub?:string}){return <div className="nm-data-stat"><small>{label}</small><strong>{value}</strong>{sub?<span>{sub}</span>:null}</div>;}
export function NflMatchCenter({game}:{game:NflGame}){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [tab,setTab]=useState<DetailTab>("overview");
 const [market,setMarket]=useState<MarketType>("moneyline");
 const [propMarket,setPropMarket]=useState<NflMarket|"all">("all");
 const [showPass,setShowPass]=useState(false);
 const [selection,setSelection]=useState<Selected[]>([]);
 const [copied,setCopied]=useState(false);
 const [joint,setJoint]=useState<{rawModelJointRate:number;hitRuns:number;runs:number}|null>(null);
 const [jointBusy,setJointBusy]=useState(false);
 const [jointError,setJointError]=useState("");
 useEffect(()=>{
  let active=true;
  async function load(){
   try{
    const response=await fetch("/api/nfl?eventId="+encodeURIComponent(game.id),{cache:"no-store"});
    const result=await response.json() as Preview;
    if(!response.ok||result.error)throw Error(result.error||"Matchup data is unavailable");
    if(active)setPreview(result);
   }catch(e){if(active)setError(e instanceof Error?e.message:"Matchup could not be loaded");}
   finally{if(active)setLoading(false);}
  }
  void load();
  return ()=>{active=false;};
 },[game.id]);
 const markets=preview?.gameMarkets?.markets??[];
 const mlHome=markets.find(m=>m.market==="moneyline"&&m.side==="home");
 const mlAway=markets.find(m=>m.market==="moneyline"&&m.side==="away");
 const status=preview?.gameMarkets?.status;
 const simLookup=useMemo(()=>new Map((preview?.simulation?.props??[]).map(p=>[p.id,p])),[preview]);
 const playerProps=(preview?.props??[]).filter(p=>(showPass||p.grade==="RESEARCH")&&(propMarket==="all"||p.market===propMarket)).sort((a,b)=>{
  const x=simLookup.get(a.id)?.rawModelHitRate??-1,y=simLookup.get(b.id)?.rawModelHitRate??-1;
  return y-x || b.researchScore-a.researchScore;
 });
 const add=(item:Selected)=>{
  setJoint(null);setJointError("");setCopied(false);
  setSelection(old=>{
   if(old.some(p=>p.id===item.id))return old.filter(p=>p.id!==item.id);
   if(old.length>=6)return old;
   // Keep one market per player or market family; avoid contradictory legs in one local slip.
   if(item.kind==="prop"){
    const samePlayer=item.id.split(":").slice(0,2).join(":");
    return [...old.filter(p=>p.kind!=="prop"||p.id.split(":").slice(0,2).join(":")!==samePlayer),item];
   }
   return [...old.filter(p=>p.kind!=="game"||p.market!==item.market),item];
  });
 };
 const selected=(id:string)=>selection.some(p=>p.id===id);
 async function copySlip(){
  if(!selection.length)return;
  try{
   await navigator.clipboard.writeText("MIGO NFL RESEARCH SLIP — NOT BOOKMAKER ODDS\n"+
     game.away.abbreviation+" @ "+game.home.abbreviation+"\n"+
     selection.map((l,i)=>(i+1)+". "+l.label).join("\n")+
     "\nUncalibrated research, verify game-day injuries & offered prices. No proven mixed-market joint probability.");
   setCopied(true);
  }catch{setCopied(false);}
 }
 async function runJoint(){
  if(jointBusy||selection.length<2||selection.some(p=>p.kind==="game"))return;
  setJointBusy(true);setJointError("");setJoint(null);
  try{
   const response=await fetch("/api/nfl?"+new URLSearchParams({eventId:game.id,legs:selection.map(s=>s.id).join(",")}),{cache:"no-store"});
   const data=await response.json() as Preview;
   const result=data.simulation?.joint;
   if(!response.ok||!result)throw Error(data.error||"Unable to build joint result");
   setJoint(result);
  }catch(e){setJointError(e instanceof Error?e.message:"Joint analysis failed");}
  finally{setJointBusy(false);}
 }
 const total=preview?.gameMarkets?.totalProjected;
 const marketRows=markets.filter(m=>m.market===market);
 const bestProps=(preview?.props??[]).filter(p=>p.grade==="RESEARCH"&&simLookup.has(p.id))
  .sort((a,b)=>(simLookup.get(b.id)?.rawModelHitRate??0)-(simLookup.get(a.id)?.rawModelHitRate??0)).slice(0,4);
 return <div className="nm-app nm-match">
  <div className="nm-breadcrumb"><Link href="/nfl"><ArrowLeft size={15}/> All NFL games</Link><ChevronRight size={13}/><span>{game.away.abbreviation} @ {game.home.abbreviation}</span></div>
  <section className="nm-match-hero">
   <div className="nm-hero-overline"><span className="nm-game-state nm-scheduled">{game.status==="scheduled"?"PRE-GAME":game.status.toUpperCase()}</span>
    <span>2026 NFL · WEEK {game.week??"—"}</span><Uncalibrated/></div>
   <div className="nm-hero-main"><TeamBadge team={game.away}/>
    <div className="nm-hero-center">
      {game.status==="final"||game.status==="live"?<strong className="nm-live-score">{game.away.score??"–"} <span>:</span> {game.home.score??"–"}</strong>:
      <><div className="nm-score-caption">MODEL SCORE PROJECTION</div>
       <div className="nm-model-score"><strong>{fmt(preview?.gameMarkets?.awayProjected)}</strong><span>:</span><strong>{fmt(preview?.gameMarkets?.homeProjected)}</strong></div></>}
      <span className="nm-kickoff"><Clock3 size={13}/>{formatKickoff(game.kickoff)}</span>
      <small className="nm-hero-sub">{status==="PASS"?"GAME SCORE MODEL UNAVAILABLE":loading?"LOADING RESEARCH MODEL":"30,000 DRAWS · RESEARCH ONLY"}</small>
    </div><TeamBadge team={game.home}/></div>
   <div className="nm-hero-footer"><span><Activity size={14}/> ESPN fixture information</span><span>{game.spreadDetails?"Reference spread: "+game.spreadDetails:"No verified sportsbook spread"}</span><span>{game.overUnder!==undefined?"Listed total: "+game.overUnder:"Listed total unavailable"}</span></div>
  </section>
  <div className="nm-tabs" role="tablist" aria-label="NFL game analysis sections">
   {([["overview","Overview"],["markets","Game markets"],["players","Player props"],["injuries","Injury report"],["method","Model & data"]] as const).map(([id,label])=>
     <button role="tab" aria-selected={tab===id} type="button" className={tab===id?"active":""} key={id} onClick={()=>setTab(id)}>{label}</button>)}
  </div>
  {error?<div className="nm-error"><AlertTriangle size={18}/><div><strong>Unable to retrieve game research</strong><p>{error}</p></div></div>:null}
  {loading?<div className="nm-loading"><RefreshCw size={25} className="nm-spin"/><strong>Preparing matchup intelligence</strong><span>Collecting historical performance, roster status, team scoring and 30,000 simulated outcomes.</span></div>:null}
  {!loading&&preview?<div className="nm-analysis-grid"><div className="nm-analysis-body">
   {tab==="overview"?<>
    <div className="nm-section-header"><div><h2>Matchup outlook</h2><p>Quick-read research summary, then explore each market in detail.</p></div><Uncalibrated/></div>
    <div className="nm-stats-grid">
     <Stat label="MODEL COMBINED SCORE" value={fmt(total)} sub="expected points"/>
     <Stat label="MODEL MARGIN" value={fmt(preview.gameMarkets?.marginProjected)} sub={game.home.abbreviation+" minus "+game.away.abbreviation}/>
     <Stat label="HISTORICAL GAMES" value={preview.gameMarkets?.sampleGames?preview.gameMarkets.sampleGames.away+" / "+preview.gameMarkets.sampleGames.home:"—"} sub="away / home"/>
    </div>
    <section className="nm-card nm-win-model"><div className="nm-card-head"><div><h3>Win scenarios</h3><span>Full-time outcome from simulated team scores</span></div><Uncalibrated/></div>
     {status==="READY"&&mlHome&&mlAway?<><div className="nm-win-numbers"><div><small>{game.away.abbreviation}</small><strong>{pct(mlAway.rawRate)}</strong></div><div><small>{game.home.abbreviation}</small><strong>{pct(mlHome.rawRate)}</strong></div></div>
      <RateBar home={mlAway.rawRate} away={mlHome.rawRate}/>
      <p className="nm-detail-note">Raw simulated frequencies, not calibrated game-win probabilities. The model may leave a small probability of ties.</p>
      <button className="nm-text-action" onClick={()=>setTab("markets")}>Explore moneyline, spreads & totals <ArrowRight size={15}/></button></>:
      <p className="nm-detail-note">Game-score estimate unavailable: {preview.gameMarkets?.reason||"Insufficient input coverage"}.</p>}
    </section>
    <section className="nm-card"><div className="nm-card-head"><div><h3>Player opportunity spotlight</h3><span>Highest eligible raw model rates, not value-ranked picks</span></div><button className="nm-text-action" onClick={()=>setTab("players")}>All props <ArrowRight size={14}/></button></div>
      <div className="nm-spotlight-list">{bestProps.length?bestProps.map(p=>{
       const model=simLookup.get(p.id)!;
       return <div className="nm-spotlight-row" key={p.id}><span className="nm-avatar">{p.player.split(" ").map(n=>n[0]).slice(0,2).join("")}</span>
       <div><strong>{p.player}</strong><small>{p.label} · {p.position}</small></div>
       <div className="nm-spotlight-prob"><b>{pct(model.rawModelHitRate)}</b><span>RAW MODEL</span></div></div>;
      }):<p className="nm-detail-note">No player props pass the current evidence and availability gates.</p>}</div>
    </section>
    <section className="nm-card nm-injury-summary"><div className="nm-card-head"><div><h3>Availability watch</h3><span>Verified reserve/IR exclusions and source coverage</span></div><button className="nm-text-action" onClick={()=>setTab("injuries")}>Full report <ArrowRight size={14}/></button></div>
    <p><ShieldAlert size={17}/>{preview.unavailablePlayers?.length??0} listed unavailable players across both teams. An athlete absent from the report is not guaranteed active.</p>
    {preview.unavailablePlayers?.slice(0,4).map(p=><div className="nm-injury-mini" key={p.team+":"+p.id}><span>{p.team}</span><strong>{p.name}</strong><em>{p.status}</em></div>)}
    </section>
   </>:null}
   {tab==="markets"?<>
    <div className="nm-section-header"><div><h2>Game markets</h2><p>Home/away, alt spread and total outcome frequencies. No sportsbook pricing.</p></div><Uncalibrated/></div>
    <div className="nm-market-switch">{([["moneyline","Moneyline"],["spread","Spread"],["total","Game total"]] as const).map(([id,label])=>
      <button key={id} className={market===id?"active":""} onClick={()=>setMarket(id)}>{label}</button>)}</div>
    <section className="nm-card nm-market-panel">
     <div className="nm-card-head"><div><h3>{market==="moneyline"?"Match winner":market==="spread"?"Alternate handicaps":"Over / under"}</h3><span>Simulated frequency at each listed threshold</span></div><span className="nm-stat-label">RESEARCH LINES</span></div>
     {status==="READY"?<div className="nm-market-table">
      {marketRows.map(row=><button key={row.id} type="button" className={"nm-market-line "+(selected(row.id)?"is-added":"")} onClick={()=>add({id:row.id,label:row.label,kind:"game",market:row.market})}>
        <div><strong>{row.label}</strong><small>{row.market==="spread"?"Alternate half-point handicap":row.market==="total"?"Combined game points":"Full-time game winner"}</small></div>
        <span className="nm-market-rate">{pct(row.rawRate)}<small>raw model</small></span><span className="nm-market-add">{selected(row.id)?<Check size={18}/>:<span>+</span>}</span></button>)}
      </div>:<div className="nm-empty-inner">{preview.gameMarkets?.reason||"Game markets unavailable without adequate historical scoring coverage."}</div>}
    </section>
    <div className="nm-info-strip"><ShieldCheck size={16}/><p>Line thresholds shown here are simulated research alternatives. They are not live BetMGM prices, verified bookmaker offers, or calibrated probabilities.</p></div>
   </>:null}
   {tab==="players"?<>
    <div className="nm-section-header"><div><h2>Player projections</h2><p>Usage-driven NFL alternatives with uncertainty ranges and data-backed reasoning.</p></div><Uncalibrated/></div>
    <div className="nm-player-toolbar">
      <div className="nm-filter-wrap"><ListFilter size={16}/><select aria-label="Filter player market" value={propMarket} onChange={e=>setPropMarket(e.target.value as NflMarket|"all")}>
       <option value="all">All player markets</option>{Object.entries(groupLabel).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></div>
      <label className="nm-checkbox"><input type="checkbox" checked={showPass} onChange={e=>setShowPass(e.target.checked)}/> Show passes / unavailable</label>
    </div>
    <div className="nm-player-list">{playerProps.length?playerProps.map(p=>{
      const s=simLookup.get(p.id);const isEligible=p.grade==="RESEARCH"&&!!s;
      const max=Math.max(p.line*1.35,...p.recentValues,1);
      return <article className={"nm-player-card "+(isEligible?"":"nm-player-pass")} key={p.id}>
       <div className="nm-player-card-top"><div className="nm-player-name"><span className="nm-avatar">{p.player.split(" ").map(x=>x[0]).slice(0,2).join("")}</span>
        <div><strong>{p.player}</strong><span>{p.position} · {p.teamId===game.home.id?game.home.abbreviation:game.away.abbreviation}</span></div></div>
        <span className={"nm-prop-status "+(isEligible?"good":"pass")}>{isEligible?"RESEARCH":"PASS"}</span>
       </div>
       <div className="nm-player-main"><div><small>MARKET / THRESHOLD</small><strong>{p.label}</strong><span>Historical weighted mean: {fmt(p.projection)}</span></div>
        <div className="nm-player-prob"><strong>{s?pct(s.rawModelHitRate):"—"}</strong><small>RAW MODEL RATE</small></div></div>
       <div className="nm-player-metrics"><div><span>Simulated mean</span><strong>{s?fmt(s.simulatedMean):"—"}</strong></div><div><span>10th–90th range</span><strong>{s?fmt(s.p10,0)+"–"+fmt(s.p90,0):"—"}</strong></div><div><span>Recent cleared</span><strong>{p.historicalHits}/{p.sampleGames}</strong></div></div>
       <div className="nm-form"><div><span>RECENT GAME LOG</span><small>last {p.recentValues.length} listed</small></div>
        <div className="nm-form-bars">{p.recentValues.map((v,i)=><div key={i} title={String(v)}><span className={v>=p.line?"cleared":""} style={{height:Math.max(5,Math.min(100,100*v/max))+"%"}}/><small>{Math.round(v)}</small></div>)}</div></div>
       <details className="nm-prop-details"><summary>View usage & risk analysis <ChevronRight size={15}/></summary>
        <div className="nm-prop-evidence">{p.evidence.map((e,i)=><p key={i}><Check size={13}/>{e}</p>)}{p.risks.map((e,i)=><p key={"r"+i}><AlertTriangle size={13}/>{e}</p>)}</div></details>
       <button type="button" className={"nm-add-button "+(selected(p.id)?"selected":"")} disabled={!isEligible} onClick={()=>add({id:p.id,label:p.player+" · "+p.label,kind:"prop",market:p.market})}>
        {selected(p.id)?<><Check size={16}/> In research slip</>:<><span>+</span> Add to research slip</>}</button>
      </article>;
    }):<div className="nm-empty-inner">No eligible player markets for these filters. An unavailable or unverified player may be intentionally excluded.</div>}</div>
   </>:null}
   {tab==="injuries"?<>
    <div className="nm-section-header"><div><h2>Injuries & roster status</h2><p>Availability is checked before a player can receive an eligible projection.</p></div><span className="nm-stat-label">INJURY GATE ACTIVE</span></div>
    <div className="nm-info-strip nm-danger"><ShieldAlert size={17}/><p>IR/reserve/unavailable statuses block player props. Week-specific reports may be missing or change before kickoff. No injury listing does not mean confirmed active.</p></div>
    <section className="nm-card"><div className="nm-card-head"><div><h3>Confirmed exclusions</h3><span>From available roster statuses and source-linked official reports</span></div><span className="nm-stat-label">{preview.unavailablePlayers?.length??0} PLAYERS</span></div>
     {preview.unavailablePlayers?.length?<div className="nm-injury-table">{preview.unavailablePlayers.map(p=><div key={p.team+":"+p.id}><span className="nm-injury-tag">{p.team}</span><div><strong>{p.name}</strong><small>{p.source}</small></div><span className="nm-prop-status pass">{p.status}</span></div>)}</div>:<p className="nm-detail-note">No matching confirmed exclusion returned. Official game-day active rosters are not yet connected.</p>}
    </section>
    <section className="nm-card nm-source-card"><div className="nm-card-head"><div><h3>Source coverage</h3></div></div>
      {Object.entries({PlayerStats:preview.supplementalCoverage?.stats,OffensiveSnaps:preview.supplementalCoverage?.snaps,Injuries:preview.supplementalCoverage?.injuries,RosterStatus:preview.supplementalCoverage?.rosters,ScheduledScores:preview.supplementalCoverage?.schedules}).map(([k,v])=>
       <div className="nm-source-row" key={k}><span>{k.replace(/([a-z])([A-Z])/g,"$1 $2")}</span><strong className={v==="available"?"good":""}>{v??"unknown"}</strong></div>)}
      <p className="nm-detail-note">Week {preview.supplementalCoverage?.week??"?"} · Injury report rows: {preview.supplementalCoverage?.injuryRows??0}. Source: nflverse with documented official exceptions.</p>
    </section>
   </>:null}
   {tab==="method"?<>
    <div className="nm-section-header"><div><h2>Model methodology</h2><p>What goes into the forecast and which outputs are not production-ready.</p></div><Uncalibrated/></div>
    <section className="nm-card"><div className="nm-card-head"><div><h3>Research model status</h3><span>Data quality and transparency</span></div></div>
     <div className="nm-method-grid"><Stat label="PLAYER TRIALS" value={preview.simulation?.runs.toLocaleString()??"—"}/><Stat label="GAME TRIALS" value={preview.gameMarkets?.runs.toLocaleString()??"—"}/><Stat label="PROP SAMPLE LINES" value={String(preview.coverage?.playerLines??0)}/></div>
     <div className="nm-method-list">{[...(preview.simulation?.assumptions??[]),...(preview.gameMarkets?.notes??[]),...(preview.simulation?.limitations??[])].map((v,i)=><p key={i}><span>{String(i+1).padStart(2,"0")}</span>{v}</p>)}</div>
    </section>
    <div className="nm-info-strip"><ShieldCheck size={18}/><p>Historical out-of-sample calibration is available separately. The game-score model and player-prop engine are still separate samplers; mixed-market joint pricing remains disabled.</p></div>
    <Link href="/nfl/validation" className="nm-callout-link">Explore the historical calibration dashboard <ArrowRight size={16}/></Link>
   </>:null}
  </div>
  <aside className="nm-slip">
   <div className="nm-slip-head"><div><span>MIGO / PAPER RESEARCH</span><h3>My slip <b>{selection.length}/6</b></h3></div><Clipboard size={20}/></div>
   <div className="nm-slip-body">{selection.length?selection.map((s,i)=><div key={s.id} className="nm-slip-leg">
      <span>{String(i+1).padStart(2,"0")}</span><div><strong>{s.label}</strong><small>{s.kind==="game"?"GAME MARKET":"PLAYER PROP"}</small></div>
      <button aria-label={"Remove "+s.label} onClick={()=>add(s)}><X size={15}/></button></div>):
     <div className="nm-slip-empty"><Layers3 size={25}/><strong>Build your research slip</strong><p>Tap a game market or eligible player prop to add it here.</p></div>}
   </div>
   {selection.length?<div className="nm-slip-actions">
    <button onClick={copySlip}><Clipboard size={15}/>{copied?"Copied":"Copy selections"}</button>
    <button disabled={selection.length<2||jointBusy||selection.some(s=>s.kind==="game")} onClick={runJoint}><Target size={15}/>{jointBusy?"Simulating…":"Analyze player-only joint"}</button>
    {selection.some(s=>s.kind==="game")?<p className="nm-slip-limit">Mixed game + player joint probability is not currently validated.</p>:null}
    {joint?<p className="nm-slip-result">Model joint: {pct(joint.rawModelJointRate)} ({joint.hitRuns.toLocaleString()}/{joint.runs.toLocaleString()} draws). Uncalibrated.</p>:null}
    {jointError?<p className="nm-slip-limit">{jointError}</p>:null}
   </div>:null}
   <div className="nm-slip-foot"><ShieldCheck size={14}/> No book prices · no guaranteed picks</div>
  </aside>
 </div>:null}
 </div>;
}
