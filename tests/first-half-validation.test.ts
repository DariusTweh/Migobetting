import { describe, expect, it } from "vitest";
import { validateFirstHalfMultiSeason } from "../lib/first-half-validation";
import type { HistoricalMatch } from "../lib/history";

const teams = ["Arsenal","Chelsea","Everton","Fulham","Liverpool","Brighton","Brentford","Wolves"];
const matches: HistoricalMatch[] = Array.from({ length: 450 }, (_, i) => {
  const homeTeam = teams[i % 8], awayTeam = teams[(i + 1 + Math.floor(i / 8)) % 8];
  const halfTimeHomeGoals = i % 3, halfTimeAwayGoals = (i * 11) % 2;
  const homeGoals = halfTimeHomeGoals + i % 2;
  const awayGoals = halfTimeAwayGoals + (i + 1) % 2;
  return {
    id: "h" + i, competition: "Premier League",
    season: i < 150 ? "2023-24" : i < 300 ? "2024-25" : "2025-26",
    date: new Date(Date.UTC(2023, 7, 1 + i * 2, 12)).toISOString(),
    homeTeam, awayTeam, halfTimeHomeGoals, halfTimeAwayGoals, homeGoals, awayGoals,
    result: homeGoals > awayGoals ? "H" : homeGoals < awayGoals ? "A" : "D",
    source: "verified test", importedAt: "2026-11-22T00:00:00Z",
  };
});

describe("first-half multi-season validation", () => {
  it("returns independent, chronological season diagnostics and calibrated market bins", () => {
    const report = validateFirstHalfMultiSeason(matches, "Premier League", 100);
    expect(report.perSeason.map((s) => s.season)).toEqual(["2023-24","2024-25","2025-26"]);
    expect(report.candidates).toBe(300);
    expect(report.scored).toBeGreaterThan(0);
    expect(report.perSeason.reduce((sum,s) => sum + s.scored, 0)).toBe(report.scored);
    for (const m of report.metrics) {
      expect(m.evaluated).toBe(report.scored);
      expect(m.brier).toBeGreaterThanOrEqual(0);
      expect(m.brier).toBeLessThanOrEqual(1);
      expect(m.logLoss).toBeGreaterThanOrEqual(0);
      expect(m.observedRate).toBeGreaterThanOrEqual(0);
      expect(m.observedRate).toBeLessThanOrEqual(1);
      expect(m.hitsAt68).toBeLessThanOrEqual(m.passesAt68);
    }
    for (const key of ["first-half-over-0.5", "first-half-over-1.5"] as const) {
      expect(report.calibration[key].reduce((total, bin) => total + bin.count, 0)).toBe(report.scored);
    }
  });
  it("refuses to infer halftime outcomes from missing halftime scores", () => {
    const missing = matches.map((m) => ({ ...m, halfTimeHomeGoals: undefined, halfTimeAwayGoals: undefined }));
    const report = validateFirstHalfMultiSeason(missing, "Premier League");
    expect(report.scored).toBe(0);
    expect(report.perSeason).toEqual([]);
    expect(report.metrics.every((m) => m.brier === null && m.evaluated === 0)).toBe(true);
  });
  it("does not merge scores from other competitions", () => {
    const altered = matches.concat(matches.map((m) => ({ ...m, id: "g" + m.id,
      competition: "Bundesliga", halfTimeHomeGoals: 0, halfTimeAwayGoals: 0 })));
    expect(validateFirstHalfMultiSeason(altered,"Premier League",70).metrics)
      .toEqual(validateFirstHalfMultiSeason(matches,"Premier League",70).metrics);
  });
});
