import { describe, expect, it } from "vitest";
import { rankNflProps, type NflGame, type NflProp } from "../lib/nfl/engine";
import {
  weeklyBoxLinesForMatchup, type NflverseSnapshot, type WeeklyUsage,
} from "../lib/nfl/nflverse";
import {
  NFL_SIM_VERSION, simulateNflMatchup,
} from "../lib/nfl/simulation";

const game: NflGame = {
  id: "401999001", kickoff: "2099-11-29T21:00:00Z",season:2099,week:12,
  status:"scheduled",statusLabel:"Scheduled",spreadDetails:"LAR -2.5",overUnder:48,
  home:{id:"14",abbreviation:"LAR",name:"Los Angeles Rams"},
  away:{id:"9",abbreviation:"GB",name:"Green Bay Packers"},
};
type Actor = {
  id:string; name:string;position:string;targets:number;receptions:number;receivingYards:number;
  carries:number;rushingYards:number;attempts:number;passingYards:number;passingTds:number;
};
const actors: Actor[] = [
  {id:"q",name:"Test Quarterback",position:"QB",targets:0,receptions:0,receivingYards:0,carries:3,rushingYards:14,attempts:35,passingYards:270,passingTds:2},
  {id:"w1",name:"Test Wideout One",position:"WR",targets:10,receptions:7,receivingYards:100,carries:0,rushingYards:0,attempts:0,passingYards:0,passingTds:0},
  {id:"w2",name:"Test Wideout Two",position:"WR",targets:7,receptions:5,receivingYards:68,carries:0,rushingYards:0,attempts:0,passingYards:0,passingTds:0},
  {id:"te",name:"Test Tight End",position:"TE",targets:5,receptions:4,receivingYards:51,carries:0,rushingYards:0,attempts:0,passingYards:0,passingTds:0},
  {id:"rb",name:"Test Running Back",position:"RB",targets:4,receptions:3,receivingYards:25,carries:18,rushingYards:83,attempts:0,passingYards:0,passingTds:0},
  {id:"rb2",name:"Test Second Back",position:"RB",targets:1,receptions:1,receivingYards:8,carries:7,rushingYards:29,attempts:0,passingYards:0,passingTds:0},
];
function rows(): WeeklyUsage[] {
  const all: WeeklyUsage[]=[];
  for (const team of ["LAR","GB"]) {
    for (let week=5;week<=10;week++) {
      for (const actor of actors) {
        all.push({
          id:team+"-"+actor.id, name: team+" "+actor.name,
          team,season:2099,week,gameId:"2099_"+week+"_"+team,
          opponent:team==="LAR"?"GB":"LAR",position:actor.position,
          targets:actor.targets, targetShare:actor.targets/35,
          carries:actor.carries, receptions:actor.receptions,
          receivingYards:actor.receivingYards + (week%3),
          rushingYards:actor.rushingYards, passingAttempts:actor.attempts,
          passingYards:actor.passingYards,passingTds:actor.passingTds,
        });
      }
    }
  }
  return all;
}
function snapshot(players=rows()): NflverseSnapshot {
  return {
    players,snaps:[],injuries:[],defense:[],
    coverage:{stats:"available",snaps:"available",injuries:"available",
      statsRows:players.length,snapsRows:0,injuryRows:0,
      season:2099,week:12,attribution:"Synthetic test fixture"},
  };
}
function candidateProps(snap=snapshot()): NflProp[] {
  return rankNflProps(game,weeklyBoxLinesForMatchup(game,snap.players))
    .map((pick)=>({...pick,grade:"RESEARCH" as const}));
}
describe("NFL Phase 3 seeded correlated scenarios",()=>{
  it("simulates prior-week opportunities with stable seeded deterministic results",()=>{
    const snap=snapshot(), props=candidateProps(snap);
    const first=simulateNflMatchup(game,snap,props,{runs:500,seed:12345});
    const second=simulateNflMatchup(game,snap,props,{runs:500,seed:12345});
    expect(first.status).toBe("READY");
    expect(first.runs).toBe(500);
    expect(first.props).toEqual(second.props);
    expect(first.seed).toBe(12345);
    expect(first.modelVersion).toBe(NFL_SIM_VERSION);
    expect(first.props.length).toBeGreaterThan(2);
    for (const prop of first.props) {
      expect(prop.rawModelHitRate).toBeGreaterThanOrEqual(0);
      expect(prop.rawModelHitRate).toBeLessThanOrEqual(1);
      expect(prop.p10).toBeLessThanOrEqual(prop.p50);
      expect(prop.p50).toBeLessThanOrEqual(prop.p90);
      expect(prop.modelStatus).toBe("UNCALIBRATED");
    }
  });
  it("links one receiver's yards and quarterback passing yards through shared passes",()=>{
    const snap=snapshot(), props=candidateProps(snap);
    const quarterback=props.find((p)=>p.teamId==="14"&&p.market==="passingYards");
    const receiver=props.find((p)=>p.teamId==="14"&&p.market==="receivingYards"&&p.position==="WR");
    expect(quarterback).toBeDefined();
    expect(receiver).toBeDefined();
    const result=simulateNflMatchup(game,snap,props,{
      seed:987,runs:4000,jointLegIds:[quarterback!.id,receiver!.id],
    });
    expect(result.joint).not.toBeNull();
    expect(result.joint!.hitRuns).toBeGreaterThanOrEqual(0);
    const pQB=result.props.find((p)=>p.id===quarterback!.id)!.rawModelHitRate;
    const pWR=result.props.find((p)=>p.id===receiver!.id)!.rawModelHitRate;
    expect(result.joint!.rawModelJointRate).toBeLessThanOrEqual(Math.min(pQB,pWR)+.0001);
    // QB yardage includes WR catches, making these market outcomes positively linked.
    expect(result.joint!.rawModelJointRate).toBeGreaterThan(result.joint!.independenceBenchmark);
  });
  it("is monotonic for alt lines using exactly the same simulated draws",()=>{
    const snap=snapshot(),props=candidateProps(snap);
    const pick=props.find((p)=>p.teamId==="14"&&p.market==="receivingYards");
    expect(pick).toBeDefined();
    const base={...pick!,line:25,id:pick!.athleteId+":receivingYards:25"};
    const hard={...pick!,line:100,id:pick!.athleteId+":receivingYards:100"};
    const sim=simulateNflMatchup(game,snap,[base,hard],{runs:1000,seed:4});
    const easier=sim.props.find((x)=>x.id===base.id)!.rawModelHitRate;
    const harder=sim.props.find((x)=>x.id===hard.id)!.rawModelHitRate;
    expect(easier).toBeGreaterThanOrEqual(harder);
  });
  it("does not allow future-week data to enter a current-week projection",()=>{
    const original=snapshot();
    const contaminated=snapshot([...original.players,...rows().map((r)=>({
      ...r,week:12,gameId:"FUTURE-"+r.gameId,
      targets:100,receptions:99,receivingYards:1000,rushingYards:1000,
    }))]);
    const props=candidateProps(original);
    const good=simulateNflMatchup(game,original,props,{runs:250,seed:888});
    const withFuture=simulateNflMatchup(game,contaminated,props,{runs:250,seed:888});
    expect(withFuture.props).toEqual(good.props);
  });
  it("PASSES rather than inventing probabilities when one team's data is absent",()=>{
    const snap=snapshot(rows().filter((p)=>p.team==="GB"));
    const result=simulateNflMatchup(game,snap,candidateProps(),{runs:100});
    expect(result.status).toBe("PASS");
    expect(result.props).toEqual([]);
    expect(result.joint).toBeNull();
  });
  it("enforces joint leg limits and shows no fake prices",()=>{
    const snap=snapshot(),props=candidateProps(snap);
    expect(()=>simulateNflMatchup(game,snap,props,{runs:100,jointLegIds:Array(7).fill("x")})).toThrow();
    const sim=simulateNflMatchup(game,snap,props,{runs:100,seed:8});
    expect(sim.modelStatus).toBe("UNCALIBRATED");
    expect(sim.props.every((p)=>!Object.prototype.hasOwnProperty.call(p,"fairOdds"))).toBe(true);
  });
});
