import { describe, expect, it } from "vitest";
import { clubHalfTimeKey, estimateFirstHalf, firstHalfCoverage } from "../lib/first-half-model";
import type { Fixture } from "../lib/types";
import type { HistoricalMatch } from "../lib/history";

const fixture:Fixture={
  id:"ucl-1",leagueId:"uefa.champions",league:"Champions League",
  kickoff:"2026-11-25T20:00:00Z",status:"scheduled",statusLabel:"Scheduled",
  source:"ESPN",sourceUpdatedAt:"2026-11-20T00:00:00Z",
  home:{id:"1",name:"Real Madrid",shortName:"Real Madrid",abbreviation:"RMA"},
  away:{id:"2",name:"Bayern Munich",shortName:"Bayern",abbreviation:"BAY"},
};
const results:HistoricalMatch[]=Array.from({length:150},(_,i)=>{
  const spanish=i%2===0;
  const homeTeam=spanish?(i%4===0?"Real Madrid CF":"Sevilla"):
    (i%4===1?"Bayern":"Borussia Dortmund");
  const awayTeam=spanish?(homeTeam==="Real Madrid CF"?"Sevilla":"Real Madrid CF"):
    (homeTeam==="Bayern"?"Borussia Dortmund":"Bayern");
  const homeGoals=2+i%2,awayGoals=1+i%2;
  const halfTimeHomeGoals=i%3===0?2:1;
  const halfTimeAwayGoals=i%4===0?1:0;
  return {
    id:"domestic-"+i,competition:spanish?"La Liga":"Bundesliga",
    season:i<75?"2025-26":"2026-27",
    date:new Date(Date.UTC(2025,7,1+i*3,12)).toISOString(),
    homeTeam,awayTeam,homeGoals,awayGoals,halfTimeHomeGoals,halfTimeAwayGoals,
    result:"H",source:"verified historical fixture",importedAt:"2026-11-23T00:00:00Z",
  };
});

describe("cross-competition first-half team attack and defense",()=>{
  it("maps canonical club aliases safely",()=>{
    expect(clubHalfTimeKey("Bayern Munich")).toBe(clubHalfTimeKey("Bayern"));
    expect(clubHalfTimeKey("Real Madrid CF")).toBe(clubHalfTimeKey("Real Madrid"));
    expect(clubHalfTimeKey("Paris Saint-Germain")).toBe(clubHalfTimeKey("Paris SG"));
    expect(clubHalfTimeKey("Inter")).toBe(clubHalfTimeKey("Internazionale"));
  });
  it("forecasts Champions League from clubs' own earlier domestic 1H matches",()=>{
    const model=estimateFirstHalf(results,fixture);
    expect(model).not.toBeNull();
    expect(model?.modelVersion).toBe("migo-first-half-cross-league-v2");
    expect(model?.homeTeamMatches).toBeGreaterThan(20);
    expect(model?.awayTeamMatches).toBeGreaterThan(20);
    expect(model?.trainingCompetitions.map(c=>c.name)).toEqual(["La Liga","Bundesliga"]);
    expect(model?.homeSignals.recentSample).toBeGreaterThan(0);
    expect(model?.awaySignals.recentSample).toBeGreaterThan(0);
    const coverage=firstHalfCoverage(results,fixture);
    expect(coverage.validHalfTime).toBe(150);
    expect(coverage.homeMatches).toBeGreaterThan(20);
  });
  it.each([["uefa.europa","Europa League"],["uefa.europa.conf","UEFA Conference League"]] as const)("uses both clubs' domestic data for %s",(leagueId,league)=>{
    const forecast=estimateFirstHalf(results,{...fixture,leagueId,league});
    expect(forecast?.homeTeamMatches).toBeGreaterThan(20);
    expect(forecast?.awayTeamMatches).toBeGreaterThan(20);
    expect(forecast?.trainingCompetitions.map(c=>c.name)).toEqual(["La Liga","Bundesliga"]);
  });
  it("responds to verifiable defensive leaks and 1H attacking performance",()=>{
    // League baseline also needs matches NOT involving Bayern, or a team-
    // specific defensive deterioration would shift the whole Bundesliga mean.
    const leagueControls=Array.from({length:100},(_,i)=>({
      ...results[1], id:"control-"+i,competition:"Bundesliga",
      date:new Date(Date.UTC(2025,7,1+i*4)).toISOString(),
      homeTeam:i%2?"RB Leipzig":"Mainz",awayTeam:i%2?"Mainz":"RB Leipzig",
      homeGoals:2,awayGoals:1,halfTimeHomeGoals:1,halfTimeAwayGoals:0,
    }));
    const base=estimateFirstHalf([...results,...leagueControls],fixture)!;
    const weakBayern=results.map(m=>{
      const b=clubHalfTimeKey(m.homeTeam)==="bayern" || clubHalfTimeKey(m.awayTeam)==="bayern";
      if(!b)return m;
      // Weaken Bayern's first-half defense in verified match rows.
      return {...m,
        homeGoals:3,awayGoals:3,
        halfTimeHomeGoals:clubHalfTimeKey(m.awayTeam)==="bayern"?2:1,
        halfTimeAwayGoals:clubHalfTimeKey(m.homeTeam)==="bayern"?2:1,
      };
    });
    const altered=estimateFirstHalf([...weakBayern,...leagueControls],fixture)!;
    expect(altered.homeSignals.defensiveVulnerability).toBeGreaterThan(0);
    expect(altered.awaySignals.defensiveVulnerability).toBeGreaterThan(base.awaySignals.defensiveVulnerability);
    expect(altered.expectedHomeGoals).toBeGreaterThan(base.expectedHomeGoals);
  });
  it("does not leak same-day or future results from domestic or European competitions",()=>{
    const before=estimateFirstHalf(results,fixture)!;
    const newer:HistoricalMatch={...results[0],
      date:"2026-11-25T00:00:00Z",id:"same-day",competition:"Champions League",
      homeTeam:"Real Madrid",awayTeam:"Bayern Munich",homeGoals:10,awayGoals:8,
      halfTimeHomeGoals:9,halfTimeAwayGoals:7,
    };
    const future={...newer,date:"2026-12-13T00:00:00Z",id:"future"};
    const after=estimateFirstHalf([...results,newer,future],fixture)!;
    expect(after.expectedHomeGoals).toEqual(before.expectedHomeGoals);
    expect(after.expectedAwayGoals).toEqual(before.expectedAwayGoals);
  });
  it("does not mix women's UEFA halftime history into the men's Champions League",()=>{
    const women:HistoricalMatch[]=results.slice(0,20).map((m,i)=>({
      ...m,id:"women-"+i,competition:"UEFA Women's Champions League",
      homeTeam:"Real Madrid",awayTeam:"Bayern Munich",homeGoals:9,awayGoals:8,
      halfTimeHomeGoals:8,halfTimeAwayGoals:7,
    }));
    const original=estimateFirstHalf(results,fixture)!;
    const altered=estimateFirstHalf([...results,...women],fixture)!;
    expect(altered.expectedHomeGoals).toEqual(original.expectedHomeGoals);
    expect(altered.expectedAwayGoals).toEqual(original.expectedAwayGoals);
  });
  it("refuses to substitute generic domestic strength when a club has no identifiable history",()=>{
    const unknown={...fixture,away:{...fixture.away,name:"Unsupported FC Example Club",shortName:"Example"}};
    expect(estimateFirstHalf(results,unknown)).toBeNull();
  });
});
