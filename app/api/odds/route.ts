import { getFixtures } from "@/lib/espn";
import { parseBookmakerOdds, parseEspnQuotedOdds, type MarketQuote, type OddsFeed, ODDS_SPORTS } from "@/lib/market-odds";
import { RUNDOWN_SOCCER_SPORT, parseRundownOdds } from "@/lib/therundown";
import type { LeagueId } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_RUNDOWN_REQUESTS = 8;
const DEFAULT_AFFILIATES = "3,19,22"; // Pinnacle, DraftKings and BetMGM.
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const usageNumber = (value: string | null) => {
  if (value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Primary provider is TheRundown's documented V2 API.
 * Free is 1 request/sec; perform bounded requests sequentially and cache 45m.
 * Unlike a public app key, the credential is ONLY used by this server route.
 */
async function getRundownOdds(fixtures: Awaited<ReturnType<typeof getFixtures>>["fixtures"], key: string) {
  const errors: string[] = [];
  const quotes: MarketQuote[] = [];
  let creditsRemaining: number | undefined;
  const upcoming = fixtures.filter((f) =>
    f.status === "scheduled" &&
    Date.parse(f.kickoff) > Date.now() &&
    Date.parse(f.kickoff) <= Date.now() + 72 * 3600000,
  );

  // UTC fixture dates prevent guessing a locale offset for cross-region matches.
  const groups = new Map<string, { leagueId: LeagueId; sportId: number; date: string }>();
  const uncoveredLeagues = new Set<string>();
  for (const fixture of upcoming) {
    const sportId = RUNDOWN_SOCCER_SPORT[fixture.leagueId];
    if (!sportId) {
      uncoveredLeagues.add(fixture.league);
      continue;
    }
    const date = fixture.kickoff.slice(0, 10);
    groups.set(sportId + ":" + date, { leagueId: fixture.leagueId, sportId, date });
  }
  const work = [...groups.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || a.sportId - b.sportId,
  ).slice(0, MAX_RUNDOWN_REQUESTS);

  if (groups.size > MAX_RUNDOWN_REQUESTS) {
    errors.push("Free-tier request cap: checked " + MAX_RUNDOWN_REQUESTS +
      " league/day groups out of " + groups.size + ". Try again after cache refresh for additional fixtures.");
  }
  if (uncoveredLeagues.has("UEFA Women's Champions League")) {
    errors.push("TheRundown's published sport IDs do not list Women's Champions League. Odds for that competition are not confirmed.");
  }

  for (let index = 0; index < work.length; index++) {
    if (index) await sleep(1100); // Keep within the free plan's one request/second.
    const target = work[index];
    const url = new URL("https://therundown.io/api/v2/sports/" + target.sportId + "/events/" + target.date);
    url.searchParams.set("market_ids", "1,3");
    url.searchParams.set("main_line", "true");
    url.searchParams.set("affiliate_ids", DEFAULT_AFFILIATES);
    url.searchParams.set("odds_format", "american");
    try {
      const response = await fetch(url, {
        headers: { "X-TheRundown-Key": key, Accept: "application/json" },
        next: { revalidate: 2700 }, // 45 minutes, protects finite free data points.
        signal: AbortSignal.timeout(14000),
      });
      const remaining = usageNumber(response.headers.get("x-datapoints-remaining"));
      if (remaining !== undefined) creditsRemaining = remaining;
      if (!response.ok) {
        errors.push("TheRundown " + target.sportId + " " + target.date + ": HTTP " +
          response.status + (response.status === 429 ? " (rate limit)" :
          response.status === 401 || response.status === 403 ? " (check key, plan or entitlement)" : ""));
        continue;
      }
      const payload: unknown = await response.json();
      quotes.push(...parseRundownOdds(payload, upcoming, target.leagueId));
    } catch (error) {
      errors.push("TheRundown " + target.sportId + ": " +
        (error instanceof Error ? error.message : "Request failed"));
    }
  }
  return { quotes, errors, creditsRemaining };
}

/** Optional existing The Odds API key; only used when a Rundown key is absent. */
async function getLegacyOdds(fixtures: Awaited<ReturnType<typeof getFixtures>>["fixtures"], key: string) {
  const groups = [...new Set(fixtures.filter((f) => f.status === "scheduled" && Date.parse(f.kickoff) > Date.now())
    .map((fixture) => fixture.leagueId))].filter((league) => ODDS_SPORTS[league]);
  const quotes: MarketQuote[] = [];
  const errors: string[] = [];
  for (const league of groups.slice(0, 5)) {
    const url = new URL("https://api.the-odds-api.com/v4/sports/" + ODDS_SPORTS[league] + "/odds");
    url.searchParams.set("apiKey", key);
    url.searchParams.set("regions", "us");
    url.searchParams.set("markets", "h2h,totals");
    url.searchParams.set("oddsFormat", "american");
    try {
      const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(12000) });
      if (!res.ok) { errors.push("Alternative odds HTTP " + res.status); continue; }
      quotes.push(...parseBookmakerOdds(await res.json(), fixtures, league));
    } catch (e) { errors.push(e instanceof Error ? e.message : "Alternative odds request failed"); }
  }
  return { quotes, errors };
}

export async function GET() {
  const { fixtures, errors: fixtureErrors } = await getFixtures();
  const now = Date.now();
  const upcoming = fixtures.filter((f) => f.status === "scheduled" && Date.parse(f.kickoff) > now);
  const espn = parseEspnQuotedOdds(upcoming);
  const rundownKey = process.env.THERUNDOWN_API_KEY?.trim();
  const legacyKey = process.env.THE_ODDS_API_KEY?.trim();
  const result: OddsFeed = {
    quotes: espn, fetchedAt: new Date().toISOString(),
    provider: "ESPN available 1X2 quotes",
    setupRequired: !rundownKey && !legacyKey,
    errors: [...fixtureErrors],
  };
  if (rundownKey) {
    const rundown = await getRundownOdds(upcoming, rundownKey);
    result.quotes = [...rundown.quotes, ...espn];
    result.errors.push(...rundown.errors);
    result.provider = "TheRundown V2 (free-tier delayed odds) + ESPN fallback";
    if (rundown.creditsRemaining !== undefined) result.creditsRemaining = rundown.creditsRemaining;
  } else if (legacyKey) {
    const legacy = await getLegacyOdds(upcoming, legacyKey);
    result.quotes = [...legacy.quotes, ...espn];
    result.errors.push(...legacy.errors);
    result.provider = "The Odds API + ESPN fallback";
  }
  return Response.json(result, { headers: { "Cache-Control": "private, max-age=60" } });
}
