import { createSeededRandom, samplePoisson, sampleScore } from "./simulation";

export type MatchSide = "home" | "away";
export type SimEventKind = "goal" | "shot" | "save" | "yellow" | "foul" | "corner";
export type SimPlayer = { id: string; side: MatchSide; name: string; position: string; provenance: "ESPN lineup" | "placeholder" };
export type SimPlayerStat = { passes: number; shots: number; onTarget: number; goals: number; assists: number; saves: number; yellow: number };
export type SimTeamStat = { passes: number; shots: number; onTarget: number; goals: number; saves: number; corners: number; fouls: number; yellow: number };
export type SimEvent = { id: string; minute: number; side: MatchSide; kind: SimEventKind; playerId: string; assistId?: string; description: string };
export type MinuteFrame = { minute: number; increments: Record<MatchSide, SimTeamStat>; playerIncrements: Record<string, SimPlayerStat>; events: SimEvent[] };
export type MatchTape = {
  seed: string; homeName: string; awayName: string; expectedHomeGoals: number; expectedAwayGoals: number;
  lowScoreCorrelation?: number;
  players: SimPlayer[]; frames: MinuteFrame[]; finalScore: { home: number; away: number };
};
export type MatchSnapshot = {
  minute: number; home: SimTeamStat; away: SimTeamStat;
  possession: { home: number; away: number }; playerStats: Record<string, SimPlayerStat>; events: SimEvent[];
};
const zeroTeam = (): SimTeamStat => ({ passes: 0, shots: 0, onTarget: 0, goals: 0, saves: 0, corners: 0, fouls: 0, yellow: 0 });
const zeroPlayer = (): SimPlayerStat => ({ passes: 0, shots: 0, onTarget: 0, goals: 0, assists: 0, saves: 0, yellow: 0 });
const sides: MatchSide[] = ["home", "away"];
const pick = <T>(items: T[], random: () => number): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
const canShoot = (position: string) => /F|FW|ST|LW|RW|AM|M|MF|CM/i.test(position);
const isKeeper = (position: string) => /GK|GOAL|^G$/i.test(position);

function makePlayers(side: MatchSide, teamName: string, observed?: Array<{ id: string; name: string; position: string }>): SimPlayer[] {
  if (observed?.length === 11 && observed.every((player) => player.id && player.name)) {
    return observed.map((player) => ({ id: side + ":" + player.id, name: player.name, position: player.position || "Unknown", side, provenance: "ESPN lineup" }));
  }
  const positions = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];
  return positions.map((position, index) => ({
    id: side + ":placeholder:" + index,
    name: teamName + " #" + (index + 1),
    position, side, provenance: "placeholder" as const,
  }));
}

export function generateMatchTape(input: {
  seed: string; homeName: string; awayName: string; expectedHomeGoals: number; expectedAwayGoals: number;
  lowScoreCorrelation?: number;
  homeLineup?: Array<{ id: string; name: string; position: string }>;
  awayLineup?: Array<{ id: string; name: string; position: string }>;
  /** For representative playback only: condition this timeline on the modal simulated score. */
  finalScoreOverride?: { home: number; away: number };
}): MatchTape {
  if (![input.expectedHomeGoals, input.expectedAwayGoals].every((x) => Number.isFinite(x) && x >= 0 && x <= 8)) {
    throw new Error("Valid nonnegative goal expectations required");
  }
  if (input.finalScoreOverride && ![input.finalScoreOverride.home, input.finalScoreOverride.away]
    .every((x) => Number.isInteger(x) && x >= 0 && x <= 9)) {
    throw new Error("Representative playback requires a valid 0–9 goals per team score");
  }
  const random = createSeededRandom(input.seed);
  const players = [
    ...makePlayers("home", input.homeName, input.homeLineup),
    ...makePlayers("away", input.awayName, input.awayLineup),
  ];
  const sampledScore = sampleScore(input.expectedHomeGoals, input.expectedAwayGoals, input.lowScoreCorrelation ?? 0, random);
  const goals = input.finalScoreOverride
    ? { home: input.finalScoreOverride.home, away: input.finalScoreOverride.away }
    : { home: Math.min(9, sampledScore.home), away: Math.min(9, sampledScore.away) };
  const goalMinutes: Record<MatchSide, Map<number, number>> = { home: new Map(), away: new Map() };
  for (const side of sides) for (let g = 0; g < goals[side]; g++) {
    const minute = Math.floor(random() * 90) + 1;
    goalMinutes[side].set(minute, (goalMinutes[side].get(minute) ?? 0) + 1);
  }

  const frames: MinuteFrame[] = [];
  let eventNumber = 0;
  for (let minute = 1; minute <= 90; minute++) {
    const increments = { home: zeroTeam(), away: zeroTeam() };
    const playerIncrements: Record<string, SimPlayerStat> = {};
    const events: SimEvent[] = [];
    const increment = (id: string, key: keyof SimPlayerStat, amount = 1) => {
      if (!playerIncrements[id]) playerIncrements[id] = zeroPlayer();
      playerIncrements[id][key] += amount;
    };
    const event = (side: MatchSide, kind: SimEventKind, player: SimPlayer, description: string, assist?: SimPlayer) => {
      events.push({ id: "sim:" + ++eventNumber, minute, side, kind, playerId: player.id, assistId: assist?.id, description });
    };
    for (const side of sides) {
      const other: MatchSide = side === "home" ? "away" : "home";
      const team = players.filter((p) => p.side === side);
      const shooters = team.filter((p) => canShoot(p.position));
      const passerPool = team.filter((p) => !isKeeper(p.position));
      const goalkeeper = players.find((p) => p.side === other && isKeeper(p.position)) ?? players.find((p) => p.side === other)!;
      const passes = samplePoisson(5.1, random);
      increments[side].passes += passes;
      for (let pass = 0; pass < passes; pass++) increment(pick(passerPool, random).id, "passes");
      if (random() < 0.105) {
        increments[side].fouls++;
        if (random() < 0.09) {
          increments[side].yellow++;
          const booked = pick(team, random);
          increment(booked.id, "yellow");
          event(side, "yellow", booked, booked.name + " shown a yellow card");
        }
      }
      const fixedGoals = goalMinutes[side].get(minute) ?? 0;
      const shotChance = Math.min(0.25, 0.08 + (side === "home" ? input.expectedHomeGoals : input.expectedAwayGoals) * 0.035);
      const otherShots = random() < shotChance ? 1 : 0;
      for (let shot = 0; shot < fixedGoals + otherShots; shot++) {
        const shooter = pick(shooters.length ? shooters : team, random);
        const isGoal = shot < fixedGoals;
        const isOnTarget = isGoal || random() < 0.32;
        increments[side].shots++;
        increment(shooter.id, "shots");
        if (isOnTarget) {
          increments[side].onTarget++;
          increment(shooter.id, "onTarget");
        }
        if (isGoal) {
          increments[side].goals++;
          increment(shooter.id, "goals");
          const availableAssists = passerPool.filter((p) => p.id !== shooter.id);
          const assist = random() < 0.65 && availableAssists.length ? pick(availableAssists, random) : undefined;
          if (assist) increment(assist.id, "assists");
          event(side, "goal", shooter, "GOAL! " + shooter.name + (assist ? " · assist: " + assist.name : ""), assist);
        } else if (isOnTarget) {
          increments[other].saves++;
          increment(goalkeeper.id, "saves");
          event(side, "save", shooter, shooter.name + " shoots on target — saved");
        } else {
          event(side, "shot", shooter, shooter.name + " shoots wide");
        }
      }
      if (random() < 0.035) {
        increments[side].corners++;
        const player = pick(passerPool, random);
        event(side, "corner", player, "Corner earned by " + (side === "home" ? input.homeName : input.awayName));
      }
    }
    frames.push({ minute, increments, playerIncrements, events });
  }

  return {
    seed: input.seed, homeName: input.homeName, awayName: input.awayName,
    expectedHomeGoals: input.expectedHomeGoals, expectedAwayGoals: input.expectedAwayGoals,
    players, frames, finalScore: { home: goals.home, away: goals.away },
  };
}

export function snapshotMatch(tape: MatchTape, minute: number): MatchSnapshot {
  const at = Math.min(90, Math.max(0, Math.floor(minute)));
  const teams = { home: zeroTeam(), away: zeroTeam() };
  const playerStats = Object.fromEntries(tape.players.map((player) => [player.id, zeroPlayer()])) as Record<string, SimPlayerStat>;
  const events: SimEvent[] = [];
  for (const frame of tape.frames.slice(0, at)) {
    for (const side of sides) {
      const t = frame.increments[side];
      for (const key of Object.keys(t) as Array<keyof SimTeamStat>) teams[side][key] += t[key];
    }
    for (const [id, stat] of Object.entries(frame.playerIncrements)) {
      const current = playerStats[id];
      if (!current) continue;
      for (const key of Object.keys(stat) as Array<keyof SimPlayerStat>) current[key] += stat[key];
    }
    events.push(...frame.events);
  }
  const totalPasses = teams.home.passes + teams.away.passes;
  const homePossession = totalPasses ? Math.round(100 * teams.home.passes / totalPasses) : 50;
  return {
    minute: at, home: teams.home, away: teams.away,
    possession: { home: homePossession, away: 100 - homePossession },
    playerStats, events: events.reverse(),
  };
}
