function hashSeed(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) { hash ^= seed.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function randomGenerator(seed) {
  let state = hashSeed(seed) || 1;
  return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}
function factorial(value) { let result = 1; for (let index = 2; index <= value; index += 1) result *= index; return result; }
function poissonProbability(lambda, goals) { return Math.exp(-lambda) * lambda ** goals / factorial(goals); }
function lowScoreFactor(home, away, homeLambda, awayLambda, rho) {
  if (home === 0 && away === 0) return 1 - homeLambda * awayLambda * rho;
  if (home === 0 && away === 1) return 1 + homeLambda * rho;
  if (home === 1 && away === 0) return 1 + awayLambda * rho;
  if (home === 1 && away === 1) return 1 - rho;
  return 1;
}
function scoreGrid(homeLambda, awayLambda, rawRho) {
  const rho = Math.max(-0.2, Math.min(0.2, rawRho || 0)); const cells = []; let mass = 0;
  for (let h = 0; h <= 12; h += 1) for (let a = 0; a <= 12; a += 1) {
    const probability = poissonProbability(homeLambda, h) * poissonProbability(awayLambda, a) * Math.max(0.01, lowScoreFactor(h, a, homeLambda, awayLambda, rho));
    mass += probability; cells.push({ homeGoals: h, awayGoals: a, probability });
  }
  let cumulative = 0;
  return cells.map((cell) => { const probability = cell.probability / mass; cumulative += probability; return { ...cell, probability, cumulative }; });
}
function analytical(grid) {
  let home = 0; let draw = 0; let away = 0;
  for (const cell of grid) { if (cell.homeGoals > cell.awayGoals) home += cell.probability; else if (cell.homeGoals === cell.awayGoals) draw += cell.probability; else away += cell.probability; }
  return { home, draw, away };
}
self.onmessage = (event) => {
  const input = event.data;
  const random = randomGenerator(input.seed);
  const grid = scoreGrid(input.expectedHomeGoals, input.expectedAwayGoals, input.lowScoreCorrelation);
  let homeWins = 0; let draws = 0; let awayWins = 0; let btts = 0; let totalHomeGoals = 0; let totalAwayGoals = 0;
  const totals = [0, 0, 0, 0]; const teamGoals = [0, 0, 0, 0]; const goalCounts = new Map(); const scoreCounts = new Map();
  const checkpoint = Math.max(1, Math.floor(input.iterations / 10));
  for (let iteration = 0; iteration < input.iterations; iteration += 1) {
    const roll = random(); const sampled = grid.find((cell) => roll <= cell.cumulative) || grid[grid.length - 1];
    const homeGoals = sampled.homeGoals; const awayGoals = sampled.awayGoals; const total = homeGoals + awayGoals;
    totalHomeGoals += homeGoals; totalAwayGoals += awayGoals;
    if (homeGoals > awayGoals) homeWins += 1; else if (homeGoals === awayGoals) draws += 1; else awayWins += 1;
    if (homeGoals && awayGoals) btts += 1;
    [0.5, 1.5, 2.5, 3.5].forEach((line, index) => { if (total > line) totals[index] += 1; });
    if (homeGoals > 0) teamGoals[0] += 1; if (homeGoals > 1) teamGoals[1] += 1; if (awayGoals > 0) teamGoals[2] += 1; if (awayGoals > 1) teamGoals[3] += 1;
    goalCounts.set(total, (goalCounts.get(total) || 0) + 1);
    const score = `${homeGoals}–${awayGoals}`; const existing = scoreCounts.get(score); scoreCounts.set(score, { count: (existing?.count || 0) + 1, homeGoals, awayGoals });
    if ((iteration + 1) % checkpoint === 0) self.postMessage({ type: "progress", progress: (iteration + 1) / input.iterations });
  }
  const divide = (count) => count / input.iterations;
  const outcomes = { home: divide(homeWins), draw: divide(draws), away: divide(awayWins) };
  const exact = analytical(grid);
  const maximumDelta = Math.max(Math.abs(outcomes.home - exact.home), Math.abs(outcomes.draw - exact.draw), Math.abs(outcomes.away - exact.away));
  self.postMessage({ type: "result", result: {
    input, outcomes,
    doubleChance: { homeOrDraw: divide(homeWins + draws), awayOrDraw: divide(awayWins + draws), homeOrAway: divide(homeWins + awayWins) },
    totals: { over05: divide(totals[0]), over15: divide(totals[1]), over25: divide(totals[2]), over35: divide(totals[3]) },
    bothTeamsScore: divide(btts), teamGoals: { homeOver05: divide(teamGoals[0]), homeOver15: divide(teamGoals[1]), awayOver05: divide(teamGoals[2]), awayOver15: divide(teamGoals[3]) },
    drawNoBet: { home: homeWins + awayWins ? homeWins / (homeWins + awayWins) : 0, away: homeWins + awayWins ? awayWins / (homeWins + awayWins) : 0, push: divide(draws) },
    expectedGoals: { home: totalHomeGoals / input.iterations, away: totalAwayGoals / input.iterations, total: (totalHomeGoals + totalAwayGoals) / input.iterations },
    goalDistribution: [...goalCounts.entries()].sort((a, b) => a[0] - b[0]).map(([goals, count]) => ({ goals, probability: divide(count) })),
    scorelines: [...scoreCounts.entries()].map(([score, value]) => ({ score, homeGoals: value.homeGoals, awayGoals: value.awayGoals, probability: divide(value.count) })).sort((a, b) => b.probability - a.probability).slice(0, 5),
    analytical: { ...exact, maximumDelta }, completedAt: new Date().toISOString(),
  }});
};
