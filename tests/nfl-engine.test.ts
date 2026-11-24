import { describe, expect, it } from "vitest";
import { historyBeforeKickoff, rankNflProps, NFL_WEIGHTS, type NflBoxLine, type NflGame } from "../lib/nfl/engine";
import { parseNflBoxscore, parseNflEvent } from "../lib/nfl/espn";
const game: NflGame = {
  id:"event-2", kickoff:"2026-11-29T21:00:00Z", status:"scheduled", statusLabel:"Scheduled",
  home:{id:"A",name:"Home",abbreviation:"H"},away:{id:"B",name:"Away",abbreviation:"B"},
};
const rows: NflBoxLine[] = [1,2,3,4,5,6].map((week) => ({
  gameId:"prev-"+week, date:"2026-10-"+String(week+10).padStart(2,"0")+"T20:00:00Z",
  athleteId:"qb-1",teamId:"A",name:"Quarterback",position:"QB",
  passingYards:300-week*5,passingTds:2,passingAttempts:32,
}));
describe("NFL evidence gate and forecast",()=>{
  it("uses strictly earlier games without hindsight",()=>{
    const future = {...rows[0],date:"2026-12-01T20:00:00Z",passingYards:9000};
    expect(historyBeforeKickoff([...rows,future],game.kickoff)).toHaveLength(6);
    expect(rankNflProps(game,[...rows,future])[0].projection).toBeLessThan(400);
  });
  it("weights research factors 35/25/20/10/10 and never claims calibrated odds",()=>{
    expect(Object.values(NFL_WEIGHTS).reduce((a,b)=>a+b,0)).toBeCloseTo(1);
    const picks=rankNflProps(game,rows);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks[0].researchScore).toBeLessThanOrEqual(69);
    expect(picks[0].calibratedProbability).toBeNull();
    expect(picks[0].fairOdds).toBeNull();
  });
  it("does not turn incomparable positional team totals into artificial matchup confidence",()=>{
    const base=rankNflProps(game,rows)[0];
    const allowed={B:[{market:"passingYards" as const,position:"QB",allowedMean:600,sampleGames:6}]};
    const withOpponent=rankNflProps(game,rows,allowed)[0];
    expect(withOpponent.factors.matchup).toBe(50);
    expect(withOpponent.researchScore).toBe(base.researchScore);
  });
  it("refuses short samples",()=>{
    expect(rankNflProps(game,rows.slice(0,2))).toEqual([]);
  });
  it("parses ESPN labeled columns and never fabricates absent stats",()=>{
    const box={boxscore:{players:[{team:{id:"A"},statistics:[
      {name:"passing",labels:["C/ATT","YDS","TD"],athletes:[{athlete:{id:"qb",displayName:"Test QB",position:{abbreviation:"QB"}},stats:["23/31","280","3"]}]},
      {name:"receiving",labels:["REC","YDS","TGTS"],athletes:[{athlete:{id:"wr",displayName:"Test WR",position:{abbreviation:"WR"}},stats:["6","91","8"]}]}
    ]}]}};
    const out=parseNflBoxscore(box,"g1","2026-10-01T20:00:00Z");
    expect(out.find(x=>x.athleteId==="qb")?.passingAttempts).toBe(31);
    expect(out.find(x=>x.athleteId==="qb")?.passingYards).toBe(280);
    expect(out.find(x=>x.athleteId==="wr")?.targets).toBe(8);
    expect(out.find(x=>x.athleteId==="wr")?.rushingYards).toBeUndefined();
  });
  it("identifies team sides by homeAway independent of array order",()=>{
    const raw={id:"40100000",date:"2026-11-29T21:00:00Z",status:{type:{name:"STATUS_SCHEDULED"}},
      competitions:[{competitors:[
        {homeAway:"away",team:{id:"B",displayName:"Away",abbreviation:"B"}},
        {homeAway:"home",team:{id:"A",displayName:"Home",abbreviation:"A"}}
      ]}]};
    expect(parseNflEvent(raw)?.home.id).toBe("A");
    expect(parseNflEvent(raw)?.status).toBe("scheduled");
  });
});
