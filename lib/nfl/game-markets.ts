import type { NflGame } from "./engine";
import type { WeeklyUsage } from "./nflverse";
export type PlayedGame={id:string;season:number;week:number;home:string;away:string;homeScore:number;awayScore:number};
export type UnavailablePlayer={id:string;name:string;team:string;status:string;source:string};
export type GameMarket={id:string;market:"moneyline"|"spread"|"total";side:"home"|"away"|"over"|"under";line:number|null;label:string;rawRate:number};
export type GameMarketReport={status:"READY"|"PASS";reason?:string;modelStatus:"UNCALIBRATED";runs:number;seed:number;home:string;away:string;homeProjected:number|null;awayProjected:number|null;totalProjected:number|null;marginProjected:number|null;injuryEffects:Array<{team:string;lostPoints:number;players:string[]}>;sampleGames:{home:number;away:number};markets:GameMarket[];notes:string[]};
const norm=(s:string)=>({WSH:"WAS",JAX:"JAC",LA:"LAR",ARZ:"ARI",STL:"LAR"} as Record<string,string>)[s.toUpperCase()]??s.toUpperCase();
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(x,b));
const average=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const weighted=(a:number[])=>.6*average(a.slice(0,4))+.4*average(a);
const num=(s:string|undefined)=>s===undefined||s.trim()===""?null:Number.isFinite(Number(s))?Number(s):null;
const r4=(x:number)=>Math.round(x*1e4)/1e4;
function seedHash(s:string){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function prng(seed:number){let state=seed>>>0;return ()=>{state+=0x6D2B79F5;let x=state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
function gaussian(r:()=>number){return Math.sqrt(-2*Math.log(Math.max(1e-10,r())))*Math.cos(2*Math.PI*r());}
export function parseScheduleScores(rows:Record<string,string>[],season:number,week:number):PlayedGame[]{
 const found:PlayedGame[]=[],seen=new Set<string>();
 for(const row of rows){
  const s=num(row.season),w=num(row.week),h=num(row.home_score),a=num(row.away_score);
  const home=norm(row.home_team??""),away=norm(row.away_team??"");
  const id=row.game_id??"";
  if(s!==season||w===null||w<1||w>=week||h===null||a===null||h<0||a<0||h>100||a>100||
    !id||seen.has(id)||!home||!away||home===away||!["REG",""].includes((row.game_type??"").toUpperCase()))continue;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.gameday??""))continue;
  seen.add(id);found.push({id,season,week:w,home,away,homeScore:h,awayScore:a});
 }
 return found.sort((a,b)=>b.week-a.week||b.id.localeCompare(a.id));
}
function recentScores(team:string,rows:PlayedGame[]){
 const games=rows.filter(g=>g.home===team||g.away===team).slice(0,8);
 return {scored:games.map(g=>g.home===team?g.homeScore:g.awayScore),allowed:games.map(g=>g.home===team?g.awayScore:g.homeScore)};
}
function injuryAdjustment(team:string,week:number,unavailable:UnavailablePlayer[],usage:WeeklyUsage[]){
 const players=unavailable.filter(p=>p.team===team);
 const selected:string[]=[];let penalty=0;let lostQB=false;
 for(const p of players){
  const rows=usage.filter(r=>r.team===team&&r.id===p.id&&r.week<week).sort((a,b)=>b.week-a.week).slice(0,3);
  if(!rows.length)continue;
  const t=average(rows.map(r=>r.targets??0)),c=average(rows.map(r=>r.carries??0)),a=average(rows.map(r=>r.passingAttempts??0));
  if(a>=18){lostQB=true;selected.push(p.name);continue;}
  const effect=clamp(Math.max(t*.2,c*.09),0,2.3);
  if(effect>.1){penalty+=effect;selected.push(p.name);}
 }
 return {lostPoints:Math.round(Math.min(4,penalty)*10)/10,players:selected,lostQB};
}
export function simulateGameMarkets(game:NflGame,games:PlayedGame[],unavailable:UnavailablePlayer[],usage:WeeklyUsage[],runs=30000,seed?:number):GameMarketReport{
 const home=norm(game.home.abbreviation),away=norm(game.away.abbreviation),randomSeed=seed??seedHash(game.id+":score-v1");
 const base:GameMarketReport={status:"PASS",modelStatus:"UNCALIBRATED",runs,seed:randomSeed,home,away,homeProjected:null,awayProjected:null,totalProjected:null,marginProjected:null,injuryEffects:[],sampleGames:{home:0,away:0},markets:[],notes:[
 "Historical score-driven team model. Current opponent form and home-field are weighted research inputs.",
 "Shared game-pace shocks link wins, margins and totals; no independent multiplication of market probabilities.",
 "Tied simulated scores are usually resolved by an uncalibrated overtime heuristic; rare ties remain.",
 "Absence adjustments are heuristic; player replacements and game-day activations are not verified.",
 "Uncalibrated raw frequencies are not fair odds, BetMGM prices, or verified betting edges."
 ]};
 if(!Number.isInteger(runs)||runs<100||runs>30000)throw Error("Invalid trial count");
 if(game.status!=="scheduled"||!game.week||!game.season||!Number.isFinite(Date.parse(game.kickoff))||Date.parse(game.kickoff)<=Date.now())return {...base,reason:"Fixture is not upcoming with verified week/season"};
 const earlier=games.filter(g=>g.season===game.season&&g.week<game.week!);
 const h=recentScores(home,earlier),a=recentScores(away,earlier);
 base.sampleGames={home:h.scored.length,away:a.scored.length};
 if(h.scored.length<4||a.scored.length<4)return {...base,reason:"Insufficient verified prior scoring histories"};
 const hi=injuryAdjustment(home,game.week,unavailable,usage),ai=injuryAdjustment(away,game.week,unavailable,usage);
 base.injuryEffects=[{team:home,lostPoints:hi.lostPoints,players:hi.players},{team:away,lostPoints:ai.lostPoints,players:ai.players}];
 if(hi.lostQB||ai.lostQB)return {...base,reason:"Unavailable starting quarterback requires verified replacement scenario"};
 const hMean=clamp(.68*(weighted(h.scored)+weighted(a.allowed))*.5+.32*22.5+1.2-hi.lostPoints,8,37);
 const aMean=clamp(.68*(weighted(a.scored)+weighted(h.allowed))*.5+.32*22.5-1.2-ai.lostPoints,8,37);
 const r=prng(randomSeed),homeScores=new Int16Array(runs),awayScores=new Int16Array(runs);
 for(let i=0;i<runs;i++){
  const shared=gaussian(r)*3.6;
  let hs=Math.round(clamp(hMean+shared+gaussian(r)*8.9,0,62));
  let as=Math.round(clamp(aMean+shared+gaussian(r)*8.9,0,62));
  if(hs===as && r()>.006){
    // NFL overtime usually resolves tied regulation scores. Heuristic only;
    // not a calibrated OT model; ties remain possible.
    if(r()<clamp(.5+(hMean-aMean)/60,.35,.65))hs+=3;
    else as+=3;
  }
  homeScores[i]=hs;awayScores[i]=as;
}
 const markets:GameMarket[]=[];
 const record=(market:GameMarket["market"],side:GameMarket["side"],line:number|null,label:string,test:(h:number,a:number)=>boolean)=>{
 let wins=0;for(let i=0;i<runs;i++)if(test(homeScores[i],awayScores[i]))wins++;
 markets.push({id:[game.id,market,side,line??"na"].join(":"),market,side,line,label,rawRate:r4(wins/runs)});
 };
 record("moneyline","home",null,home+" moneyline",(h,a)=>h>a);
 record("moneyline","away",null,away+" moneyline",(h,a)=>a>h);
 for(const handicap of [-13.5,-10.5,-7.5,-3.5,-0.5,0.5,3.5,7.5,10.5,13.5]){
  record("spread","home",handicap,home+" "+(handicap>0?"+":"")+handicap,(h,a)=>h+handicap>a);
  record("spread","away",-handicap,away+" "+(-handicap>0?"+":"")+(-handicap),(h,a)=>a-handicap>h);
 }
 for(const threshold of [30.5,35.5,40.5,45.5,50.5,55.5,60.5]){
  record("total","over",threshold,"Over "+threshold,(h,a)=>h+a>threshold);
  record("total","under",threshold,"Under "+threshold,(h,a)=>h+a<threshold);
 }
 return {...base,status:"READY",markets,homeProjected:Math.round(hMean*10)/10,awayProjected:Math.round(aMean*10)/10,totalProjected:Math.round((hMean+aMean)*10)/10,marginProjected:Math.round((hMean-aMean)*10)/10};
}
