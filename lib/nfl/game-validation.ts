import {parseScheduleScores,simulateGameMarkets,type GameMarket,type PlayedGame} from "./game-markets";
import {trainNflScorePrior,type NflScoreTraining} from "./scoring-training";
import type {NflGame} from "./engine";

/**
 * Out-of-season validation for NFL game markets.
 * Hyperparameters are fit to 2023-25 ONLY; EVERY 2026 fixture is simulated
 * using only previous 2026 weeks. The most recent unfinished week is excluded
 * by the caller's target-week cutoff. No historical injury claims are made.
 */
export const NFL_SCORE_VALIDATION_VERSION="nfl-market-2026-heldout-v1";
export type ScoreMetric={
 count:number;brier:number|null;logLoss:number|null;ece:number|null;
 averageRaw:number|null;observedRate:number|null;baselineBrier:number|null;
};
export type ScoreMarketDiagnostic={
 market:"moneyline"|"spread"|"total";metric:ScoreMetric;
 status:"RESEARCH_ONLY";reason:string;
};
export type NflGameValidation={
 version:string;status:"COMPLETE"|"INSUFFICIENT_DATA";deploymentGate:"RESEARCH_ONLY";
 historicalTrainingGames:number;historicalTrainingSeasons:number[];
 completedCurrentSeasonGames:number;gamesEvaluated:number;marketsGraded:number;
 targetSeason:number;upcomingWeek:number;lastGradedWeek:number|null;
 model:NflScoreTraining;overall:ScoreMetric;markets:ScoreMarketDiagnostic[];
 limitations:string[];
};
type Row={p:number;y:0|1;base:number};
const round=(n:number)=>Math.round(n*10000)/10000;
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
function won(m:GameMarket,h:number,a:number):boolean {
 if(m.market==="moneyline")return m.side==="home"?h>a:a>h;
 if(m.market==="spread")return m.line!==null&&(m.side==="home"?h+m.line>a:a+m.line>h);
 return m.line!==null&&(m.side==="over"?h+a>m.line:h+a<m.line);
}
function metric(rows:Row[]):ScoreMetric {
 if(!rows.length)return {count:0,brier:null,logLoss:null,ece:null,averageRaw:null,observedRate:null,baselineBrier:null};
 let brier=0,logLoss=0,baseline=0,predict=0,observed=0;
 const bins=Array.from({length:10},()=>({n:0,pm:0,observed:0}));
 for(const row of rows){
  const p=clamp(row.p,.0001,.9999),b=clamp(row.base,.0001,.9999),y=row.y;
  brier+=(p-y)**2;baseline+=(b-y)**2;logLoss-=y*Math.log(p)+(1-y)*Math.log(1-p);
  predict+=p;observed+=y;
  const bucket=bins[Math.min(9,Math.floor(p*10))];
  bucket.n++;bucket.pm+=p;bucket.observed+=y;
 }
 const n=rows.length;
 const ece=bins.reduce((v,b)=>v+(b.n/n)*Math.abs((b.pm-b.observed)/Math.max(b.n,1)),0);
 return {count:n,brier:round(brier/n),logLoss:round(logLoss/n),ece:round(ece),
  averageRaw:round(predict/n),observedRate:round(observed/n),baselineBrier:round(baseline/n)};
}
function gameFixture(g:PlayedGame):NflGame{
 return {id:g.id,season:g.season,week:g.week,kickoff:"",status:"final",statusLabel:"Retrospective",
  home:{id:g.home,name:g.home,abbreviation:g.home},
  away:{id:g.away,name:g.away,abbreviation:g.away}};
}
function marketKey(m:GameMarket){return [m.market,m.side,m.line??"ML"].join(":");}
function baselineByLine(training:PlayedGame[]){
 const totals=new Map<string,{hits:number;n:number}>();
 const dummy:GameMarket[]=[];
 for(const market of ["moneyline","spread","total"] as const){
  const sides=market==="moneyline"?["home","away"]:
    market==="spread"?["home","away"]:["over","under"];
  const lines=market==="moneyline"?[null]:
    market==="spread"?[-13.5,-10.5,-7.5,-3.5,-.5,.5,3.5,7.5,10.5,13.5]:
    [30.5,35.5,40.5,45.5,50.5,55.5,60.5];
  for(const side of sides)for(const line of lines)dummy.push({
   id:"",market,side:side as GameMarket["side"],line,label:"",rawRate:0,
  });
 }
 for(const m of dummy){
  const tally={hits:0,n:training.length};
  for(const g of training)if(won(m,g.homeScore,g.awayScore))tally.hits++;
  totals.set(marketKey(m),tally);
 }
 return totals;
}
export function validateNflGameMarketArchive(
 schedule:Array<Record<string,string>>,targetSeason=2026,upcomingWeek=12,draws=250,
):NflGameValidation{
 if(!Number.isInteger(upcomingWeek)||upcomingWeek<2||upcomingWeek>22||
   !Number.isInteger(draws)||draws<100||draws>1000)throw Error("Invalid validation window");
 const years=[2023,2024,2025].filter(y=>y<targetSeason);
 const history=years.flatMap(season=>parseScheduleScores(schedule,season,23));
 const current=parseScheduleScores(schedule,targetSeason,upcomingWeek);
 const fitted=trainNflScorePrior(history);
 const baseline=baselineByLine(history);
 const entries=new Map<GameMarket["market"],Row[]>([
  ["moneyline",[]],["spread",[]],["total",[]],
 ]);
 let gamesEvaluated=0;
 for(const target of current){
  if(target.week<5)continue;
  // Strictly earlier weeks. Never use the target game's score, even
  // for teams who played earlier during the same calendar week.
  const past=current.filter(g=>g.week<target.week);
  const model=simulateGameMarkets(gameFixture(target),past,[],[],draws,undefined,true,history,fitted);
  if(model.status!=="READY")continue;
  gamesEvaluated++;
  for(const m of model.markets){
   const prior=baseline.get(marketKey(m));
   const base=prior?(prior.hits+2)/(prior.n+4):.5;
   entries.get(m.market)!.push({p:m.rawRate,y:won(m,target.homeScore,target.awayScore)?1:0,base});
  }
 }
 const all=[...entries.values()].flat();
 const markets=[...entries].map(([market,rows])=>({
  market,metric:metric(rows),status:"RESEARCH_ONLY" as const,
  reason:"2026 fully held out from scoring-prior fit; score probabilities remain uncalibrated.",
 }));
 return {
  version:NFL_SCORE_VALIDATION_VERSION,status:gamesEvaluated>=20?"COMPLETE":"INSUFFICIENT_DATA",
  deploymentGate:"RESEARCH_ONLY",
  historicalTrainingGames:history.length,historicalTrainingSeasons:years,
  completedCurrentSeasonGames:current.length,gamesEvaluated,marketsGraded:all.length,
  targetSeason,upcomingWeek,lastGradedWeek:current.length?Math.max(...current.map(g=>g.week)):null,
  model:fitted,overall:metric(all),markets,
  limitations:[
   "2023–2025 only are used to fit scoring-prior parameters. Every 2026 matchup is independently replayed from previous completed 2026 weeks.",
   "Evaluation excludes upcoming and in-progress NFL weeks; no same-week leakage into team form.",
   "No archive of official game-day injury designations, weather or individual replacement-QB confirmation; 2026 evaluation is score-only.",
   "Brier scores describe retrospective model quality, not guaranteed sportsbook profits, value or calibrated market probabilities.",
   "Model decisions can change when nflverse corrects historical game files. Prospective frozen predictions are still required.",
  ],
 };
}
