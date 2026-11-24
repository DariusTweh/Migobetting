import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/historical/continental-halftime/route";

afterEach(()=>vi.unstubAllGlobals());

describe("ESPN UEFA club halftime import",()=>{
  it("fetches completed club games and only imports verified halftime scores",async()=>{
    const fetches:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async (input:string)=>{
      fetches.push(input);
      if(input.includes("/summary?event=998")){
        return {ok:true,json:async()=>({
          header:{competitions:[{competitors:[
            {homeAway:"home",team:{id:"h"}},
            {homeAway:"away",team:{id:"a"}},
          ]}]},
          keyEvents:[
            {id:"g1",type:{text:"Goal"},team:{id:"h"},clock:{displayValue:"13"},period:{number:1}},
            {id:"g2",type:{text:"Goal"},team:{id:"a"},clock:{displayValue:"53"},period:{number:2}},
            {id:"g3",type:{text:"Goal"},team:{id:"h"},clock:{displayValue:"75"},period:{number:2}},
          ],
        })};
      }
      return {ok:true,json:async()=>({
        events:input.includes("dates=202610")?[{
          id:"998",date:"2026-10-12T19:00:00Z",season:{year:2026},
          status:{type:{completed:true,name:"STATUS_FINAL",detail:"Final"}},
          competitions:[{competitors:[
            {homeAway:"home",team:{displayName:"Real Madrid"},score:"2"},
            {homeAway:"away",team:{displayName:"Bayern Munich"},score:"1"},
          ]}],
        }]:[],
      })};
    }));
    const url="http://localhost/api/historical/continental-halftime?"+
      new URLSearchParams({
        league:"uefa.champions",home:"Real Madrid",away:"Bayern Munich",
        kickoff:"2026-11-25T20:00:00Z",
      });
    const response=await GET(new Request(url));
    expect(response.status).toBe(200);
    const payload=await response.json();
    expect(payload.coverage.previousCompletedMatchesForTeams).toBe(1);
    expect(payload.coverage.verifiedHalftimeScores).toBe(1);
    expect(payload.matches[0]).toMatchObject({
      homeTeam:"Real Madrid",awayTeam:"Bayern Munich",
      halfTimeHomeGoals:1,halfTimeAwayGoals:0,
      source:"ESPN reconciled goal event timestamps",
    });
    expect(fetches.some(url=>url.includes("summary?event=998"))).toBe(true);
    expect(fetches.length).toBeGreaterThan(25);
  });
  it("rejects invalid club request rather than fetching arbitrary events",async()=>{
    const response=await GET(new Request(
      "http://localhost/api/historical/continental-halftime?league=uefa.champions&home=A&away=A&kickoff=2026-11-25"));
    expect(response.status).toBe(400);
  });
});
