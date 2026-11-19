import "server-only";
import type { Fixture, LineupIntelligence, LineupPlayer, TeamLineup } from "./types";
import { canLabelLineupConfirmed, startingLikelihood } from "./lineup-model";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
type UnknownObject = Record<string, unknown>;
const object = (value: unknown): UnknownObject => value && typeof value === "object" ? value as UnknownObject : {};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const number = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; };

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "MIGO-Soccer-Intelligence/0.2" }, signal: AbortSignal.timeout(10000), next: { revalidate: 900 } });
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
  return response.json();
}

type ObservedStarter = { id: string; name: string; position: string; jersey?: string; goals: number; assists: number; formationPlace: number };
type ObservedLineup = { date: string; formation?: string; starters: ObservedStarter[] };

function statValue(entry: UnknownObject, statName: string) {
  const stats = Array.isArray(entry.stats) ? entry.stats.map(object) : [];
  return number(stats.find((stat) => stat.name === statName)?.value) ?? 0;
}

function parseRoster(summary: unknown, teamId: string, date: string): ObservedLineup | null {
  const rosters = Array.isArray(object(summary).rosters) ? (object(summary).rosters as unknown[]).map(object) : [];
  const roster = rosters.find((item) => text(object(item.team).id) === teamId);
  if (!roster) return null;
  const entries = Array.isArray(roster.roster) ? roster.roster.map(object) : [];
  const starters = entries.filter((entry) => entry.starter === true).map((entry) => {
    const athlete = object(entry.athlete);
    const position = object(entry.position);
    return {
      id: text(athlete.id), name: text(athlete.displayName, "Unknown player"), position: text(position.abbreviation, text(position.displayName, "Unknown")),
      jersey: text(entry.jersey) || undefined, goals: statValue(entry, "totalGoals"), assists: statValue(entry, "goalAssists"), formationPlace: number(entry.formationPlace) ?? 99,
    };
  });
  return starters.length === 11 ? { date, formation: text(roster.formation) || undefined, starters } : null;
}

function parseInjuries(summary: unknown, teamId: string) {
  const raw = object(summary).injuries;
  if (!Array.isArray(raw)) return [];
  return raw.map(object).filter((group) => text(object(group.team).id) === teamId).flatMap((group) => {
    const injuries = Array.isArray(group.injuries) ? group.injuries.map(object) : [];
    return injuries.map((injury) => ({ name: text(object(injury.athlete).displayName, "Unknown player"), reason: text(injury.type, text(injury.status, "Availability concern")), source: "ESPN match summary" }));
  });
}

function confirmedTeamLineup(summary: unknown, fixture: Fixture, side: "home" | "away", checkedAt: string): TeamLineup | null {
  const team = fixture[side];
  const lineup = parseRoster(summary, team.id, fixture.kickoff);
  if (!lineup) return null;
  const players: LineupPlayer[] = lineup.starters.sort((a, b) => a.formationPlace - b.formationPlace).map((player) => ({
    id: player.id, name: player.name, position: player.position, jersey: player.jersey, starts: 1, observedMatches: 1,
    startingProbability: 1, confidence: "high", goals: player.goals, assists: player.assists, lastObservedAt: fixture.kickoff,
  }));
  return { teamId: team.id, teamName: team.name, status: "CONFIRMED", formation: lineup.formation, players, missingPlayers: parseInjuries(summary, team.id), observedMatches: 1, source: "ESPN match summary starters", sourceTimestamp: checkedAt };
}

async function recentCompletedEvents(fixture: Fixture, teamId: string) {
  const season = new Date(fixture.kickoff).getUTCFullYear();
  const schedule = object(await fetchJson(`${ESPN_BASE}/${fixture.leagueId}/teams/${teamId}/schedule?season=${season}`));
  const events = Array.isArray(schedule.events) ? schedule.events.map(object) : [];
  return events.filter((event) => {
    const competition = object((Array.isArray(event.competitions) ? event.competitions : [])[0]);
    return object(object(competition.status).type).completed === true && text(event.date) < fixture.kickoff;
  }).sort((a, b) => text(b.date).localeCompare(text(a.date))).slice(0, 5);
}

async function projectedTeamLineup(fixture: Fixture, side: "home" | "away", checkedAt: string): Promise<TeamLineup> {
  const team = fixture[side];
  try {
    const events = await recentCompletedEvents(fixture, team.id);
    const summaries = await Promise.allSettled(events.map((event) => fetchJson(`${ESPN_BASE}/${fixture.leagueId}/summary?event=${text(event.id)}`)));
    const observed = summaries.flatMap((result, index) => result.status === "fulfilled" ? [parseRoster(result.value, team.id, text(events[index].date))].filter((item): item is ObservedLineup => Boolean(item)) : []);
    if (observed.length === 0) throw new Error("No earlier starting XI data returned");
    const players = new Map<string, { sample: ObservedStarter; starts: number; goals: number; assists: number; lastObservedAt: string }>();
    observed.forEach((lineup) => lineup.starters.forEach((player) => {
      const existing = players.get(player.id);
      players.set(player.id, { sample: player, starts: (existing?.starts ?? 0) + 1, goals: (existing?.goals ?? 0) + player.goals, assists: (existing?.assists ?? 0) + player.assists, lastObservedAt: existing?.lastObservedAt ?? lineup.date });
    }));
    const projected = [...players.values()].sort((a, b) => b.starts - a.starts || a.sample.formationPlace - b.sample.formationPlace).slice(0, 11).map(({ sample, starts, goals, assists, lastObservedAt }): LineupPlayer => {
      const likelihood = startingLikelihood(starts, observed.length);
      return { id: sample.id, name: sample.name, position: sample.position, jersey: sample.jersey, starts, observedMatches: observed.length, startingProbability: likelihood.probability, confidence: likelihood.confidence, goals, assists, lastObservedAt };
    });
    return { teamId: team.id, teamName: team.name, status: projected.length === 11 ? "PROJECTED" : "UNKNOWN", formation: observed[0]?.formation, players: projected, missingPlayers: [], observedMatches: observed.length, source: `ESPN previous ${observed.length} completed-match lineups`, sourceTimestamp: checkedAt };
  } catch {
    return { teamId: team.id, teamName: team.name, status: "UNKNOWN", players: [], missingPlayers: [], observedMatches: 0, source: "ESPN lineup history unavailable", sourceTimestamp: checkedAt };
  }
}

export async function getLineupIntelligence(fixture: Fixture): Promise<LineupIntelligence> {
  const checkedAt = new Date().toISOString();
  const minutesToKickoff = (new Date(fixture.kickoff).getTime() - Date.now()) / 60000;
  let currentSummary: unknown = {};
  try { currentSummary = await fetchJson(`${ESPN_BASE}/${fixture.leagueId}/summary?event=${fixture.id}`); } catch { /* projected history can still work */ }
  const currentHome = parseRoster(currentSummary, fixture.home.id, fixture.kickoff);
  const currentAway = parseRoster(currentSummary, fixture.away.id, fixture.kickoff);
  const insideConfirmationWindow = minutesToKickoff <= 90;
  const confirmedHome = canLabelLineupConfirmed(minutesToKickoff, currentHome?.starters.length ?? 0) ? confirmedTeamLineup(currentSummary, fixture, "home", checkedAt) : null;
  const confirmedAway = canLabelLineupConfirmed(minutesToKickoff, currentAway?.starters.length ?? 0) ? confirmedTeamLineup(currentSummary, fixture, "away", checkedAt) : null;
  const [projectedHome, projectedAway] = await Promise.all([
    confirmedHome ? Promise.resolve(confirmedHome) : projectedTeamLineup(fixture, "home", checkedAt),
    confirmedAway ? Promise.resolve(confirmedAway) : projectedTeamLineup(fixture, "away", checkedAt),
  ]);
  const warnings = [
    "ESPN does not expose a reliable original publication timestamp for its lineup response.",
    "Recent minutes and causal player-impact estimates are unavailable from the validated inputs.",
  ];
  if (!insideConfirmationWindow) warnings.unshift(`Confirmed-lineup check opens 90 minutes before kickoff; currently ${Math.max(0, Math.round(minutesToKickoff))} minutes remain.`);
  return {
    fixtureId: fixture.id, cutoffPolicyMinutes: 90, checkedAt, minutesToKickoff, home: projectedHome, away: projectedAway,
    impact: { applied: false, homeExpectedGoalsDelta: 0, awayExpectedGoalsDelta: 0, reason: "No regularized, opponent-adjusted historical player impact estimate is available, so team-level expected goals remain unchanged." },
    evidence: [projectedHome, projectedAway].map((lineup) => ({ claim: `${lineup.teamName} ${lineup.status.toLowerCase()} XI based on ${lineup.observedMatches} eligible earlier lineups.`, source: lineup.source, timestamp: lineup.sourceTimestamp })),
    warnings,
  };
}
