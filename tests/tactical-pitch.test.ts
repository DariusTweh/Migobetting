import { describe, expect, it } from "vitest";
import { generateMatchTape } from "../lib/match-playback";
import { tacticalFrame } from "../lib/tactical-pitch";

const tape = generateMatchTape({
  seed:"render-test",homeName:"Barcelona",awayName:"Villarreal",
  expectedHomeGoals:1.7,expectedAwayGoals:1.1,
  finalScoreOverride:{home:2,away:1},
});
describe("synthetic tactical soccer broadcast",()=>{
  it("renders 22 markers with a ball in bounds at each timeline point",()=>{
    for(const minute of [0,1,17,45,75,90]){
      const state=tacticalFrame(tape,minute);
      expect(state.players).toHaveLength(22);
      expect(state.players.filter(p=>p.side==="home")).toHaveLength(11);
      expect(state.players.filter(p=>p.side==="away")).toHaveLength(11);
      expect(state.players.every(p=>p.x>=3&&p.x<=97&&p.y>=5&&p.y<=95)).toBe(true);
      expect(state.ball.x).toBeGreaterThanOrEqual(3);
      expect(state.ball.x).toBeLessThanOrEqual(97);
      expect(state.ball.y).toBeGreaterThanOrEqual(4);
      expect(state.ball.y).toBeLessThanOrEqual(96);
    }
  });
  it("is deterministic for a specific synthetic match seed and minute",()=>{
    expect(tacticalFrame(tape,36)).toEqual(tacticalFrame(tape,36));
    expect(tacticalFrame(tape,0).ball).toEqual({x:50,y:50});
    expect(tacticalFrame(tape,36).trail).not.toBeNull();
  });
  it("reflects goal events from the generated match tape and never changes final score",()=>{
    const goals=tape.frames.flatMap(frame=>frame.events.filter(e=>e.kind==="goal"));
    expect(goals.length).toBe(3);
    for(const event of goals){
      const frame=tacticalFrame(tape,event.minute);
      expect(frame.phase).toBe("GOAL");
      expect(frame.attacking).toBe(event.side);
      expect(frame.event?.kind).toBe("goal");
    }
    expect(tape.finalScore).toEqual({home:2,away:1});
  });
});
