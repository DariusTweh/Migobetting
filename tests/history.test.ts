import { describe, expect, it } from "vitest";
import { chooseBacktestSelection, estimateHistoricalGoals, normalizeTeamName, parseHistoricalCsv, runHistoricalBacktest, settlesBacktestSelection, type HistoricalMatch, type MarketProbabilities } from "../lib/history";

describe("historical ingestion and replay", () => {
  it("automatically chooses the strongest market side and settles unders, BTTS No, and double chance", () => {
    const probabilities: MarketProbabilities = { home: 0.55, draw: 0.27, away: 0.18, homeOrDraw: 0.82, awayOrDraw: 0.45, homeOrAway: 0.73, over15: 0.7, under15: 0.3, over25: 0.42, under25: 0.58, over35: 0.14, under35: 0.86, btts: 0.44, bttsNo: 0.56 };
    expect(chooseBacktestSelection("best-pick", probabilities, 0.68)).toEqual(["Under 3.5", 0.86, "Under 3.5 goals"]);
    expect(chooseBacktestSelection("double-chance", probabilities, 0.8)?.[0]).toBe("Home or Draw");
    expect(settlesBacktestSelection("Under 3.5", { homeGoals: 2, awayGoals: 1, result: "H" })).toBe(true);
    expect(settlesBacktestSelection("BTTS No", { homeGoals: 2, awayGoals: 0, result: "H" })).toBe(true);
    expect(settlesBacktestSelection("Away or Draw", { homeGoals: 1, awayGoals: 1, result: "D" })).toBe(true);
  });

  it("parses compatible CSV and rejects duplicate identity changes", () => {
    const csv = "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,AvgH,AvgD,AvgA\nE0,10/08/2025,Man City,Chelsea,2,1,H,1.8,3.5,4.2\n";
    const parsed = parseHistoricalCsv(csv, { season: "2025–26" });
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0].id).toContain("manchester city");
    expect(parsed.matches[0].odds?.home).toBe(1.8);
  });

  it("matches provider and ESPN team-name variants across supported leagues", () => {
    expect(normalizeTeamName("M'gladbach")).toBe(normalizeTeamName("Borussia Mönchengladbach"));
    expect(normalizeTeamName("Paris SG")).toBe(normalizeTeamName("Paris Saint-Germain"));
    expect(normalizeTeamName("Verona")).toBe(normalizeTeamName("Hellas Verona"));
  });

  it("gives more weight to recent team strength than stale results", () => {
    const teams = ["A", "B", "C", "D"];
    const history = (strongRecently: boolean): HistoricalMatch[] => Array.from({ length: 120 }, (_, index) => {
      const homeTeam = teams[index % 4];
      const awayTeam = teams[(index + 1) % 4];
      const recent = index >= 60;
      const aStrong = strongRecently ? recent : !recent;
      const homeGoals = homeTeam === "A" ? (aStrong ? 4 : 0) : 1;
      const awayGoals = awayTeam === "A" ? (aStrong ? 4 : 0) : 1;
      return { id: `form-${index}`, competition: "Test League", season: "2025", date: new Date(Date.UTC(2024, 0, 1 + index * 5)).toISOString(), homeTeam, awayTeam, homeGoals, awayGoals, result: homeGoals > awayGoals ? "H" : homeGoals < awayGoals ? "A" : "D", source: "test", importedAt: "2026-01-01T00:00:00Z" };
    });
    const input = { competition: "Test League", homeTeam: "A", awayTeam: "B", kickoff: new Date(Date.UTC(2025, 8, 1)).toISOString() };
    const recent = estimateHistoricalGoals(history(true), input);
    const stale = estimateHistoricalGoals(history(false), input);
    expect(recent).not.toBeNull();
    expect(stale).not.toBeNull();
    expect(recent!.expectedHomeGoals).toBeGreaterThan(stale!.expectedHomeGoals);
  });

  it("uses earlier matches only and leaves lineup models unavailable without timestamped data", () => {
    const teams = ["A", "B", "C", "D"];
    const matches: HistoricalMatch[] = Array.from({ length: 80 }, (_, index) => {
      const homeTeam = teams[index % teams.length];
      const awayTeam = teams[(index + 1 + Math.floor(index / teams.length)) % teams.length];
      const homeGoals = index % 3;
      const awayGoals = (index * 2) % 3;
      return { id: String(index), competition: "Test League", season: "2025", date: new Date(Date.UTC(2025, 0, index + 1)).toISOString(), homeTeam, awayTeam, homeGoals, awayGoals, result: homeGoals > awayGoals ? "H" : homeGoals < awayGoals ? "A" : "D", source: "test", importedAt: "2026-01-01T00:00:00Z" };
    });
    const baseline = runHistoricalBacktest(matches, { market: "over-1.5", threshold: 0.5, iterations: 1000, seed: "leakage", trainingFraction: 0.6 });
    const alteredFuture = matches.map((match, index) => index >= 48 ? { ...match, homeGoals: 9, awayGoals: 9, result: "D" as const } : match);
    const rerun = runHistoricalBacktest(alteredFuture, { market: "over-1.5", threshold: 0.5, iterations: 1000, seed: "leakage", trainingFraction: 0.6 });
    expect(baseline.predictions[0]?.expectedHomeGoals).toBe(rerun.predictions[0]?.expectedHomeGoals);
    expect(baseline.modelComparison[1].evaluated).toBe(0);
    expect(baseline.modelComparison[2].note).toContain("linked");
    expect(baseline.predictions[0]).toMatchObject({
      homeTeam: expect.any(String),
      awayTeam: expect.any(String),
      actualHomeGoals: expect.any(Number),
      actualAwayGoals: expect.any(Number),
      actualOutcome: expect.stringMatching(/home|draw|away/),
    });
    const exactReplay = runHistoricalBacktest(matches, { market: "over-1.5", threshold: 0.5, iterations: 50000, seed: "different-seed", trainingFraction: 0.6 });
    expect(exactReplay.predictions.map((item) => item.probabilities)).toEqual(baseline.predictions.map((item) => item.probabilities));
  });

  it("uses past actual XIs for the 90-minute cohort and earlier XIs for projection coverage", () => {
    const teams = ["A", "B", "C", "D"];
    const matches: HistoricalMatch[] = Array.from({ length: 80 }, (_, index) => {
      const homeTeam = teams[index % 4]; const awayTeam = teams[(index + 1) % 4]; const homeGoals = index % 3; const awayGoals = (index + 1) % 2;
      const starters = (team: string) => Array.from({ length: 11 }, (__, player) => ({ id: `${team}-${player}`, name: `${team} Player ${player}`, position: player === 0 ? "G" : "F" }));
      return { id: `lineup-${index}`, competition: "Test League", season: "2025", date: new Date(Date.UTC(2025, 0, index + 1)).toISOString(), homeTeam, awayTeam, homeGoals, awayGoals, result: homeGoals > awayGoals ? "H" : homeGoals < awayGoals ? "A" : "D", source: "test", importedAt: "2026-01-01T00:00:00Z", lineup: { espnEventId: String(index), fetchedAt: "2026-01-01T00:00:00Z", timing: "actual-xi-90m-assumption", home: { starters: starters(homeTeam) }, away: { starters: starters(awayTeam) } } };
    });
    const result = runHistoricalBacktest(matches, { market: "over-1.5", threshold: 0.5, iterations: 1000, seed: "lineups", trainingFraction: 0.6 });
    expect(result.modelComparison[1].evaluated).toBeGreaterThan(0);
    expect(result.modelComparison[2].evaluated).toBe(result.evaluated);
    expect(result.modelComparison[2].note).toContain("90-minute");
  });
});
