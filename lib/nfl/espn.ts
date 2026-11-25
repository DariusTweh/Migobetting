import type { NflBoxLine, NflGame, NflMatchup, NflMarket, NflTeam } from "./engine";
import { rankNflProps, NFL_MODEL_VERSION } from "./engine";
import { getNflverseSnapshot, applyNflverseIntelligence, weeklyBoxLinesForMatchup } from "./nflverse";
import { simulateNflMatchup } from "./simulation";
import { simulateGameMarkets } from "./game-markets";
import { localDateKey, offsetDateKey } from "../date-time";

const API = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === "object" ? v as Obj : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown): string => typeof v === "string" ? v : "";
function num(v: unknown): number | undefined {
  if (typeof v !== "number" && (typeof v !== "string" || !v.trim())) return undefined;
  const n = Number(typeof v === "string" ? v.replace(/,/g, "") : v);
  return Number.isFinite(n) ? n : undefined;
}
async function json(path: string, seconds = 300): Promise<Obj> {
  const response = await fetch(API + path, {
    headers: { Accept: "application/json" },
    next: { revalidate: seconds },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("ESPN NFL feed returned " + response.status);
  return obj(await response.json());
}
function team(value: unknown): NflTeam {
  const c = obj(value);
  const raw = obj(c.team);
  const records = arr(c.records).map(obj);
  const record = records.find((item) => item.type === "total") ?? records[0] ?? {};
  return {
    id: str(raw.id), name: str(raw.displayName) || "Unknown team",
    abbreviation: str(raw.abbreviation), logo: str(raw.logo) || undefined,
    record: str(record.summary) || undefined, score: num(c.score),
  };
}
export function parseNflEvent(raw: unknown, scoreboardWeek?: number, scoreboardSeason?: number): NflGame | null {
  const event = obj(raw), comp = obj(arr(event.competitions)[0]);
  const competitors = arr(comp.competitors).map(obj);
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  const status = obj(obj(event.status).type);
  const id = str(event.id), kickoff = str(event.date);
  if (!home || !away || !id || !Number.isFinite(Date.parse(kickoff))) return null;
  const name = str(status.name);
  const state = name.includes("FINAL") || status.completed === true ? "final" :
    name.includes("PROGRESS") || name.includes("HALFTIME") ? "live" :
    name.includes("SCHEDULED") || name.includes("PRE") ? "scheduled" : "other";
  const odds = obj(arr(comp.odds)[0]);
  return {
    id, kickoff, home: team(home), away: team(away), status: state,
    week: num(obj(event.week).number) ?? num(obj(comp.week).number) ?? scoreboardWeek,
    season: num(obj(event.season).year) ?? scoreboardSeason ?? new Date(kickoff).getUTCFullYear(),
    statusLabel: str(status.shortDetail) || str(status.detail) || state,
    spreadDetails: str(odds.details) || undefined, overUnder: num(odds.overUnder),
  };
}
export async function getNflScoreboard(now = new Date()): Promise<{ games: NflGame[]; errors: string[]; fetchedAt: string }> {
  const date = localDateKey(now);
  const days = Array.from({ length: 10 }, (_, i) => offsetDateKey(date, i - 1).replace(/-/g, ""));
  const result = await Promise.allSettled(days.map((day) => json("/scoreboard?dates=" + day + "&limit=100", 240)));
  const map = new Map<string, NflGame>(), errors: string[] = [];
  result.forEach((item, i) => {
    if (item.status === "rejected") { errors.push("ESPN schedule unavailable for " + days[i]); return; }
    for (const raw of arr(item.value.events)) {
      const game = parseNflEvent(raw, num(obj(item.value.week).number), num(obj(item.value.season).year));
      if (game) map.set(game.id, game);
    }
  });
  const earliest = now.getTime() - 86400000;
  const latest = now.getTime() + 10 * 86400000;
  const games = [...map.values()].filter((game) => Date.parse(game.kickoff) >= earliest &&
    Date.parse(game.kickoff) <= latest).sort((a,b) => a.kickoff.localeCompare(b.kickoff));
  return { games, errors, fetchedAt: now.toISOString() };
}
function seasonForKickoff(kickoff: string): number {
  const date = new Date(kickoff);
  return date.getUTCFullYear() - (date.getUTCMonth() < 3 ? 1 : 0);
}
function previousGameIds(schedule: Obj, cutoff: number): string[] {
  return arr(schedule.events).map(obj).filter((event) => {
    const type = obj(obj(event.status).type);
    const date = Date.parse(str(event.date));
    return Number.isFinite(date) && date < cutoff && (type.completed === true || str(type.name).includes("FINAL"));
  }).sort((a, b) => Date.parse(str(b.date)) - Date.parse(str(a.date)))
    .slice(0, 7).map((event) => str(event.id)).filter(Boolean);
}
function field(labels: string[], stats: unknown[], name: string): number | undefined {
  const index = labels.findIndex((label) => label.toUpperCase() === name);
  return index < 0 ? undefined : num(stats[index]);
}
/** Parses only explicit named stat columns; unknown columns are ignored rather than guessed. */
export function parseNflBoxscore(summary: unknown, id: string, date: string): NflBoxLine[] {
  const players = arr(obj(obj(summary).boxscore).players);
  const output = new Map<string, NflBoxLine>();
  for (const itemRaw of players) {
    const item = obj(itemRaw), teamId = str(obj(item.team).id);
    if (!teamId) continue;
    for (const categoryRaw of arr(item.statistics)) {
      const category = obj(categoryRaw);
      const name = str(category.name).toLowerCase();
      if (!["passing","rushing","receiving"].includes(name)) continue;
      const labels = arr(category.labels).map((label) => str(label).toUpperCase());
      for (const entryRaw of arr(category.athletes)) {
        const entry = obj(entryRaw), athlete = obj(entry.athlete);
        const athleteId = str(athlete.id), displayName = str(athlete.displayName);
        if (!athleteId || !displayName) continue;
        const key = teamId + ":" + athleteId;
        const row: NflBoxLine = output.get(key) ?? {
          gameId: id, date, athleteId, teamId, name: displayName,
          position: str(obj(athlete.position).abbreviation),
        };
        const stats = arr(entry.stats);
        if (name === "passing") {
          row.passingYards = field(labels, stats, "YDS");
          row.passingTds = field(labels, stats, "TD");
          const attempts = field(labels, stats, "ATT");
          const catt = field(labels, stats, "C/ATT");
          const index = labels.indexOf("C/ATT");
          row.passingAttempts = attempts ?? (index >= 0 ? num(str(stats[index]).split("/").pop()) : catt);
        } else if (name === "rushing") {
          row.rushingYards = field(labels, stats, "YDS");
          row.rushingAttempts = field(labels, stats, "CAR") ?? field(labels, stats, "ATT");
        } else {
          row.receivingYards = field(labels, stats, "YDS");
          row.receptions = field(labels, stats, "REC");
          row.targets = field(labels, stats, "TGTS") ?? field(labels, stats, "TGT");
        }
        output.set(key, row);
      }
    }
  }
  return [...output.values()];
}
const groupRules: Array<{ market: NflMarket; position: string; metric: keyof NflBoxLine }> = [
  { market: "passingYards", position: "QB", metric: "passingYards" },
  { market: "passingTds", position: "QB", metric: "passingTds" },
  { market: "rushingYards", position: "QB", metric: "rushingYards" },
  { market: "rushingYards", position: "RB", metric: "rushingYards" },
  { market: "receivingYards", position: "WR", metric: "receivingYards" },
  { market: "receivingYards", position: "TE", metric: "receivingYards" },
  { market: "receivingYards", position: "RB", metric: "receivingYards" },
  { market: "receptions", position: "WR", metric: "receptions" },
  { market: "receptions", position: "TE", metric: "receptions" },
  { market: "receptions", position: "RB", metric: "receptions" },
];
/** Per-opponent-game totals by position, including the other side of each ESPN box score. */
export function opponentAllowance(boxes: Array<{ gameId: string; teamId: string; rows: NflBoxLine[] }>, teamId: string): NflMatchup[] {
  const history = boxes.filter((box) => box.teamId === teamId);
  return groupRules.flatMap((rule) => {
    const values = history.flatMap((box) => {
      const rows = box.rows.filter((row) => row.teamId !== teamId &&
        row.position === rule.position && typeof row[rule.metric] === "number");
      return rows.length ? [rows.reduce((sum, row) => sum + Number(row[rule.metric]), 0)] : [];
    });
    if (values.length < 3) return [];
    return [{ market: rule.market, position: rule.position,
      allowedMean: values.reduce((sum,n) => sum + n,0) / values.length, sampleGames: values.length }];
  });
}
export async function getNflPreview(game: NflGame, now = new Date(), jointLegIds: string[] = []) {
  if (game.status !== "scheduled" || Date.parse(game.kickoff) <= now.getTime()) {
    return { error: "Pre-game projections are disabled after kickoff. No hindsight picks." };
  }
  // Prefer the current-season nflverse weekly file. ESPN's public team schedule
  // has sometimes returned zero historical games even when scores exist.
  const earlySupplemental = await getNflverseSnapshot(game, now);
  const nflverseLines = weeklyBoxLinesForMatchup(game, earlySupplemental.players);
  if (nflverseLines.length >= 10) {
    const homeGames = new Set(nflverseLines.filter((line) => line.teamId === game.home.id)
      .map((line) => line.gameId)).size;
    const awayGames = new Set(nflverseLines.filter((line) => line.teamId === game.away.id)
      .map((line) => line.gameId)).size;
    const props = applyNflverseIntelligence(game, rankNflProps(game, nflverseLines), earlySupplemental);
    const simulation = simulateNflMatchup(game, earlySupplemental, props, { jointLegIds });
    const gameMarkets=simulateGameMarkets(game,earlySupplemental.scoredGames??[],earlySupplemental.unavailable??[],earlySupplemental.players);
    return {
      game, version: NFL_MODEL_VERSION + "+nflverse-usage-v2", fetchedAt: new Date().toISOString(),
      coverage: {
        completedGames: new Set(nflverseLines.map((line) => line.gameId)).size,
        playerLines: nflverseLines.length, homeHistory: homeGames, awayHistory: awayGames,
        note: "Verified pregame nflverse weekly player stats. Week-level cutoff excludes the current game. Game-day actives, route participation, weather and sportsbook prices remain unverified.",
      },
      props, supplementalCoverage: earlySupplemental.coverage, simulation, gameMarkets,
      unavailablePlayers:(earlySupplemental.unavailable??[]).filter(p=>[game.home.abbreviation,game.away.abbreviation].includes(p.team)),
      probabilityStatus: "UNCALIBRATED" as const,
    };
  }
  const season = seasonForKickoff(game.kickoff), cutoff = Math.min(Date.parse(game.kickoff), now.getTime());
  const teams = [game.home, game.away];
  const scheduleResults = await Promise.allSettled(teams.map((t) =>
    json("/teams/" + encodeURIComponent(t.id) + "/schedule?season=" + season + "&seasontype=2", 900)));
  const idsByTeam = teams.map((t, index) => ({
    teamId: t.id, ids: scheduleResults[index].status === "fulfilled"
      ? previousGameIds(scheduleResults[index].value, cutoff) : [],
  }));
  const allIds = [...new Set(idsByTeam.flatMap((record) => record.ids))];
  const summaries = await Promise.allSettled(allIds.map((id) => json("/summary?event=" + encodeURIComponent(id), 900)));
  const boxes = allIds.flatMap((id, index) => {
    const item = summaries[index];
    if (item.status !== "fulfilled") return [];
    const competition = obj(arr(obj(obj(item.value).header).competitions)[0]);
    const date = str(competition.date);
    if (!date || Date.parse(date) >= cutoff) return [];
    return [{ gameId: id, date, rows: parseNflBoxscore(item.value, id, date) }];
  });
  // ESPN date-scoped scoreboards do not always include the week on each event.
  // Recover it from the current fixture in either team schedule; never guess by calendar.
  const fromTeamSchedule = scheduleResults.flatMap((entry) => entry.status === "fulfilled" ? arr(entry.value.events) : [])
    .map(obj).find((entry) => str(entry.id) === game.id);
  const recoveredWeek = num(obj(fromTeamSchedule?.week).number);
  const enrichedGame = { ...game, week: game.week ?? recoveredWeek };
  const ownRows = boxes.flatMap((box) => box.rows.filter((row) =>
    (row.teamId === game.home.id && idsByTeam[0].ids.includes(box.gameId)) ||
    (row.teamId === game.away.id && idsByTeam[1].ids.includes(box.gameId))));
  const allowances: Record<string, NflMatchup[]> = {};
  for (const t of teams) allowances[t.id] = opponentAllowance(boxes.filter((box) =>
    idsByTeam.find((it) => it.teamId === t.id)?.ids.includes(box.gameId))
    .map((box) => ({ ...box, teamId: t.id })), t.id);
  const supplemental = game.week === enrichedGame.week ? earlySupplemental : await getNflverseSnapshot(enrichedGame, now);
  const fallbackLines = ownRows.length ? ownRows : weeklyBoxLinesForMatchup(enrichedGame, supplemental.players);
  const props = applyNflverseIntelligence(enrichedGame, rankNflProps(enrichedGame, fallbackLines, allowances), supplemental);
  const simulation = simulateNflMatchup(enrichedGame, supplemental, props, { jointLegIds });
  const gameMarkets=simulateGameMarkets(enrichedGame,supplemental.scoredGames??[],supplemental.unavailable??[],supplemental.players);
  return {
    game: enrichedGame, version: NFL_MODEL_VERSION + "+nflverse-usage-v2", fetchedAt: new Date().toISOString(),
    coverage: {
      completedGames: boxes.length, playerLines: fallbackLines.length,
      homeHistory: idsByTeam[0].ids.length, awayHistory: idsByTeam[1].ids.length,
      note: "ESPN listed box scores only; snap/route, injury, weather and sportsbook feeds not connected.",
    },
    props, supplementalCoverage: supplemental.coverage, simulation, gameMarkets,
    unavailablePlayers:(supplemental.unavailable??[]).filter(p=>[game.home.abbreviation,game.away.abbreviation].includes(p.team)),
    probabilityStatus: "UNCALIBRATED" as const,
  };
}
