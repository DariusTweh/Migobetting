import { forecastFixture } from "./model";
import type { Fixture } from "./types";
import { americanToDecimal, decimalToAmerican } from "./odds";

export type SuggestedLeg = {
  fixtureId: string;
  fixtureLabel: string;
  kickoff: string;
  league: string;
  market: string;
  marketKey: string;
  probability: number;
  quality: "good" | "limited" | "insufficient";
};
export type SuggestedCard = {
  kind: "daily-double" | "banger";
  legs: SuggestedLeg[];
  probability: number | null;
  fairAmerican: number | null;
  notes: string[];
};

const supported = new Set(["home", "away", "home-draw", "away-draw", "over-1.5", "over-2.5", "under-3.5", "btts"]);

export function researchCandidates(fixtures: Fixture[], cutoff = Date.now()): SuggestedLeg[] {
  return fixtures.flatMap((fixture) => {
    if (fixture.status !== "scheduled" || Date.parse(fixture.kickoff) <= cutoff) return [];
    const forecast = forecastFixture(fixture);
    if (forecast.dataQuality === "insufficient") return [];
    const eligible = forecast.markets
      .filter((item) => supported.has(item.key) && Number.isFinite(item.probability) && item.probability >= 0.68)
      .sort((a, b) => b.probability - a.probability);
    if (!eligible.length) return [];
    const best = eligible[0];
    return [{
      fixtureId: fixture.id,
      fixtureLabel: fixture.home.shortName + " vs " + fixture.away.shortName,
      kickoff: fixture.kickoff, league: fixture.league,
      market: best.label,
      marketKey: best.key,
      probability: best.probability, quality: forecast.dataQuality,
    }];
  }).sort((a, b) => b.probability - a.probability || a.kickoff.localeCompare(b.kickoff));
}

export function buildResearchCard(fixtures: Fixture[], kind: SuggestedCard["kind"], cutoff = Date.now()): SuggestedCard {
  const candidates = researchCandidates(fixtures, cutoff);
  const limit = kind === "daily-double" ? 4 : 5;
  const minLegs = kind === "daily-double" ? 2 : 3;
  const selected: SuggestedLeg[] = [];
  let probability = 1;
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    selected.push(candidate);
    probability *= candidate.probability;
    // The +100 / +400 thresholds here are MODEL FAIR odds targets, not bookmaker quotes.
    const fairTarget = kind === "daily-double" ? 2 : 5;
    if (selected.length >= minLegs && 1 / probability >= fairTarget) break;
  }
  if (selected.length < minLegs) {
    return {
      kind, legs: [], probability: null, fairAmerican: null,
      notes: ["Not enough qualified upcoming fixtures to construct this card. PASS."],
    };
  }
  return {
    kind, legs: selected, probability,
    fairAmerican: decimalToAmerican(1 / probability),
    notes: [
      "MODEL-ONLY RESEARCH CARD. Probabilities are uncalibrated; no sportsbook prices were supplied.",
      "Fair odds are calculated from the model and are NOT BetMGM or any other bookmaker quote.",
      "A +100 Daily Double or +400 Banger cannot be verified until actual market prices are entered.",
      "Separate fixtures are treated as independent; shared competition effects are unmodeled.",
    ],
  };
}

export function priceSuggestedCard(card: SuggestedCard, prices: Record<string, number | undefined>) {
  const values = card.legs.map((leg) => prices[leg.fixtureId]);
  if (!card.legs.length || values.some((v) => v === undefined || !Number.isFinite(v) || v === 0)) return null;
  const decimal = values.reduce((product, v) => product * americanToDecimal(v!), 1);
  return { decimal, american: decimalToAmerican(decimal), grossReturnPerUnit: decimal };
}
