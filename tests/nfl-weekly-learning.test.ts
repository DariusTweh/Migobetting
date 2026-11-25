import {describe,it,expect} from "vitest";
import type {WeeklyUsage} from "../lib/nfl/nflverse";
import type {NflGame} from "../lib/nfl/engine";
import {inferQuarterbackRole} from "../lib/nfl/qb-availability";
import {parseScheduleScores,simulateGameMarkets} from "../lib/nfl/game-markets";
import {trainNflScorePrior} from "../lib/nfl/scoring-training";
import {validateNflGameMarketArchive} from "../lib/nfl/game-validation";

const q=(id:string,name:string,week:number,attempts:number):WeeklyUsage=>({
 id,name,team:"LAR",position:"QB",season:2026,week,
 gameId:"2026_"+week+"_LAR_GB",opponent:"GB",
 passingAttempts:attempts,passingYards:attempts*7,passingTds:1,
 carries:1,rushingYards:3,targets:0,targetShare:0,receptions:0,receivingYards:0,
});
const matchup:NflGame={
 id:"401987654",kickoff:"2099-11-26T21:00:00Z",
 status:"scheduled",statusLabel:"Scheduled",season:2026,week:12,
 home:{id:"14",name:"Los Angeles Rams",abbreviation:"LAR"},
 away:{id:"9",name:"Green Bay Packers",abbreviation:"GB"},
};
const pairs=[["LAR","GB"],["BUF","MIA"],["KC","DEN"],["PHI","DAL"],["SF","SEA"],["MIN","DET"]];
function scheduleRows(){
 const rows:Array<Record<string,string>>=[];
 for(const year of [2023,2024,2025,2026]){
  const max=year===2026?12:18;
  for(let week=1;week<max;week++)for(let n=0;n<pairs.length;n++){
   const [home,away]=pairs[n];
   rows.push({game_id:year+"_"+week+"_"+away+"_"+home,
    game_type:"REG",season:String(year),week:String(week),
    gameday:year+"-09-"+String(Math.min(28,week+1)).padStart(2,"0"),
    home_team:home,away_team:away,home_score:String(17+(week*3+n+year)%22),
    away_score:String(13+(week*5+n+year)%24)});
  }
 }
 return rows;
}
describe("NFL current-week learning and replacement-quarterback resilience",()=>{
 it("selects the quarterback who started the latest games, not the season attempt leader",()=>{
  const history=[
   ...Array.from({length:8},(_,i)=>q("veteran","Veteran Starter",i+1,36)),
   q("backup","Recent Backup",9,25),q("backup","Recent Backup",10,30),
  ];
  const role=inferQuarterbackRole("LAR",12,history,[
   {team:"LAR",id:"veteran",name:"Veteran Starter",status:"IR"},
  ]);
  expect(role.currentId).toBe("backup");
  expect(role.historicalLeaderId).toBe("veteran");
  expect(role.status).toBe("RECENT_REPLACEMENT");
 });
 it("flags unknown replacement rather than asserting a previously seen backup starts",()=>{
  const rows=[q("veteran","Veteran Starter",8,35),q("backup","Old Backup",7,20)];
  const role=inferQuarterbackRole("LAR",12,rows,[
   {team:"LAR",id:"veteran",name:"Veteran Starter",status:"IR"},
  ]);
  expect(role.currentId).toBeNull();
  expect(role.status).toBe("UNVERIFIED_REPLACEMENT");
 });
 it("learns from three earlier seasons plus completed 2026 and keeps the score research available",()=>{
  const source=scheduleRows();
  const historical=[2023,2024,2025].flatMap(y=>parseScheduleScores(source,y,23));
  const current=parseScheduleScores(source,2026,12);
  const trained=trainNflScorePrior([...historical,...current]);
  expect(trained.status).toBe("TRAINED");
  expect(trained.trainingGames).toBeGreaterThan(120);
  expect(trained.latestSeason).toBe(2026);
  const result=simulateGameMarkets(matchup,current,[],[],250,93,false,historical);
  expect(result.status).toBe("READY");
  expect(result.trainedScores?.status).toBe("TRAINED");
  expect(result.trainedScores?.latestSeason).toBe(2026);
 });
 it("retains game markets but increases uncertainty if the latest starting QB is out",()=>{
  const source=scheduleRows();
  const played=parseScheduleScores(source,2026,12);
  const rows=[q("veteran","Veteran Starter",10,33)];
  const status=simulateGameMarkets(matchup,played,[
   {id:"veteran",name:"Veteran Starter",team:"LAR",status:"IR",source:"official"},
  ],rows,250,93);
  expect(status.status).toBe("READY");
  expect(status.projectionQuality).toBe("LIMITED_QB");
  expect(status.quarterbacks?.home.status).toBe("UNVERIFIED_REPLACEMENT");
  expect(status.markets.length).toBeGreaterThan(30);
 });
 it("grades 2026 with 2023–2025 trained parameters and blocks current-week leakage",()=>{
  const source=scheduleRows();
  const report=validateNflGameMarketArchive(source,2026,12,100);
  expect(report.status).toBe("COMPLETE");
  expect(report.model.status).toBe("TRAINED");
  expect(report.historicalTrainingSeasons).toEqual([2023,2024,2025]);
  expect(report.targetSeason).toBe(2026);
  expect(report.lastGradedWeek).toBe(11);
  expect(report.gamesEvaluated).toBeGreaterThan(20);
  expect(report.overall.brier).toBeGreaterThanOrEqual(0);
  expect(report.deploymentGate).toBe("RESEARCH_ONLY");
  const poisoned=[...source,...pairs.map(([home,away],i)=>({
   game_id:"FUTURE_"+i,game_type:"REG",season:"2026",week:"12",
   gameday:"2026-12-01",home_team:home,away_team:away,
   home_score:"90",away_score:"1",
  }))];
  const unaffected=validateNflGameMarketArchive(poisoned,2026,12,100);
  expect(unaffected.overall).toEqual(report.overall);
  expect(unaffected.markets).toEqual(report.markets);
 });
});
