import { getFixtures } from "@/lib/espn";
import { ODDS_SPORTS, parseBookmakerOdds, parseEspnQuotedOdds, type MarketQuote, type OddsFeed } from "@/lib/market-odds";
import type { LeagueId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const { fixtures, errors: fixtureErrors } = await getFixtures();
  const now = Date.now();
  const nextWeek = now + 7 * 86400000;
  const upcoming = fixtures.filter((f) => f.status === "scheduled" && Date.parse(f.kickoff) > now && Date.parse(f.kickoff) < nextWeek);
  const espn = parseEspnQuotedOdds(upcoming);
  const key = process.env.THE_ODDS_API_KEY?.trim();
  const fetchedAt = new Date().toISOString();
  const result: OddsFeed = {
    quotes: espn, fetchedAt,
    provider: key ? "The Odds API + ESPN fallback" : "ESPN available moneylines only",
    setupRequired: !key,
    errors: [...fixtureErrors],
  };
  if (!key) return Response.json(result, { headers: { "Cache-Control": "private, max-age=60" } });

  // Only leagues with upcoming ESPN fixtures are queried, and the odds provider
  // data cache is reused for 3 hours to conserve its free monthly credits.
  const leagues = [...new Set(upcoming.map((fixture) => fixture.leagueId))]
    .filter((league): league is LeagueId => Boolean(ODDS_SPORTS[league]));
  const region = ["us", "uk", "eu", "au"].includes(process.env.THE_ODDS_API_REGION ?? "")
    ? process.env.THE_ODDS_API_REGION! : "us";
  const responses = await Promise.allSettled(leagues.map(async (league) => {
    const sport = ODDS_SPORTS[league]!;
    const url = new URL("https://api.the-odds-api.com/v4/sports/" + sport + "/odds");
    url.searchParams.set("apiKey", key);
    url.searchParams.set("regions", region);
    url.searchParams.set("markets", "h2h,totals");
    url.searchParams.set("oddsFormat", "american");
    const response = await fetch(url, {
      next: { revalidate: 10800 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(sport + " odds HTTP " + response.status);
    const payload: unknown = await response.json();
    const remaining = Number(response.headers.get("x-requests-remaining"));
    return { quotes: parseBookmakerOdds(payload, upcoming, league), remaining: Number.isFinite(remaining) ? remaining : undefined };
  }));

  const external: MarketQuote[] = [];
  const remaining: number[] = [];
  for (let index = 0; index < responses.length; index++) {
    const item = responses[index];
    if (item.status === "fulfilled") {
      external.push(...item.value.quotes);
      if (item.value.remaining !== undefined) remaining.push(item.value.remaining);
    } else {
      result.errors.push((ODDS_SPORTS[leagues[index]] ?? leagues[index]) + ": " +
        (item.reason instanceof Error ? item.reason.message : "Odds unavailable"));
    }
  }
  result.quotes = [...external, ...espn];
  if (remaining.length) result.creditsRemaining = Math.min(...remaining);
  return Response.json(result, { headers: { "Cache-Control": "private, max-age=60" } });
}
