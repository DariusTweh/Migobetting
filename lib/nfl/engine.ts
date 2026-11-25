/**
 * MIGO NFL research engine v1.
 * No calibrated probabilities or executable sportsbook prices are produced here.
 * Evidence is restricted to game logs dated before the selected kickoff.
 */
export type NflMarket = "passingYards" | "passingTds" | "rushingYards" | "receivingYards" | "receptions";
export type NflBoxLine = {
  gameId: string; date: string; teamId: string; athleteId: string; name: string; position: string;
  season?: number; week?: number; source?: "ESPN" | "nflverse";
  passingYards?: number; passingTds?: number; passingAttempts?: number;
  rushingYards?: number; rushingAttempts?: number; receivingYards?: number;
  receptions?: number; targets?: number;
};
export type NflTeam = { id: string; name: string; abbreviation: string; logo?: string; record?: string; score?: number };
export type NflGame = {
  id: string; kickoff: string; status: "scheduled" | "live" | "final" | "other";
  week?: number; season?: number;
  home: NflTeam; away: NflTeam; statusLabel: string; spreadDetails?: string; overUnder?: number;
};
export type NflMatchup = {
  market: NflMarket; position: string; allowedMean: number; sampleGames: number;
};
export type NflProp = {
  id: string; athleteId: string; player: string; teamId: string; position: string;
  market: NflMarket; line: number; label: string; projection: number;
  sampleGames: number; historicalHits: number; recentValues: number[];
  researchScore: number; grade: "RESEARCH" | "PASS";
  factors: { usage: number; matchup: number; gameScript: number; efficiency: number; context: number };
  evidence: string[]; risks: string[];
  calibratedProbability: null; fairOdds: null;
  decisionReasons?: string[];
  intelligence?: {
    source: string; sampleGames: number; targets: number | null; carries: number | null;
    passingAttempts: number | null; targetShare: number | null; snapShare: number | null;
    status: string; defenseRatio: number | null;
  };
};
export const NFL_MODEL_VERSION = "migo-nfl-prop-research-v1";
export const NFL_WEIGHTS = { usage: .35, matchup: .25, gameScript: .20, efficiency: .10, context: .10 } as const;
const RANGES: Record<NflMarket, number[]> = {
  passingYards: [150, 200, 250, 300, 350],
  passingTds: [1, 2, 3],
  rushingYards: [25, 50, 75, 100, 125],
  receivingYards: [25, 50, 75, 100, 125],
  receptions: [2, 3, 4, 5, 6, 7, 8],
};
const LABELS: Record<NflMarket, string> = {
  passingYards: "passing yards", passingTds: "passing TDs",
  rushingYards: "rushing yards", receivingYards: "receiving yards",
  receptions: "receptions",
};
const clamp = (value: number, low = 0, high = 100) => Math.max(low, Math.min(high, value));
const average = (values: number[]) => values.reduce((total, x) => total + x, 0) / values.length;
const marketForPosition = (position: string): NflMarket[] =>
  position === "QB" ? ["passingYards", "passingTds", "rushingYards"] :
  position === "RB" ? ["rushingYards", "receivingYards", "receptions"] :
  ["WR", "TE"].includes(position) ? ["receivingYards", "receptions"] : [];

export function historyBeforeKickoff(lines: NflBoxLine[], fixture: string | NflGame): NflBoxLine[] {
  const kickoff = typeof fixture === "string" ? fixture : fixture.kickoff;
  const limit = Date.parse(kickoff);
  if (!Number.isFinite(limit) &&
    !(typeof fixture !== "string" && Number.isInteger(fixture.week) &&
      Number.isInteger(fixture.season))) return [];
  return lines.filter((line) => {
    // Never fabricate an NFL game date for a week-level source. A verified season
    // and week are sufficient only when the fixture also has season/week metadata.
    if (typeof fixture !== "string" && Number.isInteger(fixture.week) &&
      Number.isInteger(fixture.season) && Number.isInteger(line.week) &&
      Number.isInteger(line.season)) {
      return line.season! < fixture.season! ||
        (line.season === fixture.season && line.week! < fixture.week!);
    }
    return Number.isFinite(Date.parse(line.date)) && Date.parse(line.date) < limit;
  });
}

/** Only games with a listed athlete/category are counted; missing ESPN rows are not fabricated as zeroes. */
export function rankNflProps(
  game: NflGame,
  boxLines: NflBoxLine[],
  opponentAllowances: Record<string, NflMatchup[]> = {},
): NflProp[] {
  const groups = new Map<string, NflBoxLine[]>();
  for (const line of historyBeforeKickoff(boxLines, game)) {
    if (line.teamId !== game.home.id && line.teamId !== game.away.id) continue;
    const key = line.teamId + ":" + line.athleteId;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  const candidates: NflProp[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => {
      if (a.season !== undefined && b.season !== undefined &&
          a.week !== undefined && b.week !== undefined) {
        return b.season - a.season || b.week - a.week;
      }
      const left = Date.parse(a.date), right = Date.parse(b.date);
      return Number.isFinite(left) && Number.isFinite(right) ? right - left : 0;
    });
    const mostRecent = group[0];
    const opponentId = mostRecent.teamId === game.home.id ? game.away.id : game.home.id;
    for (const market of marketForPosition(mostRecent.position)) {
      const observed = group.filter((line) => typeof line[market] === "number" && Number.isFinite(line[market])).slice(0, 6);
      if (observed.length < 4) continue;
      const values = observed.map((line) => line[market] as number);
      const baseline = average(values);
      const recent = average(values.slice(0, 3));
      const projection = Math.max(0, baseline * .45 + recent * .55);
      const allowance = (opponentAllowances[opponentId] ?? []).find((row) => row.market === market && row.position === mostRecent.position && row.sampleGames >= 3);
      // Defensive allowance is a descriptive matchup proxy, not an opponent-adjusted probability.
      const matchupNote = allowance
        ? "Opponent recent " + mostRecent.position + " " + LABELS[market] + " allowed: " + allowance.allowedMean.toFixed(1) + "/game (" + allowance.sampleGames + " games)."
        : "No verified opponent positional allowance sample.";
      const floor = Math.min(...values);
      const coefficient = baseline > 0 ? Math.sqrt(average(values.map((v) => (v - baseline) ** 2))) / baseline : 1;
      for (const line of RANGES[market]) {
        const hits = values.filter((value) => value >= line).length;
        // Model alternatives separately from recommendation eligibility. Do not
        // hide 200+ when the higher QB alternative is unappealing or arbitrary.
        if (line > Math.max(projection * 1.7,market==="passingTds"?3:0)) continue;
        const rate = hits / observed.length; // descriptive only, not a forward probability
        const usage = clamp(40 + observed.length * 5 + Math.min(25, Math.max(0, (projection / line - 1) * 30)));
        // Positional team totals cannot be compared directly with an individual projection.
        // Matchup remains neutral until opponent-adjusted, league-normalized baselines are validated.
        const matchup = 50;
        const gameScript = 50; // a verified implied script is not yet connected
        const efficiency = clamp(80 - coefficient * 35, 25, 80);
        const context = 50; // confirmed roles, injuries and weather are not yet connected
        const factors = { usage, matchup, gameScript, efficiency, context };
        const raw = usage * NFL_WEIGHTS.usage + matchup * NFL_WEIGHTS.matchup +
          gameScript * NFL_WEIGHTS.gameScript + efficiency * NFL_WEIGHTS.efficiency + context * NFL_WEIGHTS.context;
        const researchScore = Math.round(Math.min(69, raw));
        candidates.push({
          id: mostRecent.athleteId + ":" + market + ":" + line, athleteId: mostRecent.athleteId,
          player: mostRecent.name, teamId: mostRecent.teamId, position: mostRecent.position,
          market, line, label: line + "+ " + LABELS[market],
          projection: Math.round(projection * 10) / 10,
          sampleGames: observed.length, historicalHits: hits, recentValues: values,
          researchScore,
          grade: hits >= 3 && projection >= line*.95 && researchScore>=55 ? "RESEARCH" : "PASS",
          decisionReasons:[
            ...(hits<3?["Historical clears insufficient for this alternate line."]:[]),
            ...(projection<line*.95?["Historical weighted mean is below the line."]:[]),
            ...(researchScore<55?["Research evidence below minimum quality threshold (55/100)."]:[]),
          ],
          factors,
          evidence: [
            "Listed in ESPN game box scores for " + observed.length + " earlier games.",
            "Last " + observed.length + " listed averages: " + baseline.toFixed(1) + "; last three listed: " + recent.toFixed(1) + ".",
            "Cleared " + line + " in " + hits + "/" + observed.length + " listed games (descriptive, not a probability).",
            matchupNote,
          ],
          risks: [
            "Player availability, injuries, snap share and weather are not verified.",
            "A game absent from a player's statistical category may not be a true zero; listed-game averages can overstate production.",
            "No sportsbook odds or independently calibrated probability. Research score is NOT hit probability.",
          ],
          calibratedProbability: null, fairOdds: null,
        });
      }
    }
  }
  // Keep a sensible baseline alternate AND one higher alternative per
  // player/market. Large unsupported alternatives remain PASS, not hidden.
  const byMarket = new Map<string,NflProp[]>();
  for(const pick of candidates){
    const key=pick.athleteId+":"+pick.market;
    byMarket.set(key,[...(byMarket.get(key)??[]),pick]);
  }
  const selected:NflProp[]=[];
  for(const options of byMarket.values()){
    const ascending=options.slice().sort((a,b)=>a.line-b.line);
    const eligible=ascending.filter(p=>p.grade==="RESEARCH");
    const baseline=eligible[0]??ascending[0];
    if(!baseline)continue;
    selected.push(baseline);
    // Differentiate the base alt from a higher upside research alternative.
    const extra=eligible.filter(p=>p.line>baseline.line).at(-1) ??
      ascending.filter(p=>p.line>baseline.line).find(p=>p.historicalHits>=1);
    if(extra)selected.push(extra);
  }
  return selected.sort((a, b) => Number(b.grade === "RESEARCH") - Number(a.grade === "RESEARCH") ||
    b.researchScore - a.researchScore || b.historicalHits - a.historicalHits || b.line - a.line);
}
