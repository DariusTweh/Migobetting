export type SimulationIterations = 10_000 | 50_000 | 100_000;

export type SimulationInput = {
  homeTeam: string;
  awayTeam: string;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  iterations: number;
  seed: string;
  modelVersion: string;
  scenario: "baseline" | "what-if" | "lineup-adjusted";
};

export type SimulationResult = {
  input: SimulationInput;
  outcomes: { home: number; draw: number; away: number };
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  totals: { over05: number; over15: number; over25: number; over35: number };
  bothTeamsScore: number;
  teamGoals: { homeOver05: number; homeOver15: number; awayOver05: number; awayOver15: number };
  drawNoBet: { home: number; away: number; push: number };
  expectedGoals: { home: number; away: number; total: number };
  goalDistribution: Array<{ goals: number; probability: number }>;
  scorelines: Array<{ score: string; homeGoals: number; awayGoals: number; probability: number }>;
  analytical: { home: number; draw: number; away: number; maximumDelta: number };
  completedAt: string;
};

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function samplePoisson(lambda: number, random: () => number): number {
  if (!Number.isFinite(lambda) || lambda < 0) throw new Error("Poisson lambda must be non-negative");
  if (lambda === 0) return 0;
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= random();
  } while (product > limit);
  return count - 1;
}

function poissonProbability(lambda: number, goals: number): number {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) factorial *= value;
  return Math.exp(-lambda) * lambda ** goals / factorial;
}

export function analyticalOutcomes(homeLambda: number, awayLambda: number) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let homeGoals = 0; homeGoals <= 12; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 12; awayGoals += 1) {
      const probability = poissonProbability(homeLambda, homeGoals) * poissonProbability(awayLambda, awayGoals);
      if (homeGoals > awayGoals) home += probability;
      else if (homeGoals === awayGoals) draw += probability;
      else away += probability;
    }
  }
  const mass = home + draw + away;
  return { home: home / mass, draw: draw / mass, away: away / mass };
}

export function simulateMatch(input: SimulationInput): SimulationResult {
  if (!Number.isInteger(input.iterations) || input.iterations < 1) throw new Error("Iterations must be a positive integer");
  if (input.expectedHomeGoals < 0 || input.expectedAwayGoals < 0) throw new Error("Expected goals cannot be negative");
  const random = createSeededRandom(input.seed);
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let btts = 0;
  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  const totals = [0, 0, 0, 0];
  const teamGoals = [0, 0, 0, 0];
  const goalCounts = new Map<number, number>();
  const scoreCounts = new Map<string, { count: number; homeGoals: number; awayGoals: number }>();

  for (let iteration = 0; iteration < input.iterations; iteration += 1) {
    const homeGoals = samplePoisson(input.expectedHomeGoals, random);
    const awayGoals = samplePoisson(input.expectedAwayGoals, random);
    const total = homeGoals + awayGoals;
    totalHomeGoals += homeGoals;
    totalAwayGoals += awayGoals;
    if (homeGoals > awayGoals) homeWins += 1;
    else if (homeGoals === awayGoals) draws += 1;
    else awayWins += 1;
    if (homeGoals > 0 && awayGoals > 0) btts += 1;
    [0.5, 1.5, 2.5, 3.5].forEach((line, index) => { if (total > line) totals[index] += 1; });
    if (homeGoals > 0) teamGoals[0] += 1;
    if (homeGoals > 1) teamGoals[1] += 1;
    if (awayGoals > 0) teamGoals[2] += 1;
    if (awayGoals > 1) teamGoals[3] += 1;
    goalCounts.set(total, (goalCounts.get(total) ?? 0) + 1);
    const score = `${homeGoals}–${awayGoals}`;
    const existing = scoreCounts.get(score);
    scoreCounts.set(score, { count: (existing?.count ?? 0) + 1, homeGoals, awayGoals });
  }

  const divide = (count: number) => count / input.iterations;
  const outcomes = { home: divide(homeWins), draw: divide(draws), away: divide(awayWins) };
  const analytical = analyticalOutcomes(input.expectedHomeGoals, input.expectedAwayGoals);
  const maximumDelta = Math.max(
    Math.abs(outcomes.home - analytical.home),
    Math.abs(outcomes.draw - analytical.draw),
    Math.abs(outcomes.away - analytical.away),
  );
  return {
    input,
    outcomes,
    doubleChance: { homeOrDraw: divide(homeWins + draws), awayOrDraw: divide(awayWins + draws), homeOrAway: divide(homeWins + awayWins) },
    totals: { over05: divide(totals[0]), over15: divide(totals[1]), over25: divide(totals[2]), over35: divide(totals[3]) },
    bothTeamsScore: divide(btts),
    teamGoals: { homeOver05: divide(teamGoals[0]), homeOver15: divide(teamGoals[1]), awayOver05: divide(teamGoals[2]), awayOver15: divide(teamGoals[3]) },
    drawNoBet: { home: homeWins + awayWins ? homeWins / (homeWins + awayWins) : 0, away: homeWins + awayWins ? awayWins / (homeWins + awayWins) : 0, push: divide(draws) },
    expectedGoals: { home: totalHomeGoals / input.iterations, away: totalAwayGoals / input.iterations, total: (totalHomeGoals + totalAwayGoals) / input.iterations },
    goalDistribution: [...goalCounts.entries()].sort((a, b) => a[0] - b[0]).map(([goals, count]) => ({ goals, probability: divide(count) })),
    scorelines: [...scoreCounts.entries()].map(([score, value]) => ({ score, homeGoals: value.homeGoals, awayGoals: value.awayGoals, probability: divide(value.count) })).sort((a, b) => b.probability - a.probability).slice(0, 5),
    analytical: { ...analytical, maximumDelta },
    completedAt: new Date().toISOString(),
  };
}
