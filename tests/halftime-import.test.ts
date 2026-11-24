import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/historical/halftime/route";
import type { Fixture } from "../lib/types";
import { estimateFirstHalf, firstHalfCoverage } from "../lib/first-half-model";
import type { HistoricalMatch } from "../lib/history";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const csv = [
  "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG",
  "I1,14/08/2024,Inter,AC Milan,2,1,H,1,0",
  "I1,21/08/2024,AC Milan,Inter,1,1,D,0,1",
  "I1,22/08/2024,Inter,AC Milan,2,1,H,,",
].join("\n");
describe("three-season verified halftime importer", () => {
  it("only exposes actual HTHG and HTAG, and loads four season URLs for supported competition", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T06:00:00Z"));
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, text: async () => csv };
    }));
    const response = await GET(new Request("http://localhost/api/historical/halftime?league=ita.1"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(urls).toHaveLength(4);
    expect(urls.some((url) => url.includes("/2627/I1.csv"))).toBe(true);
    expect(urls.some((url) => url.includes("/2324/I1.csv"))).toBe(true);
    expect(data.matches).toHaveLength(8); // 2 real halftime scores x 4 seasons
    expect(data.matches.every((match: HistoricalMatch) =>
      Number.isInteger(match.halfTimeHomeGoals) && Number.isInteger(match.halfTimeAwayGoals))).toBe(true);
    expect(data.coverage).toHaveLength(4);
    expect(data.coverage[0].completed).toBe(3);
    expect(data.coverage[0].validHalfTime).toBe(2);
  });
  it("explicitly refuses unsupported competitions instead of substituting full-time scores", async () => {
    const response = await GET(new Request("http://localhost/api/historical/halftime?league=uefa.champions"));
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toContain("No verified");
  });
});

describe("expanded halftime historical window", () => {
  const fixture: Fixture = {
    id:"v1",leagueId:"ita.1",league:"Serie A",kickoff:"2026-11-25T20:00:00Z",
    status:"scheduled",statusLabel:"Scheduled",source:"ESPN",sourceUpdatedAt:"2026-11-20T00:00:00Z",
    home:{id:"1",name:"Inter",shortName:"Inter",abbreviation:"INT"},
    away:{id:"2",name:"AC Milan",shortName:"Milan",abbreviation:"MIL"},
  };
  const rows: HistoricalMatch[] = Array.from({length:400}, (_,i) => {
    const year=2023+Math.floor(i/120);
    const date=new Date(Date.UTC(year,9,1+(i%120),12)).toISOString();
    const isHome=i%2===0;
    return {
      id:"season-"+i,competition:"Serie A",season:String(year),date,
      homeTeam:isHome?"Inter":"AC Milan",awayTeam:isHome?"AC Milan":"Inter",
      homeGoals:2,awayGoals:1,halfTimeHomeGoals:i%4===0?0:1,halfTimeAwayGoals:i%3===0?1:0,
      result:"H",source:"test",importedAt:"2026-11-24T00:00:00Z",
    };
  });
  it("includes data from the third completed season while excluding the future", () => {
    const coverage=firstHalfCoverage(rows,fixture);
    expect(coverage.validHalfTime).toBeGreaterThan(60);
    expect(coverage.earliestDate?.startsWith("2023")).toBe(true);
    expect(estimateFirstHalf(rows,fixture)).not.toBeNull();
  });
});
