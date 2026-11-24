import { describe, expect, it } from "vitest";
import { enrichEspnHalfTime } from "../lib/espn-half-events";
import type { HistoricalMatch } from "../lib/history";

const match:HistoricalMatch={
  id:"espn:uefa.champions:999",competition:"Champions League",season:"2026",
  date:"2026-10-20T19:00:00Z",
  homeTeam:"Real Madrid",awayTeam:"Bayern Munich",
  homeGoals:2,awayGoals:1,result:"H",source:"ESPN scoreboard",importedAt:"2026-11-01T00:00:00Z",
};
const teams=(homeLines?:unknown[],awayLines?:unknown[])=>({
  header:{competitions:[{competitors:[
    {homeAway:"home",team:{id:"10"},linescores:homeLines},
    {homeAway:"away",team:{id:"20"},linescores:awayLines},
  ]}]},
});
const event=(id:string, teamId:string,clock:string,period:number)=>({
  id,type:{text:"Goal"},team:{id:teamId},
  clock:{displayValue:clock},period:{number:period},
});

describe("ESPN verified UEFA halftime source",()=>{
  it("uses reconciled period-by-period scorelines",()=>{
    const data=teams([{value:1},{value:1}],[{value:0},{value:1}]);
    expect(enrichEspnHalfTime(data,match)).toMatchObject({
      halfTimeHomeGoals:1,halfTimeAwayGoals:0,source:"ESPN verified half-by-half linescores",
    });
  });
  it("counts 45+ stoppage time as first half and reconciles every goal",()=>{
    const data={...teams(),keyEvents:[
      event("a","10","45+2",1),event("b","20","46",2),event("c","10","90+3",2),
    ]};
    expect(enrichEspnHalfTime(data,match)).toMatchObject({
      halfTimeHomeGoals:1,halfTimeAwayGoals:0,
      source:"ESPN reconciled goal event timestamps",
    });
  });
  it("does not trust incomplete scoring-event feeds",()=>{
    expect(enrichEspnHalfTime({...teams(),keyEvents:[
      event("a","10","30",1), event("b","20","60",2),
    ]},match)).toBeNull();
  });
  it("does not invent a 0-0 halftime result from missing ESPN fields",()=>{
    expect(enrichEspnHalfTime(teams(),match)).toBeNull();
    expect(enrichEspnHalfTime({...teams(),keyEvents:[]},match)).toBeNull();
  });
  it("requires both sides of a linescore to be reconciled with the full-time score",()=>{
    const invalid=teams([{value:1},{value:1}],[{value:0},{value:0}]);
    expect(enrichEspnHalfTime(invalid,match)).toBeNull();
  });
});
