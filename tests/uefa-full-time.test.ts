import { describe,it,expect } from "vitest";
import { estimateHistoricalGoals, type HistoricalMatch } from "../lib/history";
const rows:HistoricalMatch[]=Array.from({length:100},(_,i)=>({id:"dom"+i,competition:i%2?"Swiss Super League":"Premier League",season:"2025-26",date:new Date(Date.UTC(2025,7,1+i*3)).toISOString(),homeTeam:i%2?"Basel":"Manchester United",awayTeam:i%2?"Lugano":"Everton",homeGoals:2,awayGoals:1,result:"H",source:"synthetic test",importedAt:"2026-11-25"}));
const input={competition:"Europa League",homeTeam:"Manchester United",awayTeam:"Basel",kickoff:"2026-11-25T21:00:00Z"};
describe("UEFA full-time cross-league engine",()=>{
 it.each(["Champions League","Europa League","UEFA Conference League"])("uses domestic evidence for %s",competition=>{const x=estimateHistoricalGoals(rows,{...input,competition});expect(x?.homeMatches).toBe(50);expect(x?.awayMatches).toBe(50);expect(x?.expectedHomeGoals).toBeGreaterThan(0);});
 it("does not leak same-day, future or women's results",()=>{const a=estimateHistoricalGoals(rows,input);const later={...rows[0],id:"later",date:input.kickoff,homeGoals:9};const women={...rows[0],id:"women",competition:"UEFA Women's Champions League",homeGoals:9};expect(estimateHistoricalGoals([...rows,later,women],input)).toEqual(a);});
 it("requires identifiable club history",()=>expect(estimateHistoricalGoals(rows,{...input,awayTeam:"Unknown"})).toBeNull());
});