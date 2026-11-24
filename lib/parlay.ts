import type { Fixture } from "./types";
import { forecastFixture, scoreProbability } from "./model";

export type ParlayLeg = { fixtureId: string; market: string };

export function marketWins(market: string, homeGoals: number, awayGoals: number): boolean {
  const normalized = market.toLowerCase();
  if (normalized === "home win") return homeGoals > awayGoals;
  if (normalized === "draw") return homeGoals === awayGoals;
  if (normalized === "away win") return awayGoals > homeGoals;
  if (normalized === "home or draw") return homeGoals >= awayGoals;
  if (normalized === "away or draw") return awayGoals >= homeGoals;
  if (normalized === "over 0.5 goals") return homeGoals + awayGoals >= 1;
  if (normalized === "over 3.5 goals") return homeGoals + awayGoals >= 4;
  if (normalized === "under 1.5 goals") return homeGoals + awayGoals <= 1;
  if (normalized === "under 2.5 goals") return homeGoals + awayGoals <= 2;
  if (normalized === "under 4.5 goals") return homeGoals + awayGoals <= 4;
  if (normalized === "home team over 0.5 goals") return homeGoals >= 1;
  if (normalized === "away team over 0.5 goals") return awayGoals >= 1;
  if (normalized === "home team over 1.5 goals") return homeGoals >= 2;
  if (normalized === "away team over 1.5 goals") return awayGoals >= 2;
  if (normalized === "over 1.5 goals") return homeGoals + awayGoals > 1.5;
  if (normalized === "over 2.5 goals") return homeGoals + awayGoals > 2.5;
  if (normalized === "under 3.5 goals") return homeGoals + awayGoals < 3.5;
  if (normalized === "both teams to score") return homeGoals > 0 && awayGoals > 0;
  return false;
}

function sameMatchJointProbability(fixture: Fixture, markets: string[]): number {
  const forecast = forecastFixture(fixture);
  let joint = 0;
  let mass = 0;
  for (let home = 0; home <= 12; home += 1) {
    for (let away = 0; away <= 12; away += 1) {
      const probability = scoreProbability(forecast.expectedHomeGoals, forecast.expectedAwayGoals, home, away, forecast.lowScoreCorrelation);
      mass += probability;
      if (markets.every((market) => marketWins(market, home, away))) joint += probability;
    }
  }
  return joint / mass;
}

export function estimateParlayProbability(legs: ParlayLeg[], fixtures: Fixture[]) {
  const groups = new Map<string, string[]>();
  legs.forEach((leg) => groups.set(leg.fixtureId, [...(groups.get(leg.fixtureId) ?? []), leg.market]));
  let probability = 1;
  const warnings: string[] = [];
  for (const [fixtureId, markets] of groups) {
    const fixture = fixtures.find((item) => item.id === fixtureId);
    if (!fixture) return { probability: 0, warnings: ["One or more fixtures are unavailable."] };
    probability *= sameMatchJointProbability(fixture, markets);
    if (markets.length > 1) warnings.push(`Correlated ${markets.length}-leg group modeled jointly for ${fixture.home.shortName} vs ${fixture.away.shortName}.`);
  }
  if (groups.size > 1) warnings.push("Different fixtures are treated as independent; shared team news or competition effects are not modeled.");
  return { probability, warnings };
}
