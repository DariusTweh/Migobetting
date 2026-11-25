import test from "node:test";
import assert from "node:assert/strict";
import {captureWindow,csvRows,gradeFrozen,gradeObservations,makeRecord} from "./nfl-prospective.mjs";

test("records only within prior kickoff windows",()=>{
 const t=Date.parse("2026-11-24T20:00:00Z");
 const date=(h)=>new Date(t+h*3600000).toISOString();
 assert.equal(captureWindow(date(37),t),"early");
 assert.equal(captureWindow(date(3),t),"pregame");
 assert.equal(captureWindow(date(-1),t),null);
 assert.equal(captureWindow(date(122),t),null);
});
test("CSV handles quotes, commas, headers and empty values without OCR or heuristics",()=>{
 const csv='player_id,player_display_name,passing_yards\r\n"00-123","O""Brien, Junior",210\r\n00-234,"Example",\r\n';
 assert.deepEqual(csvRows(csv),[
  {player_id:"00-123",player_display_name:'O"Brien, Junior',passing_yards:"210"},
  {player_id:"00-234",player_display_name:"Example",passing_yards:""},
 ]);
});
const game={id:"401873081",status:"scheduled",kickoff:"2026-10-15T18:00:00Z",
 season:2026,week:7,home:{id:"8",abbreviation:"DET"},away:{id:"3",abbreviation:"CHI"}};
const preview={game,fetchedAt:"2026-10-15T10:00:00Z",
 version:"example-unverified-v1",props:[
  {id:"nflverse:caleb:passingYards:200",athleteId:"nflverse:caleb",player:"Example QB",
   teamId:"3",market:"passingYards",line:200,grade:"RESEARCH"},
  {id:"nflverse:norow:receivingYards:25",athleteId:"nflverse:norow",player:"Missing Wideout",
   teamId:"8",market:"receivingYards",line:25,grade:"PASS"},
 ],simulation:{props:[{id:"nflverse:caleb:passingYards:200",rawModelHitRate:.64}]},
 gameMarkets:{status:"READY",markets:[
  {id:"401873081:moneyline:home:na",market:"moneyline",side:"home",line:null,rawRate:.6},
  {id:"401873081:total:over:45.5",market:"total",side:"over",line:45.5,rawRate:.45},
 ]}};
test("refuses a postgame API prediction even if data is otherwise complete",()=>{
 assert.throws(()=>makeRecord(preview,"early","https://example.test/api",
  Date.parse("2026-10-15T21:00:00Z")),/before kickoff/);
 const wrong={...preview,fetchedAt:"2026-10-15T20:00:00Z"};
 assert.throws(()=>makeRecord(wrong,"early","https://example.test/api",
  Date.parse("2026-10-15T20:00:10Z")),/before kickoff/);
});
test("full pregame result is frozen before kickoff with a deterministic source hash",()=>{
 const a=makeRecord(preview,"early","https://example.test/api",
  Date.parse("2026-10-15T11:00:00Z"));
 const b=makeRecord(preview,"early","https://example.test/api",
  Date.parse("2026-10-15T11:00:00Z"));
 assert.equal(a.archiveHash,b.archiveHash);
 assert.equal(a.playerPicks.length,2);
 assert.equal(a.gameMarkets.markets.length,2);
});
test("grades historical winner/total/QB prop but not unmatched or absent DNP as loss",()=>{
 const record=makeRecord(preview,"early","https://example.test/api",
  Date.parse("2026-10-15T11:00:00Z"));
 const output=gradeObservations(record,{homeScore:24,awayScore:21},[
  {season:"2026",week:"7",team:"CHI",player_id:"caleb",passing_yards:"237"},
 ]);
 assert.equal(output.gameMarkets[0].actual,1);
 assert.equal(output.gameMarkets[1].actual,0);
 assert.equal(output.playerPicks[0].actual,1);
 assert.equal(output.playerPicks[0].brier,Math.round((.64-1)**2*1e5)/1e5);
 assert.equal(output.playerPicks[1].actual,null);
 assert.equal(output.playerPicks[1].brier,null);
});
test("does not grade until both teams have final weekly source rows",()=>{
 const record=makeRecord(preview,"early","https://example.test/api",
  Date.parse("2026-10-15T11:00:00Z"));
 const schedules=[{season:"2026",week:"7",game_type:"REG",home_team:"DET",away_team:"CHI",home_score:"24",away_score:"21"}];
 const pending=gradeFrozen(record,schedules,[{season:"2026",week:"7",team:"CHI",player_id:"caleb",passing_yards:"237"}]);
 assert.equal(pending.status,"PENDING");
 const final=gradeFrozen(record,schedules,[
  {season:"2026",week:"7",team:"CHI",player_id:"caleb",passing_yards:"237"},
  {season:"2026",week:"7",team:"DET",player_id:"rb",rushing_yards:"123"},
 ]);
 assert.equal(final.status,"COMPLETE");
 assert.deepEqual(final.finalScore,{home:24,away:21});
});
