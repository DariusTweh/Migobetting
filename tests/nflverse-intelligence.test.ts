import { describe, expect, it } from "vitest";
import type { NflGame, NflBoxLine } from "../lib/nfl/engine";
import { rankNflProps } from "../lib/nfl/engine";
import {
  applyNflverseIntelligence, canonicalNflTeam, defensiveVolume, normalizePlayer,
  parseInjuries, parseNflCsv, parseSnapCounts, parseWeeklyUsage, weeklyBoxLinesForMatchup,
  type NflverseSnapshot,
} from "../lib/nfl/nflverse";

const game: NflGame = {
  id: "4010001", season: 2026, week: 12, kickoff: "2026-11-29T21:00:00Z",
  status: "scheduled", statusLabel: "Scheduled",
  home: { id: "17", name: "Washington", abbreviation: "WAS" },
  away: { id: "1", name: "Cincinnati", abbreviation: "CIN" },
};
const espnRows: NflBoxLine[] = [1,2,3,4,5,6].map((week) => ({
  athleteId: "99", name: "Ja'Marr Chase", position: "WR", teamId: "1",
  gameId: "past-" + week, date: "2026-10-" + String(week + 10).padStart(2,"0") + "T20:00:00Z",
  receivingYards: 90 + week, receptions: 6, targets: 9,
}));
function usageRows(weeks = [5,6,7,8,9,10]) {
  return weeks.map((week) => ({
    season: "2026", season_type: "REG", week: String(week),
    player_id: "00-123", player_display_name: "Ja'Marr Chase", position: "WR", team: "CIN",
    opponent_team: "WAS", game_id: "2026_" + week + "_CIN_WAS",
    targets: "9", target_share: "0.28", carries: "0", attempts: "0", receptions: "6",
  }));
}
function snapRows() {
  return [8,9,10].map((week) => ({
    season:"2026", week:String(week), game_type:"REG", player:"Ja'Marr Chase",
    team:"CIN", offense_pct:"0.89", offense_snaps:"55",
  }));
}
function snapshot(
  overrides: Partial<NflverseSnapshot> = {},
): NflverseSnapshot {
  return {
    players:parseWeeklyUsage(usageRows(),2026,12),
    snaps:parseSnapCounts(snapRows(),2026,12),
    injuries:[],defense:[],
    coverage:{stats:"available",snaps:"available",injuries:"available",
      statsRows:6,snapsRows:3,injuryRows:0,week:12,season:2026,
      attribution:"nflverse/nflverse-data (CC BY 4.0)"},
    ...overrides,
  };
}
describe("nflverse supplemental intelligence",()=>{
  it("parses quoted CSV correctly and detects schema drift",()=>{
    const csv = 'name,team,note\r\n"Ja\'Marr Chase",CIN,"said ""hi"", then left"\r\n';
    expect(parseNflCsv(csv,["name","team"])[0].note).toBe('said "hi", then left');
    expect(()=>parseNflCsv("x,y\n1,2\n",["team"])).toThrow(/schema/);
  });
  it("normalizes teams and punctuation without losing identities",()=>{
    expect(canonicalNflTeam("WSH")).toBe("WAS");
    expect(canonicalNflTeam("JAX")).toBe("JAC");
    expect(normalizePlayer("Ja’Marr Chase")).toBe(normalizePlayer("Ja'Marr Chase"));
  });
  it("enforces strictly earlier weeks for usage and snap participation",()=>{
    const usage=parseWeeklyUsage(usageRows([10,11,12,13]),2026,12);
    expect(usage.map((r)=>r.week)).toEqual([10,11]);
    const snaps=parseSnapCounts(snapRows(),2026,10);
    expect(snaps.map((r)=>r.week)).toEqual([8,9]);
    expect(snaps[0].offensePct).toBe(89);
  });
  it("uses only injury updates known before kickoff/now",()=>{
    const reports = [
      {season:"2026",week:"12",team:"CIN",full_name:"Ja'Marr Chase",
        report_status:"Questionable",practice_status:"Limited",report_primary_injury:"Hamstring",
        date_modified:"2026-11-28T10:00:00Z"},
      {season:"2026",week:"12",team:"CIN",full_name:"Ja'Marr Chase",
        report_status:"Out",practice_status:"Did Not Participate",report_primary_injury:"Hamstring",
        date_modified:"2026-11-30T10:00:00Z"},
      {season:"2026",week:"11",team:"CIN",full_name:"Ja'Marr Chase",
        report_status:"Out",practice_status:"Did Not Participate",report_primary_injury:"Hamstring",
        date_modified:"2026-11-20T10:00:00Z"},
    ];
    const known=parseInjuries(reports,2026,12,Date.parse("2026-11-29T15:00:00Z"));
    expect(known).toHaveLength(1);
    expect(known[0].status).toBe("Questionable");
  });
  it("blocks players listed OUT, without claiming an unknown player is active",()=>{
    const props=rankNflProps(game,espnRows);
    const active = applyNflverseIntelligence(game,props,snapshot());
    expect(active[0].intelligence?.snapShare).toBe(89);
    expect(active[0].intelligence?.targetShare).toBeCloseTo(28);
    expect(active[0].intelligence?.status).toBe("unverified");
    expect(active[0].calibratedProbability).toBeNull();
    const injury = {name:"Ja'Marr Chase",team:"CIN",season:2026,week:12,
      status:"Out",practice:"DNP",injury:"Hamstring",modifiedAt:"2026-11-29T11:00:00Z"};
    const ruledOut=applyNflverseIntelligence(game,props,snapshot({injuries:[injury]}));
    expect(ruledOut.every(p=>p.grade==="PASS")).toBe(true);
  });
  it("does not silently merge homonymous player rows with multiple IDs",()=>{
    const props=rankNflProps(game,espnRows);
    const duplicate=snapshot();
    duplicate.players=[...duplicate.players,{...duplicate.players[0],id:"other-gsis-id"}];
    const result=applyNflverseIntelligence(game,props,duplicate);
    expect(result[0].intelligence).toBeUndefined();
  });
  it("generates viable player lines from nflverse weekly records when ESPN schedules return none",()=>{
    const weeklies=parseWeeklyUsage(usageRows().map((r,i)=>({
      ...r, receiving_yards:String(80+i), rushing_yards:"0", passing_yards:"0",
      passing_tds:"0", attempts:"0", targets:"9", receptions:"6",
    })),2026,12);
    const lines=weeklyBoxLinesForMatchup(game,weeklies);
    expect(lines).toHaveLength(6);
    expect(lines.every((row)=>row.source==="nflverse" && row.date==="")).toBe(true);
    const picks=rankNflProps(game,lines);
    expect(picks.some((p)=>p.market==="receivingYards" && p.player==="Ja'Marr Chase")).toBe(true);
  });
  it("cannot backfill current or future fixture week stats into a forecast",()=>{
    const future=parseWeeklyUsage(usageRows([11,12,13]).map((r)=>({
      ...r, receiving_yards:"300", rushing_yards:"0", passing_yards:"0",
      passing_tds:"0", attempts:"0",
    })),2026,14);
    const lines=weeklyBoxLinesForMatchup(game,future);
    expect(lines.map((row)=>row.week)).toEqual([11]);
    expect(lines.every((row)=>row.week! < game.week!)).toBe(true);
  });
  it("does not invent opponent league baselines from a tiny sample",()=>{
    expect(defensiveVolume(parseWeeklyUsage(usageRows(),2026,12))).toEqual([]);
  });
});
