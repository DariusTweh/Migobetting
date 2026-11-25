import type { PlayedGame } from "./game-markets";

/**
 * Fit *score-mean and residual-dispersion* hyperparameters on completed
 * historical games. These are NOT calibrated win probabilities. Each sample
 * may see only earlier weeks in its own season.
 */
export type NflScoreTraining = {
  version:"nfl-score-regression-trained-v1";
  status:"TRAINED"|"PRIOR_ONLY";
  trainingGames:number;latestSeason:number|null;latestWeek:number|null;
  leaguePointsPerTeam:number;recencyWeight:number;homeAdvantage:number;
  scoreResidualStd:number;sharedScoreStd:number;
  notes:string[];
};
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const blend=(values:number[])=>.6*mean(values.slice(0,4))+.4*mean(values);
type Example={fHome:number;fAway:number;home:number;away:number;season:number;week:number};
export function trainNflScorePrior(games:PlayedGame[]):NflScoreTraining {
 const sorted=games.filter(g=>g.homeScore>=0&&g.awayScore>=0&&g.home!==g.away)
  .slice().sort((a,b)=>a.season-b.season||a.week-b.week||a.id.localeCompare(b.id));
 const samples:Example[]=[];
 const seasons=[...new Set(sorted.map(g=>g.season))].sort((a,b)=>a-b);
 for(const season of seasons){
  const seasonGames=sorted.filter(g=>g.season===season);
  const weeks=[...new Set(seasonGames.map(g=>g.week))].sort((a,b)=>a-b);
  const past=new Map<string,Array<{for:number;against:number}>>();
  for(const week of weeks){
   const current=seasonGames.filter(g=>g.week===week);
   for(const g of current){
    const h=(past.get(g.home)??[]).slice(0,8),a=(past.get(g.away)??[]).slice(0,8);
    if(h.length<4||a.length<4)continue;
    samples.push({
      fHome:(blend(h.map(r=>r.for))+blend(a.map(r=>r.against)))*.5,
      fAway:(blend(a.map(r=>r.for))+blend(h.map(r=>r.against)))*.5,
      home:g.homeScore,away:g.awayScore,season,week,
    });
   }
   // This batch ordering prevents Thursday results from leaking into
   // Sunday forecasts in a strict week-level replay.
   for(const g of current){
    const h=past.get(g.home)??[],a=past.get(g.away)??[];
    past.set(g.home,[{for:g.homeScore,against:g.awayScore},...h].slice(0,8));
    past.set(g.away,[{for:g.awayScore,against:g.homeScore},...a].slice(0,8));
   }
  }
 }
 const avg=sorted.length?clamp(mean(sorted.flatMap(g=>[g.homeScore,g.awayScore])),18,28):22.5;
 const latest=sorted.at(-1);
 const fallback:NflScoreTraining={
  version:"nfl-score-regression-trained-v1",status:"PRIOR_ONLY",trainingGames:samples.length,
  latestSeason:latest?.season??null,latestWeek:latest?.week??null,
  leaguePointsPerTeam:Math.round(avg*100)/100,recencyWeight:.68,homeAdvantage:1.2,
  scoreResidualStd:9.8,sharedScoreStd:2.5,
  notes:["Insufficient historical fixtures for fitted parameters; conservative default scoring prior retained.","Forecast probabilities remain uncalibrated."],
 };
 if(samples.length<120)return fallback;
 let best:{alpha:number;home:number;loss:number}|null=null;
 for(const alpha of [.35,.45,.55,.65,.75,.85,.9]){
  for(const home of [0,.5,1,1.5,2,2.5,3]){
   let loss=0,weight=0;
   for(const row of samples){
    const w=row.season===seasons.at(-1)?1.3:row.season===seasons[0]?.8:1;
    const ph=alpha*row.fHome+(1-alpha)*avg+home;
    const pa=alpha*row.fAway+(1-alpha)*avg-home;
    loss+=w*((ph-row.home)**2+(pa-row.away)**2);
    weight+=w*2;
   }
   const mse=loss/weight;
   if(!best||mse<best.loss)best={alpha,home,loss:mse};
  }
 }
 const alpha=best!.alpha,homeEdge=best!.home;
 let vH=0,vA=0,cov=0;
 for(const row of samples){
  const a=row.home-(alpha*row.fHome+(1-alpha)*avg+homeEdge);
  const b=row.away-(alpha*row.fAway+(1-alpha)*avg-homeEdge);
  vH+=a*a;vA+=b*b;cov+=a*b;
 }
 const varMean=(vH+vA)/(2*samples.length);
 const sharedVariance=clamp(cov/samples.length,0,12);
 return {
  version:"nfl-score-regression-trained-v1",status:"TRAINED",
  trainingGames:samples.length,
  latestSeason:latest?.season??null,latestWeek:latest?.week??null,
  leaguePointsPerTeam:Math.round(avg*100)/100,recencyWeight:alpha,
  homeAdvantage:homeEdge,
  scoreResidualStd:Math.round(Math.sqrt(clamp(varMean,36,225))*100)/100,
  sharedScoreStd:Math.round(Math.sqrt(sharedVariance)*100)/100,
  notes:[
    "Fit recency shrinkage, home edge, league points and residual variance to actual earlier-season games.",
    "Chronological examples exclude the target week; prior completed weeks may update the live training set.",
    "Training fit does NOT establish calibrated ML/spread/total outcome probabilities.",
  ],
 };
}
