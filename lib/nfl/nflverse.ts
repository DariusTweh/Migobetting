import type { NflGame, NflProp, NflMarket, NflBoxLine } from "./engine";

/**
 * Supplemental nflverse data. All rows must be from weeks strictly before the
 * matchup, apart from the matchup-week injury report. Missing data is UNKNOWN.
 * Research ratings are not win probabilities.
 *
 * Source: https://github.com/nflverse/nflverse-data (CC BY 4.0; attribution).
 */
const RELEASE = "https://github.com/nflverse/nflverse-data/releases/download/";
const MAX_CSV_BYTES = 7_000_000;

export type WeeklyUsage = {
  name: string; id: string; team: string; position: string; season: number; week: number; gameId: string;
  opponent: string; targets: number | null; targetShare: number | null; carries: number | null;
  passingAttempts: number | null; passingYards: number | null; passingTds: number | null;
  rushingYards: number | null; receivingYards: number | null; receptions: number | null;
};
export type SnapRecord = {
  name: string; team: string; season: number; week: number;
  offensePct: number | null; offenseSnaps: number | null;
};
export type InjuryReport = {
  name: string; team: string; season: number; week: number;
  status: string; practice: string; injury: string; modifiedAt: string;
};
export type PositionalAllowed = {
  team: string; position: string; market: NflMarket;
  allowedPerGame: number; leaguePerGame: number; games: number; leagueGames: number;
};
export type NflverseCoverage = {
  stats: "available" | "unavailable";
  snaps: "available" | "unavailable";
  injuries: "available" | "unavailable";
  statsRows: number; snapsRows: number; injuryRows: number;
  week: number | null; season: number | null;
  attribution: string; sourceWarnings?: string[];
};
export type NflverseSnapshot = {
  players: WeeklyUsage[]; snaps: SnapRecord[]; injuries: InjuryReport[];
  defense: PositionalAllowed[];
  coverage: NflverseCoverage;
};

const normalize = (value: string) => value.normalize("NFKD").toLowerCase()
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
export const normalizePlayer = (name: string) => normalize(name);
export function canonicalNflTeam(code: string): string {
  const value = code.toUpperCase().trim();
  return ({ WSH: "WAS", JAX: "JAC", LA: "LAR", STL: "LAR", ARZ: "ARI", SD: "LAC", OAK: "LV" } as Record<string, string>)[value] ?? value;
}
const finite = (value: string | undefined): number | null => {
  if (value === undefined || !value.trim()) return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** RFC 4180 style field quoting, escaped double quotes and embedded newlines. */
export function parseNflCsv(input: string, required: string[]): Array<Record<string, string>> {
  if (input.length > MAX_CSV_BYTES) throw Error("nflverse CSV exceeds maximum accepted size");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  const content = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (char === '"') {
      if (quoted && content[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && content[index + 1] === "\n") index++;
      row.push(value); value = "";
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
    } else value += char;
  }
  if (quoted) throw Error("Incomplete CSV quoted field");
  row.push(value);
  if (row.some((item) => item.trim())) rows.push(row);
  if (!rows.length) throw Error("Empty nflverse CSV");
  const header = rows.shift()!.map((part) => part.trim());
  if (!required.every((part) => header.includes(part))) throw Error("Unexpected nflverse CSV schema: " + required.filter((part) => !header.includes(part)).join(",") + " missing; columns=" + header.slice(0,24).join(","));
  return rows.filter((parts) => parts.length === header.length).map((parts) =>
    Object.fromEntries(header.map((key, i) => [key, parts[i]])));
}

async function downloadCsv(asset: string, required: string[]) {
  const response = await fetch(RELEASE + asset, {
    headers: { Accept: "text/csv" },
    next: { revalidate: 1800 }, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error("nflverse release unavailable: " + response.status);
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_CSV_BYTES) throw Error("nflverse source larger than expected");
  return parseNflCsv(await response.text(), required);
}

export function parseWeeklyUsage(rows: Array<Record<string, string>>, season: number, week: number): WeeklyUsage[] {
  const data: WeeklyUsage[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    const w = finite(row.week), s = finite(row.season);
    const name = row.player_display_name?.trim(), id = row.player_id?.trim();
    const team = canonicalNflTeam(row.team ?? "");
    if (s !== season || w === null || w >= week || w < 1 || !name || !id ||
      !team || !["QB", "RB", "WR", "TE"].includes(row.position ?? "") ||
      (row.season_type && row.season_type !== "REG")) continue;
    const gameId = row.game_id?.trim() ?? "";
    if (!gameId) continue;
    const dedup = gameId + ":" + id;
    if (ids.has(dedup)) continue;
    ids.add(dedup);
    data.push({
      name, id, team, position: row.position, season, week: w, gameId,
      opponent: canonicalNflTeam(row.opponent_team ?? ""),
      targets: finite(row.targets), targetShare: finite(row.target_share),
      carries: finite(row.carries), passingAttempts: finite(row.attempts),
      passingYards: finite(row.passing_yards), passingTds: finite(row.passing_tds),
      rushingYards: finite(row.rushing_yards), receivingYards: finite(row.receiving_yards),
      receptions: finite(row.receptions),
    });
  }
  return data;
}

/** Exact season/week, real stat values and no fabricated game dates. */
export function weeklyBoxLinesForMatchup(game: NflGame, players: WeeklyUsage[]): NflBoxLine[] {
  const season = game.season, week = game.week;
  if (!season || !week) return [];
  const teams = new Map([
    [canonicalNflTeam(game.home.abbreviation), game.home.id],
    [canonicalNflTeam(game.away.abbreviation), game.away.id],
  ]);
  return players.flatMap((row) => {
    const teamId = teams.get(row.team);
    if (!teamId || row.season !== season || row.week >= week || row.week < 1) return [];
    const values = [row.passingYards, row.passingTds, row.rushingYards, row.receivingYards, row.receptions];
    if (!values.some((value) => value !== null)) return [];
    return [{
      gameId: row.gameId, date: "", season: row.season, week: row.week,
      athleteId: "nflverse:" + row.id, teamId, name: row.name,
      position: row.position, source: "nflverse" as const,
      passingYards: row.passingYards ?? undefined, passingTds: row.passingTds ?? undefined,
      passingAttempts: row.passingAttempts ?? undefined,
      rushingYards: row.rushingYards ?? undefined, rushingAttempts: row.carries ?? undefined,
      receivingYards: row.receivingYards ?? undefined, receptions: row.receptions ?? undefined,
      targets: row.targets ?? undefined,
    }];
  });
}

export function parseSnapCounts(rows: Array<Record<string, string>>, season: number, week: number): SnapRecord[] {
  return rows.flatMap((row) => {
    const w = finite(row.week), s = finite(row.season);
    if (s !== season || w === null || w >= week || w < 1 ||
      (row.game_type && row.game_type !== "REG") || !row.player?.trim() || !row.team?.trim()) return [];
    const raw = finite(row.offense_pct);
    // PFR provider sometimes expresses a percentage 0-1 rather than 0-100.
    const pct = raw === null ? null : raw <= 1 ? raw * 100 : raw;
    return [{
      name: row.player.trim(), team: canonicalNflTeam(row.team), season, week: w,
      offensePct: pct !== null && pct >= 0 && pct <= 100 ? pct : null,
      offenseSnaps: finite(row.offense_snaps),
    }];
  });
}

export function parseInjuries(rows: Array<Record<string, string>>, season: number, week: number, cutoff: number): InjuryReport[] {
  const latest = new Map<string, InjuryReport>();
  for (const row of rows) {
    if (finite(row.season) !== season || finite(row.week) !== week ||
      (row.season_type && row.season_type !== "REG")) continue;
    const name = row.full_name?.trim() ?? "", team = canonicalNflTeam(row.team ?? "");
    const date = row.date_modified?.trim() ?? "", ms = Date.parse(date);
    if (!name || !team || !Number.isFinite(ms) || ms > cutoff) continue;
    const key = team + ":" + normalizePlayer(name);
    const entry: InjuryReport = {
      name, team, season, week,
      status: row.report_status?.trim() ?? "",
      practice: row.practice_status?.trim() ?? "",
      injury: row.report_primary_injury?.trim() ?? "",
      modifiedAt: new Date(ms).toISOString(),
    };
    const earlier = latest.get(key);
    if (!earlier || Date.parse(entry.modifiedAt) > Date.parse(earlier.modifiedAt)) latest.set(key, entry);
  }
  return [...latest.values()];
}

function selectUnique<T extends { name: string; team: string }>(rows: T[], team: string, name: string): T[] {
  const candidates = rows.filter((row) => row.team === team && normalizePlayer(row.name) === normalizePlayer(name));
  // Normalization can conflate different players. Reject possible collisions rather than guessing.
  const uniqueNames = new Set(candidates.map((row) => row.name.toLowerCase()));
  return uniqueNames.size === 1 ? candidates : [];
}

const MARKETS: Array<{ market: NflMarket; field: "targets" | "carries" | "passingAttempts" | "receptions"; position: string }> = [
  { market: "passingYards", field: "passingAttempts", position: "QB" },
  { market: "passingTds", field: "passingAttempts", position: "QB" },
  { market: "rushingYards", field: "carries", position: "QB" },
  { market: "rushingYards", field: "carries", position: "RB" },
  { market: "receivingYards", field: "targets", position: "WR" },
  { market: "receivingYards", field: "targets", position: "TE" },
  { market: "receivingYards", field: "targets", position: "RB" },
  { market: "receptions", field: "targets", position: "WR" },
  { market: "receptions", field: "targets", position: "TE" },
  { market: "receptions", field: "targets", position: "RB" },
];

/** Position-relative opponent volume proxy. NOT an isolated player's expected production. */
export function defensiveVolume(rows: WeeklyUsage[], minGames = 4): PositionalAllowed[] {
  const games = new Map<string, { team: string; position: string; market: NflMarket; value: number }>();
  for (const row of rows) {
    if (!row.opponent) continue;
    for (const rule of MARKETS) {
      if (rule.position !== row.position || row[rule.field] === null) continue;
      const key = row.opponent + ":" + row.gameId + ":" + rule.position + ":" + rule.market;
      const current = games.get(key);
      games.set(key, { team: row.opponent, position: rule.position, market: rule.market,
        value: (current?.value ?? 0) + (row[rule.field] ?? 0) });
    }
  }
  const byRule = new Map<string, number[]>(), byTeam = new Map<string, number[]>();
  for (const row of games.values()) {
    const rule = row.position + ":" + row.market;
    const teamRule = row.team + ":" + rule;
    byRule.set(rule, [...(byRule.get(rule) ?? []), row.value]);
    byTeam.set(teamRule, [...(byTeam.get(teamRule) ?? []), row.value]);
  }
  const out: PositionalAllowed[] = [];
  for (const [key, values] of byTeam) {
    const [team, position, market] = key.split(":") as [string, string, NflMarket];
    const league = byRule.get(position + ":" + market) ?? [];
    if (values.length < minGames || league.length < 40) continue;
    out.push({ team, position, market, games: values.length, leagueGames: league.length,
      allowedPerGame: values.reduce((a, b) => a + b, 0) / values.length,
      leaguePerGame: league.reduce((a, b) => a + b, 0) / league.length });
  }
  return out;
}

const avgOrNull = (values: Array<number | null>): number | null => {
  const found = values.filter((v): v is number => v !== null);
  return found.length ? found.reduce((a, b) => a + b, 0) / found.length : null;
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const pct = (v: number | null) => v === null ? "unknown" : Math.round(v * 10) / 10 + "%";

export function applyNflverseIntelligence(game: NflGame, props: NflProp[], snapshot: NflverseSnapshot): NflProp[] {
  return props.map((pick) => {
    const team = canonicalNflTeam(pick.teamId === game.home.id ? game.home.abbreviation : game.away.abbreviation);
    const opponent = canonicalNflTeam(pick.teamId === game.home.id ? game.away.abbreviation : game.home.abbreviation);
    const playerRows = selectUnique(snapshot.players, team, pick.player).filter((row) => row.position === pick.position)
      .sort((a,b) => b.week-a.week);
    // Identity must be unique across all weekly rows and belong to a single nflverse player ID.
    const playerIds = new Set(playerRows.map((row) => row.id));
    if (!playerRows.length || playerIds.size !== 1) return pick;
    const recent = playerRows.slice(0, 6);
    const lastThree = recent.slice(0, 3);
    const targets = avgOrNull(lastThree.map((row) => row.targets));
    const carries = avgOrNull(lastThree.map((row) => row.carries));
    const passAttempts = avgOrNull(lastThree.map((row) => row.passingAttempts));
    const targetShare = avgOrNull(lastThree.map((row) => row.targetShare));
    const snapRows = selectUnique(snapshot.snaps, team, pick.player)
      .filter((row) => recent.some((r) => r.week === row.week))
      .sort((a,b) => b.week-a.week).slice(0, 3);
    const snapShare = avgOrNull(snapRows.map((row) => row.offensePct));
    const injury = selectUnique(snapshot.injuries, team, pick.player)[0];
    const rawStatus = injury?.status.toLowerCase() ?? "";
    const isOut = rawStatus === "out" || rawStatus === "ir" || rawStatus === "injured reserve";
    const isDoubtful = rawStatus === "doubtful";
    const uncertain = ["questionable", "doubtful"].includes(rawStatus);
    const allowance = snapshot.defense.find((item) =>
      item.team === opponent && item.position === pick.position && item.market === pick.market);
    // Leverage positional defensive opportunity only after normalization to league baseline.
    const ratio = allowance && allowance.leaguePerGame > 0 ?
      allowance.allowedPerGame / allowance.leaguePerGame : null;
    const matchup = ratio === null ? 50 : clamp(50 + (ratio - 1) * 30, 40, 60);
    const volume = pick.market === "passingYards" || pick.market === "passingTds" ? passAttempts :
      pick.market === "rushingYards" ? carries : targets;
    const floor = pick.market === "passingYards" || pick.market === "passingTds" ? 22 :
      pick.market === "rushingYards" && pick.position === "QB" ? 4 :
      pick.market === "rushingYards" ? 8 :
      pick.market === "receptions" ? 3 : pick.line >= 75 ? 5 : 3;
    const thinVolume = volume !== null && volume < floor;
    const thinSnaps = snapShare !== null && snapRows.length >= 2 && snapShare < 35 && pick.position !== "QB";
    const opportunity = volume === null ? pick.factors.usage :
      clamp(48 + (volume / floor - 1) * 20 + (snapShare === null ? 0 : (snapShare - 50) * .12), 25, 86);
    const usage = clamp(pick.factors.usage * .35 + opportunity * .65, 25, 90);
    const context = isOut ? 0 : uncertain ? 30 : 50;
    const factors = { ...pick.factors, usage, matchup, context };
    const rawScore = usage * .35 + matchup * .25 + pick.factors.gameScript * .2 +
      pick.factors.efficiency * .1 + context * .1;
    const researchScore = Math.round(Math.min(ratio === null ? 70 : 75, rawScore));
    const grade = isOut || isDoubtful || thinVolume || thinSnaps ||
      pick.historicalHits < 3 || researchScore < 60 ? "PASS" as const : "RESEARCH" as const;
    const evidence = [
      ...pick.evidence,
      "nflverse last-" + lastThree.length + " listed games: " +
        (pick.market === "passingYards" || pick.market === "passingTds" ? "attempts " + (passAttempts?.toFixed(1) ?? "unknown") :
          pick.market === "rushingYards" ? "carries " + (carries?.toFixed(1) ?? "unknown") :
          "targets " + (targets?.toFixed(1) ?? "unknown")) + " per game.",
      "Recent snap share " + pct(snapShare) + "; target share " + pct(targetShare === null ? null : targetShare * 100) + ".",
      ratio === null ? "Opponent positional pace comparison unavailable." :
        "Opponent " + pick.position + " opportunity allowance / league baseline: " + ratio.toFixed(2) +
        "x (" + allowance!.games + " opponent games).",
      injury ? "Week-specific injury report: " + (injury.status || "not designated") +
        "; practice: " + (injury.practice || "unknown") + " (updated " + injury.modifiedAt + ")." :
        "No matched current-week injury report. This does NOT confirm the player is active.",
    ];
    const risks = [
      ...pick.risks.filter((risk) => !risk.startsWith("Player availability")),
      "Route participation, verified starter status, game-day actives and weather remain unconnected.",
      ...(isOut ? ["Player listed OUT in the report; automatically PASS."] : []),
      ...(isDoubtful ? ["Player listed doubtful; automatically PASS."] : []),
      ...(uncertain && !isDoubtful ? ["Player questionable; extra availability risk."] : []),
      ...(thinVolume ? ["Observed opportunity is below the minimum threshold for this market."] : []),
      ...(thinSnaps ? ["Observed offensive snap participation is low."] : []),
      "Matching nflverse stats to ESPN uses unique player name + team; check transfers or duplicate names.",
    ];
    return { ...pick, factors, researchScore, grade, evidence, risks,
      intelligence: {
        source: "nflverse weekly stats/snap counts/injuries",
        sampleGames: recent.length, targets, carries, passingAttempts: passAttempts,
        targetShare: targetShare === null ? null : targetShare * 100,
        snapShare, status: injury?.status || "unverified",
        defenseRatio: ratio,
      },
    };
  }).sort((a,b) => Number(b.grade === "RESEARCH") - Number(a.grade === "RESEARCH") ||
    b.researchScore - a.researchScore);
}

export async function getNflverseSnapshot(game: NflGame, now = new Date()): Promise<NflverseSnapshot> {
  const season = game.season, week = game.week;
  const empty = (s: NflverseCoverage["stats"], n: NflverseCoverage["snaps"], i: NflverseCoverage["injuries"]): NflverseSnapshot => ({
    players: [], snaps: [], injuries: [], defense: [],
    coverage: { stats: s, snaps: n, injuries: i, statsRows: 0, snapsRows: 0, injuryRows: 0,
      season: season ?? null, week: week ?? null, attribution: "nflverse/nflverse-data (CC BY 4.0)" },
  });
  if (!Number.isInteger(season) || !Number.isInteger(week) || !season || !week ||
    season < 1999 || season > 2100 || week < 1 || week > 22) return empty("unavailable", "unavailable", "unavailable");
  // Only accept scheduled pregame snapshots. Current-week injury changes after now are excluded.
  const cutoff = Math.min(Date.parse(game.kickoff), now.getTime());
  const records = await Promise.allSettled([
    downloadCsv("stats_player/stats_player_week_" + season + ".csv", ["player_id","player_display_name","team","season","week","game_id","position"]),
    downloadCsv("snap_counts/snap_counts_" + season + ".csv", ["player","team","season","week","offense_pct"]),
    downloadCsv("injuries/injuries_" + season + ".csv", ["full_name","team","season","week","date_modified"]),
  ]);
  const sourceWarnings = records.flatMap((result, index) => result.status === "rejected"
    ? [(["stats","snaps","injuries"][index]) + ": " +
      (result.reason instanceof Error ? result.reason.message.slice(0, 120) : "provider unavailable")]
    : []);
  const stats = records[0].status === "fulfilled" ? parseWeeklyUsage(records[0].value, season, week) : [];
  const snaps = records[1].status === "fulfilled" ? parseSnapCounts(records[1].value, season, week) : [];
  const injuries = records[2].status === "fulfilled" ? parseInjuries(records[2].value, season, week, cutoff) : [];
  return {
    players: stats, snaps, injuries, defense: defensiveVolume(stats),
    coverage: {
      stats: records[0].status === "fulfilled" ? "available" : "unavailable",
      snaps: records[1].status === "fulfilled" ? "available" : "unavailable",
      injuries: records[2].status === "fulfilled" ? "available" : "unavailable",
      statsRows: stats.length, snapsRows: snaps.length, injuryRows: injuries.length,
      season, week, attribution: "nflverse/nflverse-data (CC BY 4.0)", sourceWarnings,
    },
  };
}
