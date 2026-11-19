import { describe, expect, it } from "vitest";
import { buildResearchCard, priceSuggestedCard } from "../lib/auto-cards";
import type { Fixture } from "../lib/types";

const fixture = (id: string, offset: number): Fixture => ({
  id, leagueId: "eng.1", league: "Premier League",
  kickoff: new Date(Date.parse("2030-01-01T00:00:00Z") + offset * 86400000).toISOString(),
  status: "scheduled", statusLabel: "Scheduled",
  home: { id: "h" + id, name: "Home " + id, shortName: "Home " + id, abbreviation: "H", record: "12-5-2" },
  away: { id: "a" + id, name: "Away " + id, shortName: "Away " + id, abbreviation: "A", record: "3-5-11" },
  source: "ESPN", sourceUpdatedAt: "2029-12-01T00:00:00Z",
});
describe("auto parlays without fabricated odds", () => {
  it("returns a model-only research card from separate future fixtures", () => {
    const fixtures = [fixture("1", 4), fixture("2", 5), fixture("3", 6), fixture("4", 7), fixture("5", 8)];
    const card = buildResearchCard(fixtures, "daily-double", Date.parse("2029-12-15T00:00:00Z"));
    expect(card.legs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(card.legs.map((leg) => leg.fixtureId)).size).toBe(card.legs.length);
    expect(card.fairAmerican).not.toBeNull();
    expect(priceSuggestedCard(card, {})).toBeNull();
  });
  it("passes when no upcoming fixtures have good enough data", () => {
    const old = fixture("old", -365);
    const card = buildResearchCard([old], "daily-double", Date.parse("2029-12-15T00:00:00Z"));
    expect(card.legs).toHaveLength(0);
  });
});
