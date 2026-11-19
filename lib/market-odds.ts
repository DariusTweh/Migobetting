import type { Fixture, LeagueId } from "./types";

export type MarketKey = "home" | "draw" | "away" | "over-1.5" | "over-2.5" | "under-3.5" | "btts" | "home-draw" | "away-draw";
export type MarketQuote = {
  fixtureId: string;
  marketKey: MarketKey;
  americanOdds: number;
  bookmaker: string;
  bookKey: string;
  source: "The Odds API" | "TheRundown" | "ESPN";
  updatedAt: string;
};

export type OddsFeed = {
  quotes: MarketQuote[];
  fetchedAt: string;
  provider: string;
  setupRequired: boolean;
  errors: string[];
  creditsRemaining?: number;
};

export const ODDS_SPORTS: Partial<Record<LeagueId, string>> = {
  "eng.1": "soccer_epl",
  "esp.1": "soccer_spain_la_liga",
  "ger.1": "soccer_germany_bundesliga",
  "ita.1": "soccer_italy_serie_a",
  "fra.1": "soccer_france_ligue_one",
  "uefa.champions": "soccer_uefa_champs_league",
  "uefa.wchampions": "soccer_uefa_champs_league_women",
  "usa.1": "soccer_usa_mls",
};

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string => typeof value === "string" ? value : "";
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

export function isAmericanOdds(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Math.abs(value) >= 100 && Math.abs(value) <= 100000;
}

const ALIASES: Record<string, string> = {
  "man utd": "manchester united",
  "man united": "manchester united",
  "man city": "manchester city",
  "inter milan": "internazionale",
  "inter": "internazionale",
  "bayern munich": "bayern munchen",
  "bayern munchen": "bayern munchen",
  "psg": "paris saint germain",
  "paris sg": "paris saint germain",
  "athletic club": "athletic bilbao",
  "atletico de madrid": "atletico madrid",
  "tottenham hotspur": "tottenham",
  "wolves": "wolverhampton wanderers",
};

export function normalizedOddsTeam(name: string): string {
  let cleaned = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(f\.?c\.?|a\.?f\.?c\.?|s\.?c\.?|c\.?f\.?)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  // Protect women's matches from accidentally matching a men's fixture.
  const women = /\b(women|feminin|feminine|frauen|wfc|ladies)\b/.test(cleaned);
  cleaned = cleaned.replace(/\b(women|feminin|feminine|frauen|wfc|ladies)\b/g, "").replace(/\s+/g, " ").trim();
  cleaned = ALIASES[cleaned] ?? cleaned;
  return cleaned + (women ? " [women]" : "");
}

function matchFixture(event: Obj, fixtures: Fixture[], leagueId: LeagueId): Fixture | null {
  const h = normalizedOddsTeam(str(event.home_team));
  const a = normalizedOddsTeam(str(event.away_team));
  const kickoff = Date.parse(str(event.commence_time));
  if (!h || !a || !Number.isFinite(kickoff)) return null;
  const possibilities = fixtures.filter((fixture) =>
    fixture.leagueId === leagueId &&
    Math.abs(Date.parse(fixture.kickoff) - kickoff) <= 120 * 60000 &&
    normalizedOddsTeam(fixture.home.name) === h &&
    normalizedOddsTeam(fixture.away.name) === a,
  );
  return possibilities.length === 1 ? possibilities[0] : null;
}

/** Do not guess market lines: use the exact observed point on totals. */
export function parseBookmakerOdds(payload: unknown, fixtures: Fixture[], leagueId: LeagueId): MarketQuote[] {
  const quotes: MarketQuote[] = [];
  for (const rawEvent of list(payload)) {
    const event = obj(rawEvent);
    const fixture = matchFixture(event, fixtures, leagueId);
    if (!fixture) continue;
    const homeName = normalizedOddsTeam(str(event.home_team));
    const awayName = normalizedOddsTeam(str(event.away_team));
    for (const rawBook of list(event.bookmakers)) {
      const book = obj(rawBook);
      const bookKey = str(book.key);
      const bookmaker = str(book.title);
      if (!bookKey || !bookmaker) continue;
      for (const rawMarket of list(book.markets)) {
        const market = obj(rawMarket);
        const marketName = str(market.key);
        if (marketName !== "h2h" && marketName !== "totals") continue;
        const updatedAt = str(market.last_update);
        if (!Number.isFinite(Date.parse(updatedAt))) continue;
        for (const rawOutcome of list(market.outcomes)) {
          const outcome = obj(rawOutcome);
          const name = str(outcome.name);
          const americanOdds = num(outcome.price);
          if (!isAmericanOdds(americanOdds)) continue;
          let marketKey: MarketKey | undefined;
          if (marketName === "h2h") {
            const who = normalizedOddsTeam(name);
            if (who === homeName) marketKey = "home";
            else if (who === awayName) marketKey = "away";
            else if (/^draw$|^tie$/i.test(name)) marketKey = "draw";
          } else {
            const point = num(outcome.point);
            if (name === "Over" && point === 1.5) marketKey = "over-1.5";
            if (name === "Over" && point === 2.5) marketKey = "over-2.5";
            if (name === "Under" && point === 3.5) marketKey = "under-3.5";
          }
          if (!marketKey) continue;
          quotes.push({ fixtureId: fixture.id, marketKey, americanOdds, bookKey, bookmaker, updatedAt, source: "The Odds API" });
        }
      }
    }
  }
  return quotes;
}

/** ESPNs occasional 1X2 prices are usable as displayed quotes, but not as alternative total lines. */
export function parseEspnQuotedOdds(fixtures: Fixture[]): MarketQuote[] {
  const quotes: MarketQuote[] = [];
  for (const fixture of fixtures) {
    if (!fixture.odds || fixture.status !== "scheduled") continue;
    const provider = fixture.odds.provider;
    for (const [key, raw] of [["home", fixture.odds.home], ["draw", fixture.odds.draw], ["away", fixture.odds.away]] as const) {
      if (!isAmericanOdds(raw)) continue;
      quotes.push({
        fixtureId: fixture.id, marketKey: key, americanOdds: raw,
        bookKey: "espn:" + provider.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        bookmaker: provider + " via ESPN", source: "ESPN", updatedAt: fixture.sourceUpdatedAt,
      });
    }
  }
  return quotes;
}
