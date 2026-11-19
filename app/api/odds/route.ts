import { getFixtures } from "@/lib/espn";
import { parseEspnQuotedOdds, type OddsFeed, type MarketQuote } from "@/lib/market-odds";
import { parseRundownOdds, RUNDOWN_SOCCER_SPORT } from "@/lib/therundown";
import type { LeagueId } from "@/lib/types";

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const YYYY_MM_DD = (datetime: string) => datetime.slice(0, 10);

export async function GET() {
  const { fixtures, errors: fixtureErrors } = await getFixtures();
  const now = Date.now();
  const upcoming = fixtures.filter((f) => f.status === "scheduled" &&
    Date.parse(f.kickoff) > now && Date.parse(f.kickoff) <= now + 72 * 3600000);
  const espn = parseEspnQuotedOdds(upcoming);
  const key = process.env.THERUNDOWN_API_KEY?.trim();
  const result: OddsFeed = {
    quotes: espn, fetchedAt: new Date().toISOString(),
    provider: key ? "TheRundown Free + ESPN fallback" : "ESPN fallback (TheRundown key missing)",
    setupRequired: !key, errors: [...fixtureErrors],
  };
  if (!key) return Response.json(result, { headers: { "Cache-Control": "private, max-age=60" } });

  // One request per league/date pair; only near-term ESPN fixtures and main lines.
  // The Free plan has a strict 1 req/s and data-point quotas.
  const requests = new Map<string, { league: LeagueId; sport: number; date: string }>();
  for (const fixture of upcoming) {
    const sport = RUNDOWN_SOCCER_SPORT[fixture.leagueId];
    if (!sport) continue;
    const date = YYYY_MM_DD(fixture.kickoff);
    requests.set(sport + ":" + date, { league: fixture.leagueId, sport, date });
  }
  const batch = [...requests.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  const external: MarketQuote[] = [];
  let lastRequestTime = 0;
  for (const [index, item] of batch.entries()) {
    // Cached requests still use the same throttle; conservative on free quota.
    if (index > 0) await sleep(Math.max(0, 1100 - (Date.now() - lastRequestTime)));
    lastRequestTime = Date.now();
    const url = new URL("https://therundown.io/api/v2/sports/" + item.sport + "/events/" + item.date);
    url.searchParams.set("offset", "0");
    url.searchParams.set("market_ids", "1,3");
    url.searchParams.set("affiliate_ids", "19,22,23");
    url.searchParams.set("main_line", "true");
    url.searchParams.set("hide_closed", "true");
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "X-TheRundown-Key": key },
        next: { revalidate: 7200 },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        result.errors.push("TheRundown sport " + item.sport + ": HTTP " + response.status);
        if (response.status === 401 || response.status === 403 || response.status === 429) break;
        continue;
      }
      const remaining = Number(response.headers.get("x-datapoints-remaining"));
      if (Number.isFinite(remaining)) result.creditsRemaining = remaining;
      const json: unknown = await response.json();
      external.push(...parseRundownOdds(json, upcoming, item.league));
    } catch (error) {
      result.errors.push("TheRundown sport " + item.sport + ": " +
        (error instanceof Error ? error.message : "Request failed"));
    }
  }
  const seen = new Set<string>();
  result.quotes = [...external, ...espn].filter((quote) => {
    const k = [quote.fixtureId, quote.marketKey, quote.bookKey].join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (requests.size > batch.length) result.errors.push("Odds scan capped to eight league/date combinations per request to protect the Free plan.");
  return Response.json(result, { headers: { "Cache-Control": "private, max-age=120" } });
}
