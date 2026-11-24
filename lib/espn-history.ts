import type { HistoricalMatch } from "./history";

export const ESPN_HISTORY_COMPETITIONS = {
  "usa.1": "MLS",
  "uefa.champions": "Champions League",
  "uefa.wchampions": "UEFA Women's Champions League",
} as const;

export type EspnHistoryLeague = keyof typeof ESPN_HISTORY_COMPETITIONS;

export function isEspnHistoryLeague(value: string): value is EspnHistoryLeague {
  return Object.prototype.hasOwnProperty.call(ESPN_HISTORY_COMPETITIONS, value);
}

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => value && typeof value === "object" ? value as Obj : {};
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string => typeof value === "string" ? value : "";
const score = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * ESPN final scores are not guaranteed to be regulation-time prices/settlements.
 * Exclude events explicitly flagged as penalties or extra-time outcomes.
 */
export function parseEspnHistory(
  payload: unknown, leagueId: EspnHistoryLeague, importedAt: string,
): HistoricalMatch[] {
  const matches: HistoricalMatch[] = [];
  for (const raw of arr(obj(payload).events)) {
    const event = obj(raw);
    const id = str(event.id);
    const date = str(event.date);
    if (!id || !date || Number.isNaN(Date.parse(date))) continue;
    const competition = obj(arr(event.competitions)[0]);
    const status = obj(obj(competition.status).type);
    const statusFallback = obj(obj(event.status).type);
    const completed = status.completed === true || statusFallback.completed === true;
    const statusText = [str(status.name), str(status.description), str(status.detail),
      str(statusFallback.name), str(statusFallback.description), str(statusFallback.detail)].join(" ").toLowerCase();
    if (!completed || (!statusText.includes("final") && !statusText.includes("full time"))) continue;
    if (/penalties|shootout|after extra time|aet|extra-time|extra time/.test(statusText)) continue;
    if (Number(obj(event.status).period ?? 0) > 2 || Number(obj(competition.status).period ?? 0) > 2) continue;
    const sides = arr(competition.competitors).map(obj);
    const home = sides.find((side) => side.homeAway === "home");
    const away = sides.find((side) => side.homeAway === "away");
    if (!home || !away) continue;
    const homeTeam = str(obj(home.team).displayName);
    const awayTeam = str(obj(away.team).displayName);
    const hg = score(home.score);
    const ag = score(away.score);
    if (!homeTeam || !awayTeam || hg === null || ag === null) continue;
    const year = Number(obj(event.season).year);
    matches.push({
      id: "espn:" + leagueId + ":" + id,
      competition: ESPN_HISTORY_COMPETITIONS[leagueId],
      season: String(Number.isInteger(year) && year > 2000 ? year : new Date(date).getUTCFullYear()),
      date: new Date(date).toISOString(),
      homeTeam, awayTeam, homeGoals: hg, awayGoals: ag,
      result: hg > ag ? "H" : hg < ag ? "A" : "D",
      source: "ESPN historical scoreboard (" + leagueId + ")",
      importedAt,
    });
  }
  return matches;
}
