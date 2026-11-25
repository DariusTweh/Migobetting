import type { NflMarket, NflGame } from "./engine";
import { rankNflProps } from "./engine";
import {
  applyNflverseIntelligence, canonicalNflTeam, defensiveVolume, weeklyBoxLinesForMatchup,
  type NflverseSnapshot, type WeeklyUsage, type SnapRecord,
} from "./nflverse";
import { NFL_SIM_VERSION, simulateNflMatchup } from "./simulation";

/**
 * Chronological retrospective NFL validation.
 * Every game at week w sees ONLY weeks < w. This evaluates the scenario
 * research model, NOT a frozen prospective prediction or bookmaker edge.
 * Week-specific past injuries, historical sportsbook spreads and weather are
 * not reconstructed. No live probability is calibrated from this report.
 */
export const NFL_VALIDATION_VERSION = "nfl-walk-forward-diagnostic-v1";
export type NflGradedPrediction = {
  season: number; week: number; gameId: string; athleteId: string;
  market: NflMarket; line: number; raw: number; historicalBaseline: number; result: 0 | 1;
};
export type NflScore = {
  count: number; brier: number | null; logLoss: number | null;
  observedRate: number | null; meanPredicted: number | null; ece: number | null;
};
export type NflCalibrationBin = {
  low: number; high: number; count: number; predicted: number | null;
  observed: number | null; trainedMapping: number;
};
export type NflMarketValidation = {
  market: NflMarket | "ALL"; trainCount: number; testCount: number;
  uncalibrated: NflScore; priorHitRateBaseline: NflScore;
  researchCalibrated: NflScore | null; trainBins: NflCalibrationBin[];
  status: "INSUFFICIENT_EVIDENCE" | "RESEARCH_IMPROVEMENT" | "DO_NOT_USE";
  explanation: string;
};
export type NflValidationReport = {
  version: string; modelVersion: string; season: number;
  status: "COMPLETED" | "INSUFFICIENT_DATA";
  deploymentGate: "RESEARCH_ONLY";
  trainingWeeks: number[]; heldoutWeeks: number[]; gamesEvaluated: number;
  gamesPassed: number; predictionsGraded: number; simulationsPerGame: number;
  overall: NflMarketValidation; markets: NflMarketValidation[];
  integrity: {
    chronologicalInputs: true; contemporaryInjurySnapshot: false;
    historicalSpreadAvailable: false; archivedAtKickoff: false;
    marketOddsCompared: false;
  };
  notes: string[];
};
const MARKETS: NflMarket[] = ["passingYards", "passingTds", "rushingYards", "receivingYards", "receptions"];
const clamp = (v: number, min=0, max=1) => Math.max(min,Math.min(max,v));
const round = (v:number) => Math.round(v*10000)/10000;
function score(rows: NflGradedPrediction[], probability: (row:NflGradedPrediction)=>number): NflScore {
  if (!rows.length) return {count:0,brier:null,logLoss:null,observedRate:null,meanPredicted:null,ece:null};
  let brier=0,logLoss=0,actual=0,predicted=0;
  const bins = Array.from({length:10},()=>({n:0,actual:0,pred:0}));
  for (const row of rows) {
    const p=clamp(probability(row),.00001,.99999), y=row.result;
    brier+=(p-y)*(p-y);
    logLoss-=y*Math.log(p)+(1-y)*Math.log(1-p);
    actual+=y;predicted+=p;
    const b=bins[Math.min(9,Math.floor(p*10))];
    b.n++;b.actual+=y;b.pred+=p;
  }
  const ece=bins.reduce((acc,b)=>acc+(b.n ? b.n/rows.length*Math.abs(b.actual/b.n-b.pred/b.n):0),0);
  return {
    count:rows.length,brier:round(brier/rows.length),logLoss:round(logLoss/rows.length),
    observedRate:round(actual/rows.length),meanPredicted:round(predicted/rows.length),ece:round(ece),
  };
}
function fitIsotonic(train:NflGradedPrediction[]) {
  const nBins=5, priorStrength=24;
  const bins=Array.from({length:nBins},(_,i)=>({
    low:i/nBins,high:(i+1)/nBins,count:0,hits:0,predSum:0,center:(i+.5)/nBins,
  }));
  for(const row of train) {
    const b=bins[Math.min(nBins-1,Math.floor(clamp(row.raw)*nBins))];
    b.count++;b.hits+=row.result;b.predSum+=row.raw;
  }
  // The prior prevents small historical samples making bins 0% or 100%.
  const stack:Array<{lo:number;hi:number;weight:number;value:number}>=[];
  for(let i=0;i<nBins;i++){
    const b=bins[i];
    const weight=b.count+priorStrength;
    const value=(b.hits+priorStrength*b.center)/weight;
    stack.push({lo:i,hi:i,weight,value});
    while(stack.length>1 && stack[stack.length-2].value>stack[stack.length-1].value){
      const right=stack.pop()!,left=stack.pop()!;
      const total=left.weight+right.weight;
      stack.push({lo:left.lo,hi:right.hi,weight:total,
        value:(left.value*left.weight+right.value*right.weight)/total});
    }
  }
  const mapped=new Array<number>(nBins).fill(0);
  for(const block of stack)for(let i=block.lo;i<=block.hi;i++)mapped[i]=block.value;
  const result:NflCalibrationBin[]=bins.map((b,i)=>({
    low:b.low,high:b.high,count:b.count,
    predicted:b.count?round(b.predSum/b.count):null,
    observed:b.count?round(b.hits/b.count):null,trainedMapping:round(mapped[i]),
  }));
  return {bins:result,apply:(p:number)=>mapped[Math.min(nBins-1,Math.floor(clamp(p)*nBins))]};
}
function marketReport(market:NflMarket|"ALL",train:NflGradedPrediction[],test:NflGradedPrediction[]):NflMarketValidation {
  const baseline=score(test,r=>r.historicalBaseline),raw=score(test,r=>r.raw);
  const enough=train.length>=60 && test.length>=30 &&
    train.filter(r=>r.result===1).length>=10 && train.filter(r=>r.result===0).length>=10;
  const trained=fitIsotonic(train);
  const calibrated=enough?score(test,r=>trained.apply(r.raw)):null;
  // Diagnostic gate only. Retrospective improvements never automatically
  // promote live or model-fair probabilities.
  const improved=enough && calibrated!.brier!==null && raw.brier!==null &&
    calibrated!.brier<=raw.brier-.002 && calibrated!.logLoss!==null &&
    raw.logLoss!==null && calibrated!.logLoss<=raw.logLoss+.01;
  return {market,trainCount:train.length,testCount:test.length,
    uncalibrated:raw,priorHitRateBaseline:baseline,researchCalibrated:calibrated,
    trainBins:trained.bins,status:!enough?"INSUFFICIENT_EVIDENCE":improved?"RESEARCH_IMPROVEMENT":"DO_NOT_USE",
    explanation:!enough?"Too few independent chronological predictions for market-level recalibration.":
      improved?"Research mapping improved heldout Brier; requires separate forward-season confirmation.":
      "Heldout scoring did not improve enough to justify a calibrated mapping."};
}
type Fixture = {id:string;season:number;week:number;away:string;home:string;rows:WeeklyUsage[]};
/** Match fixture names must be verified against participant team and opponent. */
export function extractHistoricalFixtures(players:WeeklyUsage[],season:number):Fixture[]{
  const groups=new Map<string,WeeklyUsage[]>();
  for(const row of players){
    if(row.season!==season || !row.gameId)continue;
    groups.set(row.gameId,[...(groups.get(row.gameId)??[]),row]);
  }
  const fixtures:Fixture[]=[];
  for(const [id,rows] of groups){
    const parts=id.split("_");
    if(parts.length!==4 || Number(parts[0])!==season || !/^\d{1,2}$/.test(parts[1]))continue;
    const week=Number(parts[1]),away=canonicalNflTeam(parts[2]),home=canonicalNflTeam(parts[3]);
    if(!week || week>22 || away===home)continue;
    const teams=new Set(rows.map(r=>r.team));
    const allAgree=rows.every(r=>r.week===week &&
      (r.team===away&&r.opponent===home || r.team===home&&r.opponent===away));
    if(!teams.has(home) || !teams.has(away) || !allAgree)continue;
    fixtures.push({id,season,week,away,home,rows});
  }
  return fixtures.sort((a,b)=>a.week-b.week || a.id.localeCompare(b.id));
}
function retrospectiveGame(fixture:Fixture):NflGame {
  return {
    id:fixture.id,season:fixture.season,week:fixture.week,
    kickoff:"",status:"final",statusLabel:"Historical replay",
    home:{id:fixture.home,name:fixture.home,abbreviation:fixture.home},
    away:{id:fixture.away,name:fixture.away,abbreviation:fixture.away},
  };
}
function emptyMarket(market:NflMarket|"ALL"):NflMarketValidation {
  return marketReport(market,[],[]);
}
export function validateNflSeason(history:{
  season:number;players:WeeklyUsage[];snaps:SnapRecord[];
},options:{simulationsPerGame?:number;firstWeek?:number;lastWeek?:number}={}):NflValidationReport {
  const season=history.season,runs=options.simulationsPerGame??500;
  if(!Number.isInteger(runs)||runs<100||runs>2500)throw Error("Invalid diagnostic simulation count");
  const fixtures=extractHistoricalFixtures(history.players,season);
  const availableWeeks=[...new Set(fixtures.map(f=>f.week))].sort((a,b)=>a-b);
  // Most recent week may still be incomplete or present midweek.
  const finalWeek=options.lastWeek??Math.min(18,(availableWeeks.at(-1)??0)-1);
  const firstWeek=options.firstWeek??7;
  if(finalWeek<firstWeek+3) {
    return {version:NFL_VALIDATION_VERSION,modelVersion:NFL_SIM_VERSION,
      season,status:"INSUFFICIENT_DATA",deploymentGate:"RESEARCH_ONLY",trainingWeeks:[],
      heldoutWeeks:[],gamesEvaluated:0,gamesPassed:0,predictionsGraded:0,simulationsPerGame:runs,
      overall:emptyMarket("ALL"),markets:MARKETS.map(emptyMarket),
      integrity:{chronologicalInputs:true,contemporaryInjurySnapshot:false,
        historicalSpreadAvailable:false,archivedAtKickoff:false,marketOddsCompared:false},
      notes:["At least four fully available target weeks are needed; latest source week is excluded."]};
  }
  const activeWeeks=availableWeeks.filter(w=>w>=firstWeek && w<=finalWeek);
  const heldoutWeeks=activeWeeks.slice(-2),trainingWeeks=activeWeeks.slice(0,-2);
  if(heldoutWeeks.length<2 || trainingWeeks.length<2){
    return {version:NFL_VALIDATION_VERSION,modelVersion:NFL_SIM_VERSION,
      season,status:"INSUFFICIENT_DATA",deploymentGate:"RESEARCH_ONLY",
      trainingWeeks,heldoutWeeks,gamesEvaluated:0,gamesPassed:0,predictionsGraded:0,
      simulationsPerGame:runs,overall:emptyMarket("ALL"),markets:MARKETS.map(emptyMarket),
      integrity:{chronologicalInputs:true,contemporaryInjurySnapshot:false,
        historicalSpreadAvailable:false,archivedAtKickoff:false,marketOddsCompared:false},
      notes:["Insufficient sequential source weeks to separate calibration and heldout evaluation."]};
  }
  const trainingSet=new Set(trainingWeeks),heldoutSet=new Set(heldoutWeeks);
  const evaluations:NflGradedPrediction[]=[];
  let gamesEvaluated=0,gamesPassed=0;
  // As-of-week snapshots are computed once and shared across same-week games;
  // outcomes from fixture week and every later week are excluded.
  const snapshots=new Map<number,NflverseSnapshot>();
  for(const week of activeWeeks){
    const previous=history.players.filter(r=>r.week<week);
    const earlierSnaps=history.snaps.filter(r=>r.week<week);
    snapshots.set(week,{
      players:previous,snaps:earlierSnaps,injuries:[],defense:defensiveVolume(previous),
      coverage:{stats:"available",snaps:earlierSnaps.length?"available":"unavailable",
        injuries:"unavailable",season,week,statsRows:previous.length,snapsRows:earlierSnaps.length,
        injuryRows:0,attribution:"nflverse/nflverse-data (CC BY 4.0); retrospective"},
    });
  }
  for(const fixture of fixtures){
    if(!trainingSet.has(fixture.week)&&!heldoutSet.has(fixture.week))continue;
    const game=retrospectiveGame(fixture),snapshot=snapshots.get(fixture.week)!;
    const previous=weeklyBoxLinesForMatchup(game,snapshot.players);
    if(previous.length<10) {gamesPassed++;continue;}
    const props=applyNflverseIntelligence(game,rankNflProps(game,previous),snapshot);
    const model=simulateNflMatchup(game,snapshot,props,{runs,historicalReplay:true});
    if(model.status!=="READY"){gamesPassed++;continue;}
    gamesEvaluated++;
    const picks=new Map(props.map(p=>[p.id,p]));
    const outcomes=new Map(fixture.rows.map(r=>[r.team+":"+r.id,r]));
    for(const simulated of model.props){
      const prop=picks.get(simulated.id);
      if(!prop || prop.grade!=="RESEARCH")continue;
      const team=prop.teamId;
      const athleteId=prop.athleteId.replace(/^nflverse:/,"");
      const actual=outcomes.get(team+":"+athleteId);
      if(!actual)continue; // DNP is UNKNOWN; no fabricated zero.
      const value=actual[prop.market];
      if(!validOutcome(value))continue;
      evaluations.push({
        season,week:fixture.week,gameId:fixture.id,athleteId:prop.athleteId,
        market:prop.market,line:prop.line,raw:simulated.rawModelHitRate,
        historicalBaseline:clamp((prop.historicalHits+2)/(prop.sampleGames+4),.01,.99),
        result:value>=prop.line?1:0,
      });
    }
  }
  const train=evaluations.filter(r=>trainingSet.has(r.week));
  const test=evaluations.filter(r=>heldoutSet.has(r.week));
  const markets=MARKETS.map(market=>marketReport(market,
    train.filter(r=>r.market===market),test.filter(r=>r.market===market)));
  return {
    version:NFL_VALIDATION_VERSION,modelVersion:NFL_SIM_VERSION,season,
    status:test.length?"COMPLETED":"INSUFFICIENT_DATA",deploymentGate:"RESEARCH_ONLY",
    trainingWeeks,heldoutWeeks,gamesEvaluated,gamesPassed,
    predictionsGraded:evaluations.length,simulationsPerGame:runs,
    overall:marketReport("ALL",train,test),markets,
    integrity:{chronologicalInputs:true,contemporaryInjurySnapshot:false,
      historicalSpreadAvailable:false,archivedAtKickoff:false,marketOddsCompared:false},
    notes:[
      "Historical games are reconstructed from verified nflverse matchup IDs; no kickoff dates are invented.",
      "For each tested fixture, player/snap/matchup data is strictly limited to weeks earlier than that fixture.",
      "Outcomes from the heldout weeks are never used to fit the research calibration map.",
      "Retrospective nflverse data may include later corrections; this is not a frozen pre-kickoff forward record.",
      "Historical spreads, totals, inactive reports and weather are unavailable here; live model includes bounded market scenarios.",
      "Source rows missing the player or relevant stat are excluded instead of treated as zero.",
      "Historical validation concerns eligible, preselected alternate props only and may be affected by selection bias.",
      "Any improvement is a retrospective research signal only; no live calibrated odds are activated.",
    ],
  };
}
function validOutcome(value:unknown):value is number {
  return typeof value==="number"&&Number.isFinite(value);
}
