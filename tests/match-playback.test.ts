import { describe, expect, it } from "vitest";
import { generateMatchTape, snapshotMatch } from "../lib/match-playback";

const input = { seed: "same-seed", homeName: "Home", awayName: "Away", expectedHomeGoals: 1.8, expectedAwayGoals: 1.2 };
describe("minute-by-minute synthetic match simulation", () => {
  it("replays identically for the same random seed", () => {
    const first = generateMatchTape(input);
    const second = generateMatchTape(input);
    expect(first.finalScore).toEqual(second.finalScore);
    expect(first.frames).toEqual(second.frames);
  });
  it("shows zero initial stats and final goals that match the scoreboard", () => {
    const tape = generateMatchTape(input);
    const first = snapshotMatch(tape, 0);
    const final = snapshotMatch(tape, 90);
    expect(first.home.goals + first.away.goals).toBe(0);
    expect(final.home.goals).toBe(tape.finalScore.home);
    expect(final.away.goals).toBe(tape.finalScore.away);
    expect(final.home.shots).toBeGreaterThanOrEqual(final.home.onTarget);
    expect(final.away.shots).toBeGreaterThanOrEqual(final.away.onTarget);
    expect(final.possession.home + final.possession.away).toBe(100);
  });
  it("does not invent real player names when lineups are unavailable", () => {
    const tape = generateMatchTape(input);
    expect(tape.players).toHaveLength(22);
    expect(tape.players.every((p) => p.provenance === "placeholder")).toBe(true);
  });
  it("preserves a validated eleven-player roster as a name source only", () => {
    const homeLineup = Array.from({ length: 11 }, (_, n) => ({ id: String(n), name: "Starter " + n, position: n ? "MF" : "GK" }));
    const tape = generateMatchTape({ ...input, homeLineup });
    expect(tape.players.slice(0, 11).every((p) => p.provenance === "ESPN lineup")).toBe(true);
    expect(tape.players.slice(11).every((p) => p.provenance === "placeholder")).toBe(true);
  });
});
