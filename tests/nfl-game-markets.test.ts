import {describe,it,expect} from "vitest";
import {simulateGameMarkets,parseScheduleScores,type PlayedGame,type UnavailablePlayer} from "../lib/nfl/game-markets";
import {verifiedUnavailable,type WeeklyUsage} from "../lib/nfl/nflverse";
import type {NflGame} from "../lib/nfl/engine";

const game:NflGame={
 id:"401873079",season:2026,week:12,kickoff:"2026-11-25T21:00:00Z",
 status:"scheduled",statusLabel:"Preview",
 home:{id:"14",abbreviation:"LAR",name:"Los Angeles Rams"},
 away:{id:"9",abbreviation:"GB",name:"Green Bay Packers"},
};
const scores:PlayedGame[]=Array.from({length:9},(_,i)=>[
 {id:"h"+i,season:2026,week:i+1,home:"LAR",away:"ARI",homeScore:30,awayScore:15},
 {id:"a"+i,season:2026,week:i+1,home:"GB",away:"DET",homeScore:23,awayScore:25},
]).flat();
const usage:WeeklyUsage[]=[1,2,3,4,5].map(week=>({
 name:"Puka Nacua",id:"00-0039075",team:"LAR",position:"WR",
 season:2026,week,gameId:"game"+week,opponent:"ARI",
 targets:12,targetShare:.37,carries:1,receptions:8,
 receivingYards:104,rushingYards:3,passingYards:0,passingTds:0,passingAttempts:0,
}));
describe("NFL team-score and availability research",()=>{
 it("rejects current and future weeks and unverified scores",()=>{
  const data=[
   {game_id:"g1",season:"2026",week:"10",game_type:"REG",gameday:"2026-11-01",home_team:"GB",away_team:"LAR",home_score:"30",away_score:"24"},
   {game_id:"g2",season:"2026",week:"12",game_type:"REG",gameday:"2026-11-25",home_team:"GB",away_team:"LAR",home_score:"70",away_score:"3"},
   {game_id:"g3",season:"2026",week:"11",game_type:"REG",gameday:"2026-11-10",home_team:"GB",away_team:"LAR",home_score:"",away_score:"25"},
  ];
  const history=parseScheduleScores(data,2026,12);
  expect(history).toHaveLength(1);
  expect(history[0].id).toBe("g1");
 });
 it("forbids Puka as a model-eligible player under the Rams official IR report",()=>{
  const unavailable=verifiedUnavailable(game,[],usage);
  expect(unavailable.find(p=>p.id==="00-0039075")?.status).toBe("IR");
  expect(unavailable.find(p=>p.name==="Puka Nacua")?.source).toContain("Los Angeles Rams");
  expect(verifiedUnavailable({...game,season:2027},[],usage)).toHaveLength(0);
 });
 it("recognizes roster injured/reserve designations using stable athlete IDs",()=>{
  const unavailable=verifiedUnavailable(game,[
   {gsis_id:"00-0031381",full_name:"Davante Adams",team:"LAR",status:"RES"},
   {gsis_id:"00-0039999",full_name:"Active receiver",team:"LAR",status:"ACT"},
  ],usage);
  expect(unavailable.some(p=>p.name==="Davante Adams"&&p.status==="RES")).toBe(true);
  expect(unavailable.some(p=>p.name==="Active receiver")).toBe(false);
 });
 it("produces deterministic and mutually coherent moneyline and total frequencies",()=>{
  const one=simulateGameMarkets(game,scores,[],usage,1000,42);
  const two=simulateGameMarkets(game,scores,[],usage,1000,42);
  expect(one).toEqual(two);
  expect(one.status).toBe("READY");
  const home=one.markets.find(m=>m.market==="moneyline"&&m.side==="home")!;
  const away=one.markets.find(m=>m.market==="moneyline"&&m.side==="away")!;
  expect(home.rawRate+away.rawRate).toBeLessThanOrEqual(1.00001);
  const over=one.markets.find(m=>m.market==="total"&&m.side==="over"&&m.line===45.5)!;
  const under=one.markets.find(m=>m.market==="total"&&m.side==="under"&&m.line===45.5)!;
  expect(over.rawRate+under.rawRate).toBeCloseTo(1,3);
  const more=one.markets.find(m=>m.market==="total"&&m.side==="over"&&m.line===55.5)!;
  expect(over.rawRate).toBeGreaterThanOrEqual(more.rawRate);
  expect(JSON.stringify(one)).not.toContain("fairOdds");
 });
 it("penalizes missing important receiver workload without fabricating book price",()=>{
  const puka:UnavailablePlayer={id:"00-0039075",name:"Puka Nacua",team:"LAR",status:"IR",source:"official"};
  const healthy=simulateGameMarkets(game,scores,[],usage,1000,77);
  const injured=simulateGameMarkets(game,scores,[puka],usage,1000,77);
  expect(injured.homeProjected!).toBeLessThan(healthy.homeProjected!);
  expect(injured.injuryEffects[0].players).toContain("Puka Nacua");
  expect(injured.modelStatus).toBe("UNCALIBRATED");
 });
 it("PASSES unavailable main QB without assuming the backup's performance",()=>{
  const qb:WeeklyUsage={...usage[0],id:"qb",name:"Starting QB",position:"QB",targets:0,passingAttempts:35};
  const missing:UnavailablePlayer={id:"qb",name:"Starting QB",team:"LAR",status:"OUT",source:"official"};
  const model=simulateGameMarkets(game,scores,[missing],[...usage,qb],100);
  expect(model.status).toBe("READY");
  expect(model.markets.length).toBeGreaterThan(0);
  expect(model.projectionQuality).toBe("LIMITED_QB");
  expect(model.quarterbacks?.home.status).toBe("UNVERIFIED_REPLACEMENT");
 });
});
