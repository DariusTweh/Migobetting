import {describe,it,expect} from "vitest";
import {rankNflProps,type NflGame} from "../lib/nfl/engine";
import {weeklyBoxLinesForMatchup,type NflverseSnapshot,type WeeklyUsage} from "../lib/nfl/nflverse";
import {simulateUnifiedNfl} from "../lib/nfl/unified";
import type {PlayedGame} from "../lib/nfl/game-markets";

const game:NflGame={
 id:"401987654",season:2099,week:12,kickoff:"2099-11-25T21:00:00Z",
 status:"scheduled",statusLabel:"Scheduled",
 home:{id:"14",name:"Los Angeles Rams",abbreviation:"LAR"},
 away:{id:"9",name:"Green Bay Packers",abbreviation:"GB"},
};
const make=():NflverseSnapshot=>{
 const players:WeeklyUsage[]=[];
 const games:PlayedGame[]=[];
 for(let week=2;week<=10;week++){
  games.push({id:"2099_"+week+"_GB_LAR",season:2099,week,home:"LAR",away:"GB",homeScore:27,awayScore:21});
  for(const team of ["LAR","GB"]){
   const opponent=team==="LAR"?"GB":"LAR";
   const id=team+"-QB";
   players.push({id,name:team+" Starting QB",team,opponent,position:"QB",season:2099,week,
    gameId:"2099_"+week+"_GB_LAR",passingAttempts:34,passingYards:275,passingTds:2,
    targets:0,targetShare:0,carries:3,rushingYards:15,receptions:0,receivingYards:0});
   players.push({id:team+"-WR",name:team+" Top WR",team,opponent,position:"WR",season:2099,week,
    gameId:"2099_"+week+"_GB_LAR",passingAttempts:0,passingYards:0,passingTds:0,
    targets:10,targetShare:.28,carries:0,rushingYards:0,receptions:7,receivingYards:100});
   players.push({id:team+"-RB",name:team+" Starting RB",team,opponent,position:"RB",season:2099,week,
    gameId:"2099_"+week+"_GB_LAR",passingAttempts:0,passingYards:0,passingTds:0,
    targets:3,targetShare:.08,carries:18,rushingYards:89,receptions:2,receivingYards:15});
   players.push({id:team+"-TE",name:team+" Tight End",team,opponent,position:"TE",season:2099,week,
    gameId:"2099_"+week+"_GB_LAR",passingAttempts:0,passingYards:0,passingTds:0,
    targets:6,targetShare:.16,carries:0,rushingYards:0,receptions:4,receivingYards:50});
  }
 }
 return {players,snaps:[],injuries:[],defense:[],scoredGames:games,unavailable:[],
  coverage:{stats:"available",snaps:"unavailable",injuries:"unavailable",week:12,season:2099,
   statsRows:players.length,snapsRows:0,injuryRows:0,attribution:"synthetic"}};
};
describe("NFL shared-state game and player projection",()=>{
 it("uses same trial to evaluate player and game legs and is reproducible",()=>{
  const snapshot=make();
  const props=rankNflProps(game,weeklyBoxLinesForMatchup(game,snapshot.players))
   .map(p=>({...p,grade:"RESEARCH" as const}));
  const p=props.find(p=>p.player==="LAR Top WR"&&p.market==="receivingYards");
  expect(p).toBeDefined();
  const marketId=game.id+":moneyline:home:na";
  const opts={runs:500,seed:40,propIds:[p!.id],marketIds:[marketId]};
  const first=simulateUnifiedNfl(game,snapshot,props,opts);
  const second=simulateUnifiedNfl(game,snapshot,props,opts);
  expect(first.sharedDraws).toBe(true);
  expect(first.simulation.status).toBe("READY");
  expect(first.gameMarkets.status).toBe("READY");
  expect(first.gameMarkets.runs).toBe(500);
  expect(first.mixedJoint?.runs).toBe(500);
  expect(first.mixedJoint?.method).toBe("SAME_GAME_TRIAL");
  expect(first.mixedJoint).toEqual(second.mixedJoint);
  expect(first.mixedJoint!.rawModelJointRate).toBeLessThanOrEqual(
   Math.min(first.simulation.props.find(x=>x.id===p!.id)!.rawModelHitRate,
   first.gameMarkets.markets.find(x=>x.id===marketId)!.rawRate)+.0001);
 });
 it("does not fabricate a mixed probability when a player's trial values are absent",()=>{
  const snap=make();
  const props=rankNflProps(game,weeklyBoxLinesForMatchup(game,snap.players))
    .map(p=>({...p,grade:"RESEARCH" as const}));
  const invalid={...props[0],id:"nflverse:untracked:receivingYards:25",athleteId:"nflverse:untracked"};
  const sim=simulateUnifiedNfl(game,snap,[...props,invalid],{
    runs:100,seed:8,propIds:[invalid.id],marketIds:[game.id+":moneyline:home:na"]});
  expect(sim.sharedDraws).toBe(false);
  expect(sim.mixedJoint).toBeNull();
  expect(sim.reason).toContain("valid simulated trial");
 });
 it("keeps 30k-equivalent game-score draws for fixtures lacking eligible player props",()=>{
  const snapshot=make();
  const withoutStats={...snapshot,players:[]};
  const model=simulateUnifiedNfl(game,withoutStats,[],{runs:500,seed:20});
  expect(model.sharedDraws).toBe(false);
  expect(model.simulation.status).toBe("PASS");
  expect(model.gameMarkets.status).toBe("READY");
  expect(model.gameMarkets.runs).toBe(500);
 });
});