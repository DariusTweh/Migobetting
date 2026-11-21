import { LEAGUES, isLeagueId } from "./leagues";
import type { Fixture, LeagueId, ProviderOdds, Team } from "./types";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const SCOREBOARD_TIME_ZONE = "America/Los_Angeles";

type UnknownObject = Record<string, unknown>;

function object(value: unknown): UnknownObject {
  return value && typeof value === "object" ? (value as UnknownObject) : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numeric(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function statusFromEspn(name: string): Fixture["status"] {
  if (name.includes("FINAL") || name.includes("FULL_TIME")) return "final";
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCELED")) return "canceled";
  if (name.includes("PROGRESS") || name.includes("HALFTIME")) return "live";
  return "scheduled";
}

function normalizeTeam(raw: unknown): Team {
  const competitor = object(raw);
  const team = object(competitor.team);
  const records = Array.isArray(competitor.records) ? competitor.records : [];
  const total = records.map(object).find((record) => record.type === "total") ?? object(records[0]);
  return {
    id: text(team.id),
    name: text(team.displayName, "Unknown team"),
    shortName: text(team.shortDisplayName, text(team.displayName, "Unknown")),
    abbreviation: text(team.abbreviation, "—"),
    logo: text(team.logo) || undefined,
    record: text(total.summary) || undefined,
    score: numeric(competitor.score),
  };
}

function normalizeOdds(raw: unknown): ProviderOdds | undefined {
  const odds = object(raw);
  if (Object.keys(odds).length === 0) return undefined;
  const provider = object(odds.provider);
  const moneyline = object(odds.moneyline);
  const close = (side: string) => numeric(object(object(moneyline[side]).close).odds);
  return {
    provider: text(provider.name, "Provider not named"),
    home: close("home"),
    draw: close("draw") ?? numeric(object(odds.drawOdds).moneyLine),
    away: close("away"),
    overUnder: numeric(odds.overUnder),
  };
}

function normalizeEvent(eventRaw: unknown, leagueId: LeagueId, fetchedAt: string): Fixture | null {
  const event = object(eventRaw);
  const competitions = Array.isArray(event.competitions) ? event.competitions : [];
  const competition = object(competitions[0]);
  const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
  const homeRaw = competitors.map(object).find((item) => item.homeAway === "home");
  const awayRaw = competitors.map(object).find((item) => item.homeAway === "away");
  if (!homeRaw || !awayRaw || !text(event.id) || !text(event.date)) return null;
  const status = object(object(event.status).type);
  const league = LEAGUES.find((item) => item.id === leagueId)!;
  const oddsList = Array.isArray(competition.odds) ? competition.odds : [];
  return {
    id: text(event.id),
    leagueId,
    league: league.name,
    kickoff: text(event.date),
    status: statusFromEspn(text(status.name)),
    statusLabel: text(status.shortDetail, text(status.detail, "Scheduled")),
    home: normalizeTeam(homeRaw),
    away: normalizeTeam(awayRaw),
    odds: normalizeOdds(oddsList[0]),
    source: "ESPN",
    sourceUpdatedAt: fetchedAt,
  };
}

/** ESPN's undated scoreboard is a narrow, provider-selected window. */
export function espnDateKey(date: Date, dayOffset = 0): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCOREBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const calendarDate = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day")) + dayOffset));
  return String(calendarDate.getUTCFullYear()) +
    String(calendarDate.getUTCMonth() + 1).padStart(2, "0") +
    String(calendarDate.getUTCDate()).padStart(2, "0");
}

async function fetchLeagueScoreboard(leagueId: LeagueId, date?: string): Promise<unknown[]> {
  const url = new URL(`${ESPN_BASE}/${leagueId}/scoreboard`);
  if (date) {
    url.searchParams.set("dates", date);
    url.searchParams.set("limit", "500");
  }
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "MIGO-Soccer-Intelligence/0.5" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`ESPN returned ${response.status} for ${leagueId}${date ? ` on ${date}` : ""}`);
  const data: unknown = await response.json();
  return Array.isArray(object(data).events) ? (object(data).events as unknown[]) : [];
}

type ScoreboardOptions = { includeYesterday?: boolean; now?: Date };

export async function getLeagueFixtures(leagueId: LeagueId, options: ScoreboardOptions = {}): Promise<Fixture[]> {
  const fetchedAt = new Date().toISOString();
  const yesterday = espnDateKey(options.now ?? new Date(), -1);
  const settled = await Promise.allSettled([
    fetchLeagueScoreboard(leagueId),
    ...(options.includeYesterday ? [fetchLeagueScoreboard(leagueId, yesterday)] : []),
  ]);
  const events = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!events.length && settled.every((result) => result.status === "rejected")) {
    const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw failure?.reason ?? new Error(`ESPN failed for ${leagueId}`);
  }
  const fixtures = events
    .map((event) => normalizeEvent(event, leagueId, fetchedAt))
    .filter((event): event is Fixture => Boolean(event));
  return [...new Map(fixtures.map((fixture) => [fixture.id, fixture])).values()];
}

export async function getFixtures(
  leagueIds: LeagueId[] = LEAGUES.map((league) => league.id),
  options: ScoreboardOptions = {},
) {
  const settled = await Promise.allSettled(leagueIds.map((leagueId) => getLeagueFixtures(leagueId, options)));
  const fixtures = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  const errors = settled.flatMap((result, index) =>
    result.status === "rejected" ? [`${leagueIds[index]}: ${result.reason instanceof Error ? result.reason.message : "Provider failed"}`] : [],
  );
  return { fixtures, errors, fetchedAt: new Date().toISOString() };
}

export function parseLeagueQuery(value: string | null): LeagueId[] {
  if (!value) return LEAGUES.map((league) => league.id);
  return value.split(",").filter(isLeagueId);
}
