import {describe,it,expect} from "vitest";
import {
  extractHistoricalFixtures, validateNflSeason, NFL_VALIDATION_VERSION,
} from "../lib/nfl/validation";
import type {WeeklyUsage,SnapRecord} from "../lib/nfl/nflverse";

const actors = [
  {id:"qb",position:"QB",targets:0,receptions:0,receivingYards:0,carries:3,rushingYards:13,attempts:35,passingYards:282,passingTds:2},
  {id:"wr1",position:"WR",targets:11,receptions:8,receivingYards:99,carries:0,rushingYards:0,attempts:0,passingYards:0,passingTds:0},
  {id:"wr2",position:"WR",targets:7,receptions:5,receivingYards:70,carries:0,rushingYards:0,attempts:0,passingYards:0,passingTds:0},
  {id:"te",position:"TE",targets:5,receptions:4,receivingYards:45,carries:0,rushingYards:0,attempts:0,passingYards:0,passingTds:0},
  {id:"rb",position:"RB",targets:5,receptions:3,receivingYards:33,carries:20,rushingYards:85,attempts:0,passingYards:0,passingTds:0},
  {id:"rb2",position:"RB",targets:2,receptions:1,receivingYards:12,carries:7,rushingYards:30,attempts:0,passingYards:0,passingTds:0},
];
function fixtureData() {
  const players:WeeklyUsage[]=[];
  const snaps:SnapRecord[]=[];
  for(let week=1;week<=11;week++){
    const gameId="2099_"+String(week).padStart(2,"0")+"_GB_LAR";
    for(const team of ["GB","LAR"]){
      for(const actor of actors){
        players.push({
          id:team+actor.id,name:team+" "+actor.id,position:actor.position,
          team,opponent:team==="GB"?"LAR":"GB",
          gameId,season:2099,week,
          targets:actor.targets,targetShare:actor.targets/35,
          carries:actor.carries,receptions:actor.receptions,
          receivingYards:actor.receivingYards + (week%5),
          rushingYards:actor.rushingYards + (week%3),
          passingAttempts:actor.attempts,passingYards:actor.passingYards+(week%6),
          passingTds:actor.passingTds,
        });
        snaps.push({name:team+" "+actor.id,team,season:2099,week,
          offensePct:actor.position==="QB"?100:78,offenseSnaps:55});
      }
    }
  }
  return {season:2099,players,snaps};
}
describe("NFL chronological out-of-sample diagnostics",()=>{
  it("requires a verifiable two-team fixture with reciprocal opponents",()=>{
    const sample=fixtureData();
    const clean=extractHistoricalFixtures(sample.players,2099);
    expect(clean).toHaveLength(11);
    const falsified:WeeklyUsage={...sample.players[0],gameId:"2099_12_NYJ_BUF"};
    expect(extractHistoricalFixtures([falsified],2099)).toHaveLength(0);
    const noOpp=sample.players.map(r=>({...r,opponent:"NYJ"}));
    expect(extractHistoricalFixtures(noOpp,2099)).toHaveLength(0);
  });
  it("trains on weeks 7 and 8 only; held-out weeks 9 and 10 are disjoint",()=>{
    const report=validateNflSeason(fixtureData(),{simulationsPerGame:100,firstWeek:7,lastWeek:10});
    expect(report.trainingWeeks).toEqual([7,8]);
    expect(report.heldoutWeeks).toEqual([9,10]);
    expect(report.deploymentGate).toBe("RESEARCH_ONLY");
    expect(report.version).toBe(NFL_VALIDATION_VERSION);
    expect(report.gamesEvaluated).toBeGreaterThan(0);
    expect(report.predictionsGraded).toBeGreaterThan(0);
    expect(report.overall.trainCount).toBeGreaterThan(0);
    expect(report.overall.testCount).toBeGreaterThan(0);
    expect(report.overall.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(report.overall.researchCalibrated).toBeNull();
    expect(report.overall.uncalibrated.brier).toBeGreaterThanOrEqual(0);
    expect(report.overall.uncalibrated.brier).toBeLessThanOrEqual(1);
    expect(report.integrity.contemporaryInjurySnapshot).toBe(false);
    expect(report.integrity.archivedAtKickoff).toBe(false);
  });
  it("ignores contaminated later-week outcomes even with massive altered production",()=>{
    const history=fixtureData(),settings={simulationsPerGame:100,firstWeek:7,lastWeek:10};
    const baseline=validateNflSeason(history,settings);
    const contaminated={
      ...history,players:history.players.map(r=>r.week===11?{
        ...r,targets:99,receivingYards:9000,rushingYards:9000,
        passingYards:9000,receptions:99,
      }:r),
    };
    const test=validateNflSeason(contaminated,settings);
    expect(test.overall).toEqual(baseline.overall);
    expect(test.markets).toEqual(baseline.markets);
  });
  it("fits monotone training-only reliability bins without live odds",()=>{
    const report=validateNflSeason(fixtureData(),{simulationsPerGame:100,firstWeek:7,lastWeek:10});
    const bins=report.overall.trainBins;
    expect(bins).toHaveLength(5);
    for(let i=1;i<bins.length;i++){
      expect(bins[i].trainedMapping).toBeGreaterThanOrEqual(bins[i-1].trainedMapping);
    }
    expect(report.markets.every(m=>m.status==="INSUFFICIENT_EVIDENCE")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("fairOdds");
  });
  it("returns PASS diagnostic if not enough distinct sequential weeks exist",()=>{
    const source=fixtureData();
    const report=validateNflSeason({...source,players:source.players.filter(p=>p.week<=6)},{
      simulationsPerGame:100,firstWeek:7,
    });
    expect(report.status).toBe("INSUFFICIENT_DATA");
    expect(report.predictionsGraded).toBe(0);
  });
});
