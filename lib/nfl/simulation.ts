import type { NflGame, NflMarket, NflProp } from "./engine";
import { canonicalNflTeam, normalizePlayer, type NflverseSnapshot, type WeeklyUsage } from "./nflverse";

/**
 * MIGO NFL scenario simulator v0.1.
 * This is an UNCALIBRATED generative research model, not a sportsbook probability,
 * an independently tested forecast, or a quote. Shared pace, game script, team
 * attempt budgets and target/carry allocation produce dependence across player props.
 * Inputs are nflverse weeks STRICTLY BEFORE the chosen fixture week.
 */
export const NFL_SIM_VERSION = "nfl-usage-opportunity-monte-carlo-v0.1";
export const NFL_SIM_DEFAULT_RUNS = 30_000;
const MIN_WEEKS = 4;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => xs.length ? sum(xs) / xs.length : 0;
const valid = (x: number | null): x is number => x !== null && Number.isFinite(x);
const number = (value: number | null | undefined) => value !== null && value !== undefined && Number.isFinite(value) ? value : 0;

export type SimulatedProp = {
  id: string; player: string; market: NflMarket; line: number;
  rawModelHitRate: number; simulatedMean: number; p10: number; p50: number; p90: number;
  modelStatus: "UNCALIBRATED"; historicalWeeks: number;
};
export type JointScenario = {
  legIds: string[]; hitRuns: number; runs: number; rawModelJointRate: number;
  independenceBenchmark: number; modelStatus: "UNCALIBRATED";
};
export type NflSimulationSummary = {
  status: "READY" | "PASS";
  modelVersion: string; runs: number; seed: number; modelStatus: "UNCALIBRATED";
  gameId: string; inputSeason: number | null; inputWeek: number | null;
  props: SimulatedProp[]; joint: JointScenario | null;
  assumptions: string[]; limitations: string[];
  reason?: string;
};
type Metric = { passingYards: number; passingTds: number; rushingYards: number; receivingYards: number; receptions: number };
type Participant = {
  id: string; name: string; position: string; history: WeeklyUsage[];
  targets: number; catchesPerTarget: number; yardsPerReception: number;
  rushes: number; yardsPerCarry: number; passingAttempts: number; tdPerAttempt: number;
};
type TeamModel = {
  id: string; code: string; weeks: number;
  passAttempts: number; rushAttempts: number; qb: Participant;
  receivers: Participant[]; rushers: Participant[];
  otherTargetsWeight: number; otherRushWeight: number;
};
type SimulationInputs = {
  home: TeamModel; away: TeamModel;
  homeAdvantage: number; gameTotalFactor: number; seed: number;
};
function stableHash(text: string): number {
  let h = 2166136261;
  for (const char of text) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
}
function lognormal(rng: () => number, sigma: number) {
  return Math.exp(sigma * normal(rng) - sigma * sigma / 2);
}
function poisson(rng: () => number, lambda: number) {
  const rate = clamp(lambda, 0, 100);
  if (rate >= 45) return Math.max(0, Math.round(rate + Math.sqrt(rate) * normal(rng)));
  let count = 0;
  let product = 1;
  const limit = Math.exp(-rate);
  while (product > limit && count < 200) { count++; product *= rng(); }
  return Math.max(0, count - 1);
}
function weightedIndex(rng: () => number, weights: number[], total: number): number {
  if (total <= 0) return weights.length - 1;
  let sample = rng() * total;
  for (let i = 0; i < weights.length - 1; i++) {
    sample -= weights[i];
    if (sample < 0) return i;
  }
  return weights.length - 1;
}
function meanLast(rows: WeeklyUsage[], field: keyof WeeklyUsage, n: number): number {
  return mean(rows.slice(0, n).map((row) => row[field]).filter((v): v is number =>
    typeof v === "number" && Number.isFinite(v)));
}
function blended(rows: WeeklyUsage[], field: keyof WeeklyUsage): number {
  return .6 * meanLast(rows, field, 3) + .4 * meanLast(rows, field, 6);
}
function participant(rows: WeeklyUsage[]): Participant {
  const recent = [...rows].sort((a, b) => b.week - a.week).slice(0, 6);
  const base = recent[0];
  const allTargets = sum(recent.map((r) => number(r.targets)));
  const catches = sum(recent.map((r) => number(r.receptions)));
  const yards = sum(recent.map((r) => number(r.receivingYards)));
  const rushes = sum(recent.map((r) => number(r.carries)));
  const rushYards = sum(recent.map((r) => number(r.rushingYards)));
  const attempts = sum(recent.map((r) => number(r.passingAttempts)));
  const tds = sum(recent.map((r) => number(r.passingTds)));
  return {
    id: "nflverse:" + base.id, name: base.name, position: base.position,
    history: recent,
    targets: Math.max(0, blended(recent, "targets")),
    catchesPerTarget: clamp((catches + 1.3) / (allTargets + 2), .30, .91),
    yardsPerReception: clamp((yards + 24) / (catches + 2), 5, 23),
    rushes: Math.max(0, blended(recent, "carries")),
    yardsPerCarry: clamp((rushYards + 15) / (rushes + 4), 1.8, 8),
    passingAttempts: Math.max(0, blended(recent, "passingAttempts")),
    tdPerAttempt: clamp((tds + 2) / (attempts + 80), .01, .11),
  };
}
function teamWeeks(rows: WeeklyUsage[], code: string) {
  const weeks = new Map<number, WeeklyUsage[]>();
  for (const row of rows) {
    if (row.team !== code) continue;
    weeks.set(row.week, [...(weeks.get(row.week) ?? []), row]);
  }
  return [...weeks.entries()].sort((a, b) => b[0] - a[0]).slice(0, 6);
}
function buildTeam(game: NflGame, snapshot: NflverseSnapshot, id: string, abbreviation: string): TeamModel | null {
  if (!game.week || !game.season) return null;
  const code = canonicalNflTeam(abbreviation);
  const rows = snapshot.players.filter((r) =>
    r.team === code && r.season === game.season! && r.week < game.week! && r.week >= 1);
  const games = teamWeeks(rows, code);
  if (games.length < MIN_WEEKS) return null;
  const passGame = games.map(([,rs]) => sum(rs.map((r) => number(r.passingAttempts))));
  const rushGame = games.map(([,rs]) => sum(rs.map((r) => number(r.carries))));
  if (passGame.filter((x) => x >= 14).length < MIN_WEEKS ||
      rushGame.filter((x) => x >= 8).length < MIN_WEEKS) return null;
  const byId = new Map<string, WeeklyUsage[]>();
  for (const row of rows) byId.set(row.id, [...(byId.get(row.id) ?? []), row]);
  const actors = [...byId.values()].filter((r) => {
    const unique = new Set(r.map((row) => normalizePlayer(row.name)));
    return unique.size === 1 && new Set(r.map((row) => row.position)).size === 1;
  }).map(participant);
  const quarterbacks = actors.filter((p) => p.position === "QB")
    .sort((a, b) => b.passingAttempts - a.passingAttempts);
  const qb = quarterbacks[0];
  if (!qb || qb.passingAttempts < 14 || qb.history.length < MIN_WEEKS) return null;
  // A QB committee cannot be represented honestly by a single pass-yard projection.
  if (quarterbacks[1] && quarterbacks[1].passingAttempts > qb.passingAttempts * .35) return null;
  const receivers = actors.filter((p) => ["WR", "TE", "RB"].includes(p.position) &&
    p.targets >= .25 && p.history.length >= 2).sort((a,b)=>b.targets-a.targets).slice(0,20);
  const rushers = actors.filter((p) => ["RB", "QB", "WR"].includes(p.position) &&
    p.rushes >= .2 && p.history.length >= 2).sort((a,b)=>b.rushes-a.rushes).slice(0,15);
  if (!receivers.length || !rushers.length) return null;
  const passAttempts = clamp(.6 * mean(passGame.slice(0,3)) + .4 * mean(passGame), 17, 54);
  const rushAttempts = clamp(.6 * mean(rushGame.slice(0,3)) + .4 * mean(rushGame), 12, 47);
  // "Other" includes untracked offensive roles, throwaways and low-volume players.
  const otherTargetsWeight = Math.max(2, passAttempts - sum(receivers.map((p) => p.targets)));
  const otherRushWeight = Math.max(1, rushAttempts - sum(rushers.map((p) => p.rushes)));
  return { id, code, weeks: games.length, passAttempts, rushAttempts, qb,
    receivers, rushers, otherTargetsWeight, otherRushWeight };
}
function parseHomeAdvantage(game: NflGame): number {
  const details = game.spreadDetails ?? "";
  const matched = details.match(/\b([A-Z]{2,3})\s*(-\d+(?:\.\d+)?)/);
  if (!matched) return 0;
  const favorite = canonicalNflTeam(matched[1]), points = Math.abs(Number(matched[2]));
  if (!Number.isFinite(points)) return 0;
  const home = canonicalNflTeam(game.home.abbreviation), away = canonicalNflTeam(game.away.abbreviation);
  // Positive means home favored. Conservative game-script directional hint only.
  return favorite === home ? clamp(points / 45,0,.25) :
    favorite === away ? -clamp(points / 45,0,.25) : 0;
}
function inputs(game: NflGame, snapshot: NflverseSnapshot): SimulationInputs | null {
  if (!game.week || !game.season ||
    snapshot.coverage.stats !== "available" || snapshot.coverage.snaps !== "available" ||
    snapshot.coverage.season !== game.season || snapshot.coverage.week !== game.week) return null;
  const home = buildTeam(game, snapshot, game.home.id, game.home.abbreviation);
  const away = buildTeam(game, snapshot, game.away.id, game.away.abbreviation);
  if (!home || !away) return null;
  return { home, away, homeAdvantage: parseHomeAdvantage(game),
    gameTotalFactor: game.overUnder ? clamp(game.overUnder / 45, .87, 1.12) : 1,
    seed: stableHash([game.id, game.season, game.week, NFL_SIM_VERSION].join(":")) };
}
function blank(): Metric {
  return { passingYards: 0, passingTds: 0, rushingYards: 0, receivingYards: 0, receptions: 0 };
}
function simulateTeam(team: TeamModel, rng: () => number, pace: number, script: number, scoring: number): Map<string, Metric> {
  const samples = new Map<string, Metric>();
  const entry = (id: string) => {
    let value = samples.get(id);
    if (!value) { value = blank(); samples.set(id,value); }
    return value;
  };
  const attempts = clamp(poisson(rng, team.passAttempts * pace * Math.exp(-script)), 9, 68);
  const rushes = clamp(poisson(rng, team.rushAttempts * pace * Math.exp(script)), 4, 65);
  const passEfficiency = lognormal(rng, .13);
  const rushEfficiency = lognormal(rng, .11);
  const catchWeights = [...team.receivers.map((p) => p.targets), team.otherTargetsWeight];
  const totalTargets = sum(catchWeights);
  let yardsFromCatches = 0;
  for (let i=0; i<attempts; i++) {
    const index = weightedIndex(rng,catchWeights,totalTargets);
    const target = team.receivers[index];
    if (!target) {
      // The "other" bucket approximates completions to non-modeled receivers.
      if (rng() < .62) yardsFromCatches += Math.round(10.2 * passEfficiency * lognormal(rng,.53));
      continue;
    }
    if (rng() < target.catchesPerTarget) {
      const y = Math.max(0, Math.round(target.yardsPerReception * passEfficiency * lognormal(rng,.57)));
      const item = entry(target.id);
      item.receptions++; item.receivingYards += y;
      yardsFromCatches += y;
    }
  }
  const qb = entry(team.qb.id);
  qb.passingYards = yardsFromCatches;
  // TDs share the attempt and team scoring latent factors, but TD allocation to
  // individual receivers is intentionally NOT modeled in this phase.
  qb.passingTds = Math.min(7, poisson(rng, attempts * team.qb.tdPerAttempt * scoring));
  const carryWeights = [...team.rushers.map((p) => p.rushes), team.otherRushWeight];
  const totalRush = sum(carryWeights);
  for (let i=0; i<rushes; i++) {
    const index = weightedIndex(rng,carryWeights,totalRush);
    const carrier = team.rushers[index];
    if (!carrier) continue;
    const ypc = Math.max(-3, Math.round(carrier.yardsPerCarry * rushEfficiency * lognormal(rng,.72) -
      (rng()<.08 ? 3 : 0)));
    entry(carrier.id).rushingYards += ypc;
  }
  return samples;
}
const round = (x: number) => Math.round(x * 10000) / 10000;
export function simulateNflMatchup(
  game: NflGame, snapshot: NflverseSnapshot, props: NflProp[],
  options: { runs?: number; seed?: number; jointLegIds?: string[] } = {},
): NflSimulationSummary {
  const runs = options.runs ?? NFL_SIM_DEFAULT_RUNS;
  if (!Number.isInteger(runs) || runs < 100 || runs > NFL_SIM_DEFAULT_RUNS)
    throw new Error("Simulation trials must be 100–30,000");
  const base = {
    gameId: game.id, modelVersion: NFL_SIM_VERSION, runs,
    seed: (options.seed ?? stableHash(game.id + ":missing")) >>> 0,
    modelStatus: "UNCALIBRATED" as const,
    inputSeason: game.season ?? null, inputWeek: game.week ?? null,
    props: [] as SimulatedProp[], joint: null as JointScenario | null,
    assumptions: [
      "Uses only regular-season weekly stat lines before the fixture week.",
      "Shared pace and complementary pass/run scripts drive correlated team opportunities.",
      "A team's pass attempts are distributed across modeled receivers and an untracked-other bucket; receptions and yards follow target draws.",
      "A team's carry attempts are distributed across modeled rushers and an other bucket; quarterback passing yards equal modeled + untracked receiving yards.",
      "Spread and total are bounded scenario inputs when provided, not independently validated signals.",
    ],
    limitations: [
      "UNCALIBRATED: raw simulated hit rates must not be interpreted as verified true probabilities or fair sportsbook odds.",
      "No verified game-day actives, routes, weather, red-zone targets, receiver TD allocation, or offensive line grades.",
      "Zero/missing stat distinctions, changing roles and opponent defensive efficiency remain imperfect.",
      "Sampling variance is not model uncertainty. Thirty thousand draws cannot fix biased assumptions.",
    ],
  };
  if (game.status !== "scheduled" || !Number.isFinite(Date.parse(game.kickoff)) ||
    Date.parse(game.kickoff) <= Date.now())
    return {...base, status:"PASS", reason:"Only upcoming pregame fixtures can be simulated."};
  const spec = inputs(game,snapshot);
  if (!spec) return { ...base,status:"PASS", reason:"Insufficient verified team QB/pass/run/snap history or ambiguous QB usage."};
  const seed = (options.seed ?? spec.seed) >>> 0;
  const rng = random(seed);
  const lookup = new Map<string, { player: NflProp; values: Float32Array }>();
  const models = new Set<string>([
    ...spec.home.receivers.map((p)=>p.id), ...spec.away.receivers.map((p)=>p.id),
    ...spec.home.rushers.map((p)=>p.id), ...spec.away.rushers.map((p)=>p.id),
    spec.home.qb.id,spec.away.qb.id,
  ]);
  for (const p of props) {
    if (models.has(p.athleteId) && p.grade === "RESEARCH") lookup.set(p.id,{player:p,values:new Float32Array(runs)});
  }
  if (!lookup.size) return {...base, status:"PASS", seed, reason:"No eligible props with independently observed historical opportunities."};
  for (let i=0; i<runs; i++) {
    const pace = lognormal(rng,.15) * spec.gameTotalFactor;
    const homeLead = spec.homeAdvantage + .18*normal(rng);
    // Opposition scripts are anti-correlated, but shared pace varies together.
    const scoring = lognormal(rng,.17) * spec.gameTotalFactor;
    const home = simulateTeam(spec.home,rng,pace,homeLead,scoring);
    const away = simulateTeam(spec.away,rng,pace,-homeLead,scoring);
    for (const record of lookup.values()) {
      const player = record.player;
      const source = player.teamId === game.home.id ? home : away;
      record.values[i] = source.get(player.athleteId)?.[player.market] ?? 0;
    }
  }
  const computed: SimulatedProp[] = [];
  for (const [id, record] of lookup) {
    const values = record.values;
    let hits = 0, total = 0;
    for (let i=0; i<runs; i++) { if (values[i] >= record.player.line) hits++; total += values[i]; }
    const ordered = values.slice().sort();
    const quantile = (p: number) => ordered[Math.floor((runs-1)*p)];
    computed.push({
      id, player:record.player.player, market:record.player.market, line:record.player.line,
      rawModelHitRate:round(hits/runs), simulatedMean:Math.round(total/runs*10)/10,
      p10:quantile(.1),p50:quantile(.5),p90:quantile(.9),
      historicalWeeks:record.player.sampleGames,modelStatus:"UNCALIBRATED",
    });
  }
  computed.sort((a,b)=>b.rawModelHitRate-a.rawModelHitRate);
  const chosen = options.jointLegIds ?? [];
  if (chosen.length > 6 || new Set(chosen).size !== chosen.length) throw Error("Invalid joint slip");
  let joint: JointScenario | null = null;
  if (chosen.length >= 2 && chosen.every((id)=>lookup.has(id))) {
    const picks = chosen.map((id)=>lookup.get(id)!);
    let wins = 0;
    for (let i=0; i<runs; i++) {
      if (picks.every((p)=>p.values[i]>=p.player.line)) wins++;
    }
    joint = { legIds:chosen,hitRuns:wins,runs,rawModelJointRate:round(wins/runs),
      independenceBenchmark:round(chosen.reduce((p,id)=>
        p*(computed.find((prop)=>prop.id===id)?.rawModelHitRate??0),1)),
      modelStatus:"UNCALIBRATED" };
  }
  return { ...base,status:"READY",seed,props:computed,joint };
}
