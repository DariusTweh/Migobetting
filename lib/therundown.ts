import type { Fixture, LeagueId } from "./types";
import { isAmericanOdds, normalizedOddsTeam, type MarketQuote } from "./market-odds";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown): string => typeof v === "string" ? v : "";
const id = (v: unknown): string => v === undefined || v === null ? "" : String(v);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v :
  typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;

/** Published TheRundown soccer sport IDs. UWCL is not advertised as covered. */
export const RUNDOWN_SOCCER_SPORT: Partial<Record<LeagueId, number>> = {
  "usa.1": 10,
  "eng.1": 11,
  "fra.1": 12,
  "ger.1": 13,
  "esp.1": 14,
  "ita.1": 15,
  "uefa.champions": 16,
};
const BOOKS: Record<string, string> = {
  "3": "Pinnacle",
  "19": "DraftKings",
  "22": "BetMGM",
  "23": "FanDuel",
};

function matchEspnFixture(event: Obj, fixtures: Fixture[], leagueId: LeagueId): Fixture | null {
  const teams = arr(event.teams).map(obj);
  const home = teams.find((t) => t.is_home === true);
  const away = teams.find((t) => t.is_away === true);
  if (!home || !away) return null;
  const kick = Date.parse(str(event.event_date));
  if (!Number.isFinite(kick)) return null;
  const names = (team: Obj) => {
    const base = str(team.name);
    const mascot = str(team.mascot);
    return new Set([normalizedOddsTeam(base), normalizedOddsTeam([base, mascot].filter(Boolean).join(" "))]);
  };
  const homeNames = names(home);
  const awayNames = names(away);
  const options = fixtures.filter((fixture) =>
    fixture.leagueId === leagueId &&
    Math.abs(Date.parse(fixture.kickoff) - kick) <= 90 * 60000 &&
    homeNames.has(normalizedOddsTeam(fixture.home.name)) &&
    awayNames.has(normalizedOddsTeam(fixture.away.name)),
  );
  return options.length === 1 ? options[0] : null;
}

/** V2 events -> markets -> participants -> lines -> prices. Never create implied or guessed prices. */
export function parseRundownOdds(payload: unknown, fixtures: Fixture[], leagueId: LeagueId): MarketQuote[] {
  const quotes: MarketQuote[] = [];
  for (const rawEvent of arr(obj(payload).events)) {
    const event = obj(rawEvent);
    if (str(obj(event.score).event_status) !== "STATUS_SCHEDULED") continue;
    const fixture = matchEspnFixture(event, fixtures, leagueId);
    if (!fixture || fixture.status !== "scheduled") continue;
    const teams = arr(event.teams).map(obj);
    const homeId = id(teams.find((t) => t.is_home === true)?.team_id);
    const awayId = id(teams.find((t) => t.is_away === true)?.team_id);
    for (const rawMarket of arr(event.markets)) {
      const market = obj(rawMarket);
      const marketId = num(market.market_id);
      const periodId = num(market.period_id);
      if ((marketId !== 1 && marketId !== 3) || periodId !== 0) continue;
      for (const rawParticipant of arr(market.participants)) {
        const participant = obj(rawParticipant);
        const participantName = str(participant.name).trim().toLowerCase();
        let marketKey: MarketQuote["marketKey"] | undefined;
        if (marketId === 1) {
          if (participant.type === "TYPE_TEAM" && id(participant.id) === homeId) marketKey = "home";
          else if (participant.type === "TYPE_TEAM" && id(participant.id) === awayId) marketKey = "away";
          else if (participant.type === "TYPE_RESULT" && /^(draw|tie)$/.test(participantName)) marketKey = "draw";
        } else if (participant.type === "TYPE_RESULT" || /^(over|under)\b/.test(participantName)) {
          if (/^over\b/.test(participantName)) marketKey = "over-2.5";
          else if (/^under\b/.test(participantName)) marketKey = "under-3.5";
        }
        if (!marketKey) continue;
        for (const rawLine of arr(participant.lines)) {
          const line = obj(rawLine);
          let lineMarket = marketKey;
          if (marketId === 3) {
            const point = num(line.value);
            // Free main-line totals are usually 2.5; never call a 2.5 quote "over 1.5".
            if (point === 1.5 && marketKey === "over-2.5") lineMarket = "over-1.5";
            else if (point === 2.5 && marketKey === "over-2.5") lineMarket = "over-2.5";
            else if (point === 3.5 && marketKey === "under-3.5") lineMarket = "under-3.5";
            else continue;
          }
          const prices = obj(line.prices);
          for (const [book, rawPrice] of Object.entries(prices)) {
            if (!(book in BOOKS)) continue;
            const price = obj(rawPrice);
            const value = num(price.price);
            if (!isAmericanOdds(value) || price.is_main_line === false || price.closed_at) continue;
            const updatedAt = str(price.updated_at);
            if (!Number.isFinite(Date.parse(updatedAt))) continue;
            quotes.push({
              fixtureId: fixture.id, marketKey: lineMarket, americanOdds: value,
              bookmaker: BOOKS[book], bookKey: "rundown-" + book,
              updatedAt, source: "TheRundown",
            });
          }
        }
      }
    }
  }
  return quotes;
}
