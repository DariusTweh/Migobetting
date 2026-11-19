import { normalizeTeamName } from "@/lib/history";

type UnknownObject = Record<string, unknown>;
type RequestedFixture = { id: string; date: string; homeTeam: string; awayTeam: string };
const ALLOWED_LEAGUES = new Set(["eng.1", "esp.1", "ger.1", "ita.1", "fra.1"]);
const object = (value: unknown): UnknownObject => value && typeof value === "object" ? value as UnknownObject : {};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

async function espnJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "MIGO-Soccer-Intelligence/0.3" }, signal: AbortSignal.timeout(15000), next: { revalidate: 86400 } });
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
  return response.json() as Promise<unknown>;
}

function teamNames(event: UnknownObject) {
  const competition = object((Array.isArray(event.competitions) ? event.competitions : [])[0]);
  const competitors = Array.isArray(competition.competitors) ? competition.competitors.map(object) : [];
  const home = competitors.find((item) => item.homeAway === "home");
  const away = competitors.find((item) => item.homeAway === "away");
  return { home: normalizeTeamName(text(object(home?.team).displayName)), away: normalizeTeamName(text(object(away?.team).displayName)) };
}

function parseTeamRoster(summary: UnknownObject, teamName: string) {
  const rosters = Array.isArray(summary.rosters) ? summary.rosters.map(object) : [];
  const roster = rosters.find((item) => normalizeTeamName(text(object(item.team).displayName)) === normalizeTeamName(teamName));
  const entries = roster && Array.isArray(roster.roster) ? roster.roster.map(object) : [];
  const starters = entries.filter((entry) => entry.starter === true).map((entry) => ({ id: text(object(entry.athlete).id), name: text(object(entry.athlete).displayName, "Unknown player"), position: text(object(entry.position).abbreviation, text(object(entry.position).displayName, "Unknown")) }));
  return { formation: roster ? text(roster.formation) || undefined : undefined, starters };
}

export async function POST(request: Request) {
  const body = await request.json() as { leagueId?: string; fixtures?: RequestedFixture[] };
  const leagueId = body.leagueId ?? "";
  if (!ALLOWED_LEAGUES.has(leagueId)) return Response.json({ error: "Unsupported ESPN league" }, { status: 400 });
  const fixtures = Array.isArray(body.fixtures) ? body.fixtures.slice(0, 12) : [];
  const dates = [...new Set(fixtures.map((fixture) => fixture.date.slice(0, 10).replaceAll("-", "")))];
  const scoreboards = await Promise.allSettled(dates.map((date) => espnJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard?dates=${date}`)));
  const events = scoreboards.flatMap((result) => result.status === "fulfilled" && Array.isArray(object(result.value).events) ? object(result.value).events as unknown[] : []).map(object);
  const mapped = fixtures.flatMap((fixture) => {
    const home = normalizeTeamName(fixture.homeTeam); const away = normalizeTeamName(fixture.awayTeam);
    const event = events.find((candidate) => { const names = teamNames(candidate); return names.home === home && names.away === away; });
    return event ? [{ fixture, eventId: text(event.id) }] : [];
  });
  const summaries = await Promise.allSettled(mapped.map((item) => espnJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/summary?event=${item.eventId}`)));
  const fetchedAt = new Date().toISOString();
  const lineups = summaries.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const item = mapped[index]; const summary = object(result.value);
    const home = parseTeamRoster(summary, item.fixture.homeTeam); const away = parseTeamRoster(summary, item.fixture.awayTeam);
    if (home.starters.length !== 11 || away.starters.length !== 11) return [];
    return [{ matchId: item.fixture.id, lineup: { espnEventId: item.eventId, fetchedAt, timing: "actual-xi-90m-assumption" as const, home, away } }];
  });
  return Response.json({ lineups, requested: fixtures.length, matched: mapped.length, complete: lineups.length, fetchedAt });
}
