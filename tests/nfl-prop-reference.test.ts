import {describe,it,expect} from "vitest";
import {rankNflProps,type NflGame} from "../lib/nfl/engine";
import {applyNflverseIntelligence,weeklyBoxLinesForMatchup,type NflverseSnapshot,type WeeklyUsage} from "../lib/nfl/nflverse";
const game:NflGame={id:"401873081",season:2026,week:12,kickoff:"2099-11-26T18:00:00Z",
 status:"scheduled",statusLabel:"Scheduled",
 home:{id:"8",name:"Detroit Lions",abbreviation:"DET"},
 away:{id:"3",name:"Chicago Bears",abbreviation:"CHI"}};
const attempts=[32,31,34,35,27,29],yards=[201,267,220,240,180,263],tds=[1,2,1,2,0,2];
const players:WeeklyUsage[]=attempts.map((attempt,week)=>({
 id:"caleb",name:"Caleb Williams",position:"QB",team:"CHI",
 season:2026,week:week+5,gameId:"2026_"+(week+5)+"_CHI_DET",opponent:"DET",
 targets:0,targetShare:0,carries:4,passingAttempts:attempt,passingYards:yards[week],
 passingTds:tds[week],rushingYards:18,receivingYards:0,receptions:0,
}));
const snap:NflverseSnapshot={players,snaps:[],injuries:[],defense:[],
 coverage:{stats:"available",snaps:"unavailable",injuries:"unavailable",statsRows:6,snapsRows:0,
 injuryRows:0,week:12,season:2026,attribution:"synthetic test"}};
describe("NFL alternate prop reference and research eligibility",()=>{
 it("always displays QB 200+ and 1 passing TD baseline even if other alts are higher",()=>{
  const picks=rankNflProps(game,weeklyBoxLinesForMatchup(game,players));
  expect(picks.some(p=>p.player==="Caleb Williams"&&p.market==="passingYards"&&p.line===200)).toBe(true);
  expect(picks.some(p=>p.player==="Caleb Williams"&&p.market==="passingTds"&&p.line===1)).toBe(true);
 });
 it("does not exclude a supported QB reference merely for an arbitrary near-threshold research score",()=>{
  const raw=rankNflProps(game,weeklyBoxLinesForMatchup(game,players));
  const ranked=applyNflverseIntelligence(game,raw,snap);
  const base=ranked.find(p=>p.market==="passingYards"&&p.line===200)!;
  expect(base.sampleGames).toBe(6);
  expect(base.historicalHits).toBeGreaterThanOrEqual(3);
  expect(base.projection).toBeGreaterThan(200);
  expect(base.grade).toBe("RESEARCH");
  expect(base.researchScore).toBeGreaterThanOrEqual(55);
 });
 it("preserves unqualified higher passing TD alternatives with explicit PASS reasons",()=>{
  const weakened:WeeklyUsage[]=players.map((p,i)=>({...p,passingTds:i===0?2:0}));
  const raw=rankNflProps(game,weeklyBoxLinesForMatchup(game,weakened));
  const tds=raw.filter(p=>p.market==="passingTds");
  expect(tds.some(p=>p.line===1)).toBe(true);
  expect(tds.some(p=>p.grade==="PASS"&&p.decisionReasons?.length)).toBe(true);
 });
});
