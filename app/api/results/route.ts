type RequestEvent = { fixtureId: string; leagueId: string };
type UnknownObject = Record<string, unknown>;
const object = (value: unknown): UnknownObject => value && typeof value === "object" ? value as UnknownObject : {};
const numeric = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; };

async function fetchResult(event: RequestEvent) {
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(event.leagueId)}/summary?event=${encodeURIComponent(event.fixtureId)}`, { headers: { Accept: "application/json", "User-Agent": "MIGO-Soccer-Intelligence/0.3" }, signal: AbortSignal.timeout(10000), next: { revalidate: 300 } });
  if (!response.ok) return { fixtureId: event.fixtureId, completed: false };
  const summary = object(await response.json());
  const competition = object((Array.isArray(object(summary.header).competitions) ? object(summary.header).competitions as unknown[] : [])[0]);
  const status = object(object(competition.status).type);
  const competitors = Array.isArray(competition.competitors) ? competition.competitors.map(object) : [];
  const home = competitors.find((item) => item.homeAway === "home");
  const away = competitors.find((item) => item.homeAway === "away");
  const homeGoals = numeric(home?.score);
  const awayGoals = numeric(away?.score);
  return { fixtureId: event.fixtureId, completed: status.completed === true, homeGoals, awayGoals };
}

export async function POST(request: Request) {
  const body = await request.json() as { events?: RequestEvent[] };
  const events = Array.isArray(body.events) ? body.events.filter((event) => event.fixtureId && event.leagueId).slice(0, 50) : [];
  if (!events.length) return Response.json({ results: [] });
  return Response.json({ results: await Promise.all(events.map(fetchResult)), checkedAt: new Date().toISOString() });
}
