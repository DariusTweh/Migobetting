import { describe, expect, it } from "vitest";
import {
  buildPricedCard, pricedCandidates, modelFairCandidates,
  MAX_FAIR_PROBABILITY,
} from "../lib/priced-cards";
import { forecastFixture } from "../lib/model";
import { marketWins } from "../lib/parlay";
import type { Fixture } from "../lib/types";
import type { MarketQuote, MarketKey } from "../lib/market-odds";

const now = Date.parse("2030-01-02T12:00:00Z");
const future = (n: number) => new Date(Date.parse("2030-01-02T15:00:00Z") + n * 3600000).toISOString();
const fixture = (n: number): Fixture => ({
  id: "match-" + n, leagueId: "eng.1", league: "Premier League",
  kickoff: future(n), status: "scheduled", statusLabel: "Scheduled",
  home: { id: "a" + n, name: "Arsenal FC", shortName: "Arsenal", abbreviation: "ARS", record: "13-2-2" },
  away: { id: "c" + n, name: "Chelsea FC", shortName: "Chelsea", abbreviation: "CHE", record: "4-4-10" },
  source: "ESPN", sourceUpdatedAt: new Date(now).toISOString(),
});
const quote = (n: number, americanOdds: number, bookKey = "rundown-19",
  marketKey: MarketKey = "home"): MarketQuote => ({
  fixtureId: "match-" + n, marketKey, americanOdds,
  bookmaker: bookKey === "rundown-19" ? "DraftKings" : "FanDuel",
  bookKey, source: "TheRundown", updatedAt: new Date(now - 300000).toISOString(),
});
describe("today-only model fair Daily Double / Banger cards", () => {
  it("still rejects very short -1100 sportsbook quotes", () => {
    expect(pricedCandidates([fixture(1)], [quote(1, -1100)], [], now)).toHaveLength(0);
  });
  it("constructs a +100 model-fair Daily Double with NO odds provider", () => {
    const card = buildPricedCard([fixture(1),fixture(2),fixture(3),fixture(4)],
      [],"daily-double",[],now);
    expect(card.pricing).toBe("model-fair");
    expect(card.bookmaker).toBeNull();
    expect(card.legs).toHaveLength(2);
    expect(card.combinedAmerican!).toBeGreaterThanOrEqual(100);
    expect(card.legs.every(leg => leg.pricing === "model-fair" && leg.source === "MIGO Fair")).toBe(true);
    expect(card.legs.every(leg => leg.probability >= .60 &&
      leg.probability <= MAX_FAIR_PROBABILITY)).toBe(true);
    expect(card.notes.join(" ")).toContain("not offered sportsbook");
  });
  it("does not require any odds source for model-only Banger", () => {
    const card = buildPricedCard(
      [fixture(1),fixture(2),fixture(3),fixture(4),fixture(5),fixture(6)],
      [],"banger",[],now);
    expect(card.pricing).toBe("model-fair");
    expect(card.legs.length).toBeGreaterThanOrEqual(3);
    expect(card.combinedAmerican!).toBeGreaterThanOrEqual(400);
    expect(new Set(card.legs.map(leg => leg.fixtureId)).size).toBe(card.legs.length);
  });
  it("uses verified same-book prices only for the exact model-chosen markets", () => {
    const fixtures=[fixture(1),fixture(2),fixture(3)];
    const fair=buildPricedCard(fixtures,[],"daily-double",[],now);
    expect(fair.legs.length).toBeGreaterThanOrEqual(2);
    const verified=fair.legs.map(leg => quote(
      Number(leg.fixtureId.replace("match-","")), -110, "rundown-19",leg.marketKey));
    const real=buildPricedCard(fixtures,verified,"daily-double",[],now);
    expect(real.pricing).toBe("quoted");
    expect(real.bookmaker).toBe("DraftKings");
    expect(real.legs.every(leg=>leg.bookKey==="rundown-19")).toBe(true);
    expect(real.combinedAmerican!).toBeGreaterThanOrEqual(100);
  });
  it("does not combine different sportsbooks into a pretend real ticket", () => {
    const fixtures=[fixture(1),fixture(2),fixture(3)];
    const fair=buildPricedCard(fixtures,[],"daily-double",[],now);
    const quotes=fair.legs.map((leg,i) => quote(
      Number(leg.fixtureId.replace("match-","")), -110,
      i%2 ? "rundown-23" : "rundown-19",leg.marketKey));
    const card=buildPricedCard(fixtures,quotes,"daily-double",[],now);
    expect(card.pricing).toBe("model-fair");
    expect(card.bookmaker).toBeNull();
  });
  it("allows model alternate total and team-goal markets without quote availability", () => {
    const model=forecastFixture(fixture(1));
    const keys=model.markets.map(m=>m.key);
    for(const key of ["over-0.5","over-3.5","under-2.5","under-4.5",
      "home-over-0.5","away-over-0.5","home-over-1.5","away-over-1.5"]) {
      expect(keys).toContain(key);
    }
    const modelCandidates=modelFairCandidates([fixture(1)],[],now);
    expect(modelCandidates.length).toBeGreaterThan(1);
    expect(modelCandidates.some(leg=>leg.marketKey.includes("over-"))).toBe(true);
    expect(marketWins("Home team over 0.5 goals",2,0)).toBe(true);
    expect(marketWins("Away team over 0.5 goals",2,0)).toBe(false);
    expect(marketWins("Under 4.5 goals",2,2)).toBe(true);
    expect(marketWins("Over 3.5 goals",2,2)).toBe(true);
  });
  it("never inserts tomorrow, already-started, or live matches in either card", () => {
    const tomorrow = { ...fixture(99), kickoff: "2030-01-03T18:00:00Z" };
    const started = { ...fixture(21), kickoff: "2030-01-02T11:59:00Z" };
    const live={...fixture(22),status:"live" as const};
    const sameDay=[fixture(1),fixture(2),fixture(3)];
    for(const kind of ["daily-double","banger"] as const) {
      const card = buildPricedCard([...sameDay,tomorrow,started,live],
        [],kind,[],now);
      expect(card.legs.every(leg => ["match-1","match-2","match-3"].includes(leg.fixtureId))).toBe(true);
    }
  });
  it("passes instead of borrowing tomorrow when all today's matches have started", () => {
    const tomorrow = { ...fixture(12), kickoff: "2030-01-03T17:00:00Z" };
    const card = buildPricedCard([tomorrow],[quote(12,-130)],"daily-double",[],now);
    expect(card.pricing).toBe("none");
    expect(card.legs).toHaveLength(0);
    expect(card.notes[0]).toContain("today");
  });
  it("passes when one match remains because same-game markets are correlated", () => {
    const card=buildPricedCard([fixture(1)],[],"daily-double",[],now);
    expect(card.pricing).toBe("none");
    expect(card.legs).toHaveLength(0);
  });
});
