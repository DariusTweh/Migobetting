import { LEAGUES, isLeagueId } from "./leagues";
import type { Fixture, LeagueId, ProviderOdds, Team } from "./types";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

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
  if (name.includes("FINAL")) return "final";
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

export async function getLeagueFixtures(leagueId: LeagueId): Promise<Fixture[]> {
  const fetchedAt = new Date().toISOString();
  const response = await fetch(`${ESPN_BASE}/${leagueId}/scoreboard`, {
    headers: { Accept: "application/json", "User-Agent": "MIGO-Soccer-Intelligence/0.1" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`ESPN returned ${response.status} for ${leagueId}`);
  const data: unknown = await response.json();
  const events = Array.isArray(object(data).events) ? (object(data).events as unknown[]) : [];
  return events.map((event) => normalizeEvent(event, leagueId, fetchedAt)).filter((event): event is Fixture => Boolean(event));
}

export async function getFixtures(leagueIds: LeagueId[] = LEAGUES.map((league) => league.id)) {
  const settled = await Promise.allSettled(leagueIds.map((leagueId) => getLeagueFixtures(leagueId)));
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
