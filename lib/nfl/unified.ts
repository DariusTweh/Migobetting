import type {NflGame,NflProp} from "./engine";
import type {NflverseSnapshot,WeeklyUsage} from "./nflverse";
import {
  simulateGameMarkets, type GameMarket, type GameMarketReport,
} from "./game-markets";
import {
  simulateNflMatchup, type NflSimulationSummary, type NflTrialSnapshot,
} from "./simulation";

/**
 * Phase 5 shared-draw research simulation.
 * All prop outcomes and team scores are evaluated on the SAME indexed trial.
 * This is not an independently calibrated forecasting distribution or book quote.
 */
export const NFL_UNIFIED_VERSION="nfl-shared-game-state-v1";
export type UnifiedJoint={
  propIds:string[];marketIds:string[];
  runs:number;hitRuns:number;rawModelJointRate:number;
  modelStatus:"UNCALIBRATED";method:"SAME_GAME_TRIAL";
};
export type UnifiedReport={
  simulation:NflSimulationSummary;
  gameMarkets:GameMarketReport;
  mixedJoint:UnifiedJoint|null;
  sharedDraws:boolean;
  reason?:string;
};
const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));
const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const round=(x:number)=>Math.round(x*10000)/10000;
function makeRng(seed:number){
 let state=seed>>>0;
 return ()=>{state+=0x6D2B79F5;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;};
}
function gaussian(rng:()=>number){
 return Math.sqrt(-2*Math.log(Math.max(rng(),1e-12)))*Math.cos(2*Math.PI*rng());
}
function offensiveBaseline(rows:WeeklyUsage[],code:string,week:number){
 const candidates=rows.filter(r=>r.team===code&&r.week<week);
 const byWeek=new Map<number,WeeklyUsage[]>();
 for(const r of candidates)byWeek.set(r.week,[...(byWeek.get(r.week)??[]),r]);
 const recent=[...byWeek].sort((a,b)=>b[0]-a[0]).slice(0,6);
 const qbs=recent.map(([,entries])=>entries.filter(r=>r.position==="QB")
  .sort((a,b)=>(b.passingAttempts??0)-(a.passingAttempts??0))[0]).filter(Boolean);
 return {
  pass:mean(qbs.map(r=>r.passingYards??0))||240,
  passingTds:mean(qbs.map(r=>r.passingTds??0))||1.45,
  rush:mean(recent.map(([,entries])=>entries.reduce((v,r)=>v+(r.rushingYards??0),0)))||105,
 };
}
function marketWon(m:GameMarket,h:number,a:number){
 if(m.market==="moneyline")return m.side==="home"?h>a:a>h;
 if(m.market==="spread")return m.line!==null&&(m.side==="home"?h+m.line>a:a+m.line>h);
 if(m.market==="total")return m.line!==null&&(m.side==="over"?h+a>m.line:h+a<m.line);
 return false;
}
export function simulateUnifiedNfl(
 game:NflGame,snapshot:NflverseSnapshot,props:NflProp[],
 options:{runs?:number;seed?:number;propIds?:string[];marketIds?:string[]}={},
):UnifiedReport {
 const runs=options.runs??30000;
 const baseline=simulateGameMarkets(game,snapshot.scoredGames??[],
   snapshot.unavailable??[],snapshot.players,Math.min(250,runs),options.seed,false,
   snapshot.historicalScoring??[]);
 const selectedProps=options.propIds??[],selectedMarkets=options.marketIds??[];
 const unique=[...selectedProps,...selectedMarkets];
 if(unique.length>6||new Set(unique).size!==unique.length||
   selectedProps.some(p=>!props.some(r=>r.id===p&&r.grade==="RESEARCH")))
   throw Error("Invalid or unavailable joint research selection");
 const homeSeries=new Int16Array(runs),awaySeries=new Int16Array(runs);
 const rng=makeRng((options.seed??baseline.seed)^0x71a3745d);
 const propHits=new Map(selectedProps.map(id=>[id,new Uint8Array(runs)]));
 const homeCode=game.home.abbreviation,awayCode=game.away.abbreviation,week=game.week??0;
 const homeBase=offensiveBaseline(snapshot.players,homeCode,week),
       awayBase=offensiveBaseline(snapshot.players,awayCode,week);
 const eligibleMarketIds=new Set(baseline.markets.map(p=>p.id));
 if(selectedMarkets.some(p=>!eligibleMarketIds.has(p)))
   throw Error("Unrecognized or unavailable game market selected");
 let scoreDrawCount=0;
 const onTrial=baseline.status!=="READY"?undefined:(trial:NflTrialSnapshot)=>{
   const common=gaussian(rng)*2.9;
   const rawScore=(points:number,offense:NflTrialSnapshot["home"],base:typeof homeBase)=>{
     const yardsEffect=.032*(offense.passYards-base.pass)+.024*(offense.rushYards-base.rush);
     const tdEffect=2.0*(offense.passTds-base.passingTds);
     const paceEffect=(trial.pace-1)*points*.58;
     const scoringEffect=(trial.scoring-1)*4;
     return Math.round(clamp(points+yardsEffect+tdEffect+paceEffect+scoringEffect+common+gaussian(rng)*5.0,0,62));
   };
   let h=rawScore(baseline.homeProjected??22.5,trial.home,homeBase);
   let a=rawScore(baseline.awayProjected??22.5,trial.away,awayBase);
   if(h===a&&rng()>.006){
     if(rng()<clamp(.5+(h-a)/60,.35,.65))h=Math.min(65,h+3);
     else a=Math.min(65,a+3);
   }
   homeSeries[trial.index]=h;awaySeries[trial.index]=a;
   for(const [id,values] of propHits){
     const p=props.find(row=>row.id===id);
     if(p)values[trial.index]=(trial.propValues.get(id)??0)>=p.line?1:0;
   }
   scoreDrawCount++;
 };
 const simulation=simulateNflMatchup(game,snapshot,props,{
   runs,seed:options.seed, jointLegIds:selectedMarkets.length?[]:selectedProps,
   onTrial,
 });
 if(simulation.status!=="READY"||baseline.status!=="READY"||scoreDrawCount!==runs){
   return {simulation,gameMarkets:baseline,mixedJoint:null,sharedDraws:false,
     reason:simulation.status!=="READY"?simulation.reason:baseline.reason??"Shared trials were incomplete"};
 }
 const recalculated=baseline.markets.map(m=>{
   let hits=0;for(let i=0;i<runs;i++)if(marketWon(m,homeSeries[i],awaySeries[i]))hits++;
   return {...m,rawRate:round(hits/runs)};
 });
 const hMean=mean(Array.from(homeSeries)),aMean=mean(Array.from(awaySeries));
 const gameMarkets:GameMarketReport={...baseline,runs,markets:recalculated,
   homeProjected:Math.round(hMean*10)/10,
   awayProjected:Math.round(aMean*10)/10,
   totalProjected:Math.round((hMean+aMean)*10)/10,
   marginProjected:Math.round((hMean-aMean)*10)/10,
   notes:[
    "All game and player outcomes share one indexed 30,000-trial NFL game state.",
    "Team score shocks use sampled quarterback TDs, passing/rushing yardage, shared pace and same-game scoring conditions.",
    "Team-score injury point adjustments and game residual dispersion are research heuristics awaiting walk-forward calibration.",
    ...baseline.notes.filter(n=>!/Shared game-pace shocks/.test(n)),
   ],
 };
 let mixedJoint:UnifiedJoint|null=null;
 if(unique.length>=2){
   const selectedMarketsRows=recalculated.filter(m=>selectedMarkets.includes(m.id));
   let success=0;
   for(let i=0;i<runs;i++){
     if([...propHits.values()].every(row=>row[i]===1)&&
       selectedMarketsRows.every(m=>marketWon(m,homeSeries[i],awaySeries[i])))success++;
   }
   mixedJoint={propIds:selectedProps,marketIds:selectedMarkets,runs,hitRuns:success,
     rawModelJointRate:round(success/runs),modelStatus:"UNCALIBRATED",
     method:"SAME_GAME_TRIAL"};
 }
 return {simulation,gameMarkets,mixedJoint,sharedDraws:true};
}
