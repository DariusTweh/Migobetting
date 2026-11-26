import { describe, expect, it } from "vitest";
import { parseEspnHistory } from "../lib/espn-history";

const when = "2026-11-19T12:00:00Z";
function event(id: string, home: number | string, away: number | string, status: string = "STATUS_FINAL") {
  return {
    id, date: "2025-10-04T18:00:00Z",
    season: { year: 2025 },
    status: { type: { completed: true, name: status } },
    competitions: [{ competitors: [
      { homeAway: "home", score: home, team: { displayName: "Home FC" } },
      { homeAway: "away", score: away, team: { displayName: "Away FC" } },
    ] }],
  };
}
describe("ESPN historical soccer parser", () => {
  it("normalizes completed MLS matches without inventing odds", () => {
    const rows = parseEspnHistory({ events: [event("112", "2", "1")] }, "usa.1", when);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "espn:usa.1:112", competition: "MLS", homeGoals: 2, awayGoals: 1, result: "H", season: "2025" });
    expect(rows[0].odds).toBeUndefined();
  });
  it.each([["uefa.europa","Europa League"],["uefa.europa.conf","UEFA Conference League"]] as const)("imports %s without inventing halftime scores", (id,name)=>{
    const rows=parseEspnHistory({events:[event("116",2,1)]},id,when);
    expect(rows[0]).toMatchObject({competition:name,homeGoals:2,awayGoals:1});
    expect(rows[0].halfTimeHomeGoals).toBeUndefined();
  });
  it("accepts reconciled UEFA period scores",()=>{
    const game=event("117",2,1);
    const sides=game.competitions[0].competitors.map((side,i)=>({...side,linescores:i===0?[{value:1},{value:1}]:[{value:0},{value:1}]}));
    const rows=parseEspnHistory({events:[{...game,competitions:[{competitors:sides}]}]},"uefa.europa",when);
    expect(rows[0]).toMatchObject({halfTimeHomeGoals:1,halfTimeAwayGoals:0});
  });
  it("accepts UWCL finals and ignores unplayed or shootout fixtures", () => {
    const unplayed = event("113", 0, 0);
    unplayed.status.type.completed = false;
    unplayed.status.type.name = "STATUS_SCHEDULED";
    const rows = parseEspnHistory({ events: [event("114", 1, 1), event("115", 2, 2, "STATUS_FINAL_PENALTIES"), unplayed] }, "uefa.wchampions", when);
    expect(rows).toHaveLength(1);
    expect(rows[0].competition).toBe("UEFA Women's Champions League");
  });
});
