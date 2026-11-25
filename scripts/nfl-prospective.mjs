/**
 * MIGO NFL append-only pregame ledger.
 *
 * Run from GitHub Actions using a separate data branch, never rewrite files:
 *   node scripts/nfl-prospective.mjs capture
 *   node scripts/nfl-prospective.mjs grade
 *
 * Production is only the forecasting source. Grading reads independently
 * updated nflverse schedules and player weekly stats. A DNP/unknown stat is
 * not treated as a zero or a losing wager.
 */
import {readFile,readdir,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

const ROOT=process.env.NFL_LEDGER_DIR??"data/nfl";
const BASE=(process.env.NFL_FORECAST_BASE_URL??"https://migobetting.vercel.app").replace(/\/$/,"");
const RELEASE="https://github.com/nflverse/nflverse-data/releases/download";
const LIMIT=8_000_000;
const key=(s)=>String(s??"").trim().toUpperCase();
const team=(s)=>({WSH:"WAS",JAX:"JAC",LA:"LAR",ARZ:"ARI",STL:"LAR",SD:"LAC",OAK:"LV"}[key(s)]??key(s));
const number=(v)=>v===undefined||v===null||String(v).trim()===""?null:
  Number.isFinite(Number(v))?Number(v):null;
const sha=(text)=>createHash("sha256").update(text).digest("hex");
const fine=(item)=>item!==null&&Number.isFinite(item);
async function request(url,timeout=45000){
 const response=await fetch(url,{headers:{"Accept":"application/json,text/csv","User-Agent":"migo-nfl-prospective-ledger/1.0"},
  signal:AbortSignal.timeout(timeout),cache:"no-store"});
 if(!response.ok)throw Error("Source "+new URL(url).hostname+" returned "+response.status);
 const body=await response.text();
 if(body.length>LIMIT)throw Error("Source exceeds permitted size");
 return body;
}
async function json(url,timeout=45000){return JSON.parse(await request(url,timeout));}
export function captureWindow(kickoff,now){
 const hours=(Date.parse(kickoff)-now)/3600000;
 if(hours>=18&&hours<=120)return "early";
 if(hours>=.5&&hours<18)return "pregame";
 return null;
}
export function csvRows(input){
 const rows=[];let cols=[],value="",quoted=false;
 const text=input.replace(/^\uFEFF/,"");
 function column(){cols.push(value);value="";}
 function row(){
  column();
  if(cols.length>1 || cols[0]!=="")rows.push(cols);
  cols=[];
 }
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){value+='"';i++;}
   else quoted=!quoted;
  }else if(c===","&&!quoted)column();
  else if((c==="\n"||c==="\r")&&!quoted){
   if(c==="\r"&&text[i+1]==="\n")i++;
   row();
  }else value+=c;
 }
 if(value||cols.length)row();
 const headers=rows.shift()??[];
 return rows.map(values=>Object.fromEntries(headers.map((header,i)=>[header,values[i]??""])));
}
function archivePath(game,kind){
 if(!/^\d{5,15}$/.test(String(game.id)))throw Error("Invalid game identifier");
 const season=Number(game.season),week=Number(game.week);
 if(!Number.isInteger(season)||season<2023||season>2036||
    !Number.isInteger(week)||week<1||week>22)throw Error("Invalid NFL fixture season/week");
 return path.join(ROOT,"pregame",String(season),"week-"+week,game.id+"__"+kind+".json");
}
async function exists(file){try{await readFile(file);return true;}catch{return false;}}
async function saveOnce(file,value){
 if(await exists(file))return false;
 await mkdir(path.dirname(file),{recursive:true});
 await writeFile(file,JSON.stringify(value,null,2)+"\n",{flag:"wx"});
 return true;
}
export function makeRecord(data,kind,source,now){
 if(!data?.game||data.game.status!=="scheduled"||!Array.isArray(data.props)||
   !Array.isArray(data.gameMarkets?.markets)||!data.fetchedAt)
   throw Error("Model API response lacked required scheduled-game fields");
 const kickoff=Date.parse(data.game.kickoff),at=Date.parse(data.fetchedAt);
 if(!Number.isFinite(at)||at>now+60000||!(at<kickoff)||!(now<kickoff))
   throw Error("Prediction was not observed before kickoff");
 const record={
  schemaVersion:1,snapshotKind:kind,capturedAt:new Date(now).toISOString(),
  fetchedAt:data.fetchedAt,kickoffAt:data.game.kickoff,
  sourceUrl:source,workflowGitSha:process.env.GITHUB_SHA??null,
  productionModelVersion:data.version??"unknown",
  game:data.game,coverage:data.coverage??null,
  supplementalCoverage:data.supplementalCoverage??null,
  unavailablePlayers:data.unavailablePlayers??[],
  playerPicks:data.props,playerSimulation:data.simulation??null,
  gameMarkets:data.gameMarkets,sharedDraws:data.sharedDraws===true,
 };
 return {...record,archiveHash:sha(JSON.stringify(record))};
}
export async function capture(){
 const board=await json(BASE+"/api/nfl");
 if(!Array.isArray(board.games))throw Error("NFL schedule missing");
 let created=0,skipped=0;
 for(const game of board.games){
  if(game.status!=="scheduled")continue;
  const now=Date.now(),kind=captureWindow(game.kickoff,now);
  if(!kind){skipped++;continue;}
  const file=archivePath(game,kind);
  if(await exists(file)){skipped++;continue;}
  try{
   const source=BASE+"/api/nfl?eventId="+encodeURIComponent(game.id);
   const preview=await json(source,85000);
   if(preview.game?.id!==game.id || preview.game?.kickoff!==game.kickoff)throw Error("Fixture changed between calls");
   const record=makeRecord(preview,kind,source,Date.now());
   if(await saveOnce(file,record)){created++;console.log("FROZEN",file,record.productionModelVersion);}
  }catch(e){console.error("NOT_CAPTURED",game.id,e instanceof Error?e.message:String(e));}
 }
 console.log(JSON.stringify({operation:"capture",created,skipped}));
}
async function filesUnder(dir){
 const found=[];
 try{
  for(const item of await readdir(dir,{withFileTypes:true})){
   const full=path.join(dir,item.name);
   if(item.isDirectory())found.push(...await filesUnder(full));
   else if(item.isFile() && /__(early|pregame)\.json$/.test(item.name))found.push(full);
  }
 }catch(e){if(e.code!=="ENOENT")throw e;}
 return found.sort();
}
const propFields={
 passingYards:"passing_yards",passingTds:"passing_tds",
 rushingYards:"rushing_yards",receivingYards:"receiving_yards",receptions:"receptions",
};
export function gradeFrozen(record,schedules,weekly){
 const g=record.game,season=Number(g.season),week=Number(g.week);
 if(!fine(season)||!fine(week)||Date.parse(g.kickoff)>=Date.now())
   return {status:"PENDING",reason:"Game has not kicked off"};
 const matching=schedules.filter(row=>
  number(row.season)===season&&number(row.week)===week&&
  team(row.home_team)===team(g.home.abbreviation)&&team(row.away_team)===team(g.away.abbreviation)&&
  number(row.home_score)!==null&&number(row.away_score)!==null&&
  (!row.game_type||row.game_type==="REG"));
 if(matching.length!==1)return {status:"PENDING",reason:"Final scored NFL schedule game not uniquely verified"};
 const played=matching[0],h=number(played.home_score),a=number(played.away_score);
 const teamRows=weekly.filter(row=>number(row.season)===season&&number(row.week)===week);
 const homeCount=teamRows.filter(row=>team(row.team)===team(g.home.abbreviation)).length,
   awayCount=teamRows.filter(row=>team(row.team)===team(g.away.abbreviation)).length;
 if(homeCount===0||awayCount===0)return {status:"PENDING",reason:"Both teams' final weekly player stats not yet available"};
 const result=gradeObservations(record,{homeScore:h,awayScore:a},teamRows);
 return {status:"COMPLETE",gameId:g.id,season,week,kickoffAt:g.kickoff,
  capturedAt:record.capturedAt,fetchedAt:record.fetchedAt,sourceRecordHash:record.archiveHash??
    sha(JSON.stringify(record)),gradedAt:new Date().toISOString(),
  scoringSource:"nflverse schedules/games.csv + stats_player_week_"+season+".csv",
  ...result,
 };
}
export function gradeObservations(record,final,weekly){
 const {homeScore:h,awayScore:a}=final;
 const score=(market)=>{
  if(market.market==="moneyline"){
   if(h===a)return null; // Sportsbook draw/push rules differ.
   return market.side==="home"?Number(h>a):Number(a>h);
  }
  if(market.market==="spread"){
   const result=market.side==="home"?h+market.line-a:a+market.line-h;
   return result===0?null:Number(result>0);
  }
  const sum=h+a,delta=sum-market.line;
  if(delta===0)return null;
  return market.side==="over"?Number(delta>0):Number(delta<0);
 };
 const gameMarkets=(record.gameMarkets?.markets??[]).map(m=>{
  const outcome=score(m);
  return {id:m.id,market:m.market,side:m.side,line:m.line,
   forecast:m.rawRate,actual:outcome,
   brier:fine(outcome)&&fine(m.rawRate)?Math.round((m.rawRate-outcome)**2*1e5)/1e5:null};
 });
 const playerPicks=(record.playerPicks??[]).map(p=>{
  const playerId=String(p.athleteId??"").replace(/^nflverse:/,"");
  const matches=weekly.filter(row=>row.player_id===playerId &&
    team(row.team)===(p.teamId===record.game.home.id?
      team(record.game.home.abbreviation):team(record.game.away.abbreviation)));
  const field=propFields[p.market];
  const observed=field&&matches.length===1?number(matches[0][field]):null;
  const actual=observed===null?null:Number(observed>=p.line);
  const simulated=(record.playerSimulation?.props??[]).find(s=>s.id===p.id)?.rawModelHitRate??null;
  return {id:p.id,athleteId:p.athleteId,player:p.player,market:p.market,line:p.line,
    researchGrade:p.grade,forecast:fine(simulated)?simulated:null,observed,actual,
    brier:fine(actual)&&fine(simulated)?Math.round((simulated-actual)**2*1e5)/1e5:null,
    note:matches.length!==1?"No uniquely matched final player row; cannot grade as zero.":
      observed===null?"Player market stat is missing; cannot grade as zero.":"Verified weekly stat"};
 });
 return {finalScore:{home:h,away:a},gameMarkets,playerPicks};
}
async function grade(){
 const files=await filesUnder(path.join(ROOT,"pregame"));
 if(!files.length){console.log("NO_SNAPSHOTS");return;}
 const snapshots=await Promise.all(files.map(async p=>({path:p,record:JSON.parse(await readFile(p,"utf8"))})));
 const need=snapshots.filter(x=>Date.parse(x.record.kickoffAt)<Date.now()&&
    !(x.path.replace(/\.json$/,"__grade.json")===x.path));
 if(!need.length)return;
 const schedules=csvRows(await request(RELEASE+"/schedules/games.csv",80000));
 const cache=new Map();let graded=0,pending=0;
 for(const {path:source,record} of need){
  const destination=source.replace(/\.json$/,"__grade.json");
  if(await exists(destination))continue;
  const season=Number(record.game?.season);
  if(!cache.has(season)){
   try{cache.set(season,csvRows(await request(RELEASE+"/stats_player/stats_player_week_"+season+".csv",80000)));}
   catch(e){console.error("STATS_SOURCE_MISSING",season,String(e));cache.set(season,[]);}
  }
  const result=gradeFrozen(record,schedules,cache.get(season));
  if(result.status==="COMPLETE"){
   if(await saveOnce(destination,result)){graded++;console.log("GRADED",destination);}
  }else{pending++;console.log("PENDING",record.game?.id,result.reason);}
 }
 console.log(JSON.stringify({operation:"grade",graded,pending}));
}
const running=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(running){
 try{
  if(process.argv[2]==="capture")await capture();
  else if(process.argv[2]==="grade")await grade();
  else throw Error("Usage: node scripts/nfl-prospective.mjs capture|grade");
 }catch(e){console.error(e);process.exitCode=1;}
}
