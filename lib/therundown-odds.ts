import type { Fixture, LeagueId } from "./types";
import { isAmericanOdds, normalizedOddsTeam, type MarketQuote, type MarketKey } from "./market-odds";

/** Official, published TheRundown V2 soccer IDs. UWCL is not listed in its catalog. */
export const RUNDOWN_SOCCER: Partial<Record<LeagueId, number>> = {
  "usa.1": 10, "eng.1": 11, "fra.1": 12, "ger.1": 13,
  "esp.1": 14, "ita.1": 15, "uefa.champions": 16,
};
const BOOK_NAMES: Record<string, string> = {
  "2":"Bovada","3":"Pinnacle","4":"SportsBetting","6":"BetOnline",
  "7":"BookMaker","9":"BetCRIS","11":"LowVig","14":"Intertops","16":"Matchbook",
  "18":"YouWager","19":"DraftKings","21":"Unibet","22":"BetMGM",
  "23":"FanDuel","24":"theScore Bet","25":"Kalshi","26":"Polymarket",
  "28":"HardRock","29":"ProphetX","30":"Novig","31":"Polymarket US",
  "32":"Circa Sports","33":"Bet105","34":"Heritage Sports","35":"Caesars",
};

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => x !== null && typeof x === "object" && !Array.isArray(x) ? x as Obj : {};
const arr = (x: unknown): unknown[] => Array.isArray(x) ? x : [];
const str = (x: unknown): string => typeof x === "string" ? x : "";
const num = (x: unknown): number | undefined => typeof x === "number" && Number.isFinite(x) ? x : undefined;

function matchSportEvent(event: Obj, fixtures: Fixture[], leagueId: LeagueId): Fixture | null {
  const teams = arr(event.teams).map(obj);
  const home = teams.find((t) => t.is_home === true);
  const away = teams.find((t) => t.is_away === true);
  if (!home || !away) return null;
  const date = Date.parse(str(event.event_date));
  if (!Number.isFinite(date)) return null;
  const names = (t: Obj) => {
    const base = str(t.name);
    const mascot = str(t.mascot);
    return new Set([normalizedOddsTeam(base), normalizedOddsTeam([base, mascot].filter(Boolean).join(" "))]);
  };
  const homeNames = names(home);
  const awayNames = names(away);
  const candidates = fixtures.filter((fixture) => fixture.leagueId === leagueId &&
    fixture.status === "scheduled" &&
    Math.abs(Date.parse(fixture.kickoff) - date) <= 90 * 60000 &&
    homeNames.has(normalizedOddsTeam(fixture.home.name)) &&
    awayNames.has(normalizedOddsTeam(fixture.away.name)));
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * V2 format: event.teams[].is_home, markets[].market_id + period_id,
 * participants[].lines[].value, prices[affiliate_id].price & .updated_at.
 * Strictly rejects unmatched events, period markets, odds sentinels and incorrect totals.
 */
export function parseRundownOdds(payload: unknown, fixtures: Fixture[], leagueId: LeagueId): MarketQuote[] {
  const quotes: MarketQuote[] = [];
  const seen = new Set<string>();
  for (const rawEvent of arr(obj(payload).events)) {
    const event = obj(rawEvent);
    const fixture = matchSportEvent(event, fixtures, leagueId);
    if (!fixture) continue;
    const homeName = normalizedOddsTeam(fixture.home.name);
    const awayName = normalizedOddsTeam(fixture.away.name);
    for (const rawMarket of arr(event.markets)) {
      const market = obj(rawMarket);
      const marketId = num(market.market_id);
      if (market.period_id !== 0 || (marketId !== 1 && marketId !== 3)) continue;
      for (const rawParticipant of arr(market.participants)) {
        const participant = obj(rawParticipant);
        const participantName = str(participant.name);
        let side: MarketKey | null = null;
        if (marketId === 1) {
          const normalized = normalizedOddsTeam(participantName);
          if (normalized === homeName) side = "home";
          else if (normalized === awayName) side = "away";
          else if (/^(draw|tie)$/i.test(participantName)) side = "draw";
        }
        for (const rawLine of arr(participant.lines)) {
          const line = obj(rawLine);
          let key = side;
          if (marketId === 3) {
            const point = Number(line.value);
            if (participantName.toLowerCase() === "over" && point === 1.5) key = "over-1.5";
            else if (participantName.toLowerCase() === "over" && point === 2.5) key = "over-2.5";
            else if (participantName.toLowerCase() === "under" && point === 3.5) key = "under-3.5";
          }
          if (!key) continue;
          for (const [affiliateId, rawPrice] of Object.entries(obj(line.prices))) {
            const price = obj(rawPrice);
            const odds = num(price.price);
            const updatedAt = str(price.updated_at);
            if (!isAmericanOdds(odds) || !Number.isFinite(Date.parse(updatedAt))) continue;
            const bookKey = "rundown:" + affiliateId;
            const quoteKey = [fixture.id, key, bookKey].join(":");
            if (seen.has(quoteKey)) continue;
            seen.add(quoteKey);
            quotes.push({
              fixtureId: fixture.id, marketKey: key, americanOdds: odds,
              bookmaker: BOOK_NAMES[affiliateId] ?? "Book #" + affiliateId,
              bookKey, source: "TheRundown", updatedAt,
            });
          }
        }
      }
    }
  }
  return quotes;
}
