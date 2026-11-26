import type { Fixture } from "./types";
import { DOMESTIC_MEN, UEFA_MEN as CONTINENTAL_MEN } from "./uefa-competitions";
import { formTeamKey } from "./form-history";
import type { HistoricalMatch } from "./history";

export type FirstHalfMarketKey = "first-half-over-0.5" | "first-half-over-1.5" |
  "home-first-half-goal" | "away-first-half-goal" | "half-time-draw";
export type FirstHalfForecast = {
  modelVersion: "migo-first-half-cross-league-v2";
  quality: "good" | "limited";
  historicalMatches: number;
  effectiveMatches: number;
  homeTeamMatches: number;
  awayTeamMatches: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  markets: Array<{ key: FirstHalfMarketKey; label: string; probability: number }>;
  halfTimeScores: Array<{ score: string; probability: number }>;
  notes: string[];
  trainingCompetitions: Array<{ name: string; matches: number }>;
  homeSignals: FirstHalfTeamSignals;
  awaySignals: FirstHalfTeamSignals;
};
export type FirstHalfTeamSignals = {
  matches: number;
  homeMatches: number;
  awayMatches: number;
  attackIndex: number;
  defensiveVulnerability: number;
  recentFirstHalfScored: number;
  recentFirstHalfAllowed: number;
  recentFirstHalfOver05: number;
  recentSample: number;
};
export type FirstHalfBacktest = {
  evaluated: number;
  over05: { predicted: number; observed: number; brier: number } | null;
  over15: { predicted: number; observed: number; brier: number } | null;
};


const DAY = 86400000;
const TRAINING_DAYS = 1461; // Up to four seasons, all data strictly before kickoff
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const decay = (days: number) => Math.pow(0.5, days / 210);
const CONTINENTAL_WOMEN = new Set(["UEFA Women's Champions League"]);
export const isContinentalMen = (fixture: Fixture) =>
  ["uefa.champions", "uefa.europa", "uefa.europa.conf"].includes(fixture.leagueId) || CONTINENTAL_MEN.has(fixture.league);
const isContinentalWomen = (fixture: Fixture) =>
  fixture.leagueId === "uefa.wchampions" || CONTINENTAL_WOMEN.has(fixture.league);

/** Conservative exact aliases, never fuzzy matching unrelated clubs. */
export function clubHalfTimeKey(name: string): string {
  const raw = formTeamKey(name).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g," ").trim();
  const aliases: Record<string,string> = {
    "bayern munich":"bayern", "bayern munchen":"bayern", "bayern":"bayern",
    "fc bayern munich":"bayern", "fc bayern munchen":"bayern",
    "internazionale":"inter", "inter milan":"inter", "inter":"inter",
    "paris saintgermain":"psg", "paris saint germain":"psg", "paris sg":"psg", "psg":"psg",
    "sporting lisbon":"sporting", "sporting cp":"sporting", "sporting":"sporting",
    "sl benfica":"benfica", "benfica lisbon":"benfica", "benfica":"benfica",
    "porto":"porto", "porto fc":"porto",
    "psv eindhoven":"psv", "psv":"psv",
    "ajax amsterdam":"ajax", "ajax":"ajax",
    "feyenoord rotterdam":"feyenoord","feyenoord":"feyenoord",
    "club brugge kv":"club brugge", "club brugge":"club brugge",
    "celtic glasgow":"celtic", "celtic":"celtic",
    "galatasaray sk":"galatasaray", "galatasaray":"galatasaray",
    "olympiacos piraeus":"olympiacos", "olympiacos":"olympiacos",
    "rb leipzig":"leipzig", "leipzig":"leipzig",
    "real madrid cf":"real madrid", "real madrid":"real madrid",
    "barcelona":"barcelona", "fc barcelona":"barcelona",
    "ac monza":"monza", "monza":"monza",
  };
  return aliases[raw] ?? raw;
}
export function validFirstHalfScore(match: HistoricalMatch): boolean {
  const h = match.halfTimeHomeGoals, a = match.halfTimeAwayGoals;
  return Number.isInteger(h) && Number.isInteger(a) &&
    h! >= 0 && a! >= 0 && h! <= match.homeGoals && a! <= match.awayGoals;
}
type Weighted = HistoricalMatch & { weight: number; homeKey: string; awayKey: string };
function firstHalfHistory(matches: HistoricalMatch[], fixture: Fixture): Weighted[] {
  const cutoff = Date.parse(fixture.kickoff.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(cutoff)) return [];
  const men = isContinentalMen(fixture);
  const women = isContinentalWomen(fixture);
  return matches.flatMap((match) => {
    const date = Date.parse(match.date);
    if (!Number.isFinite(date) || date >= cutoff || date < cutoff - TRAINING_DAYS*DAY ||
      !validFirstHalfScore(match)) return [];
    const allowed = men ?
      (DOMESTIC_MEN.has(match.competition) || CONTINENTAL_MEN.has(match.competition)) :
      women ? CONTINENTAL_WOMEN.has(match.competition) :
      match.competition === fixture.league;
    if (!allowed) return [];
    const homeKey = clubHalfTimeKey(match.homeTeam);
    const awayKey = clubHalfTimeKey(match.awayTeam);
    if (!homeKey || !awayKey || homeKey === awayKey) return [];
    const sourceWeight = men && CONTINENTAL_MEN.has(match.competition) ? 1.3 : 1;
    return [{ ...match, homeKey, awayKey, weight: decay((cutoff-date)/DAY)*sourceWeight }];
  });
}
const totalWeight = (rows: Weighted[]) => rows.reduce((n,m) => n+m.weight,0);
function leagueRates(training: Weighted[]) {
  const groups = new Map<string, Weighted[]>();
  for (const m of training) {
    const rows = groups.get(m.competition) ?? [];
    rows.push(m);
    groups.set(m.competition, rows);
  }
  const all = totalWeight(training);
  const pooledHome = training.reduce((s,m)=>s+m.weight*m.halfTimeHomeGoals!,0)/all;
  const pooledAway = training.reduce((s,m)=>s+m.weight*m.halfTimeAwayGoals!,0)/all;
  const rates = new Map<string,{ home:number;away:number }>();
  for(const [name,rows] of groups) {
    const w=totalWeight(rows);
    const prior=10;
    rates.set(name,{
      home:(rows.reduce((s,m)=>s+m.weight*m.halfTimeHomeGoals!,0)+prior*pooledHome)/(w+prior),
      away:(rows.reduce((s,m)=>s+m.weight*m.halfTimeAwayGoals!,0)+prior*pooledAway)/(w+prior),
    });
  }
  return { rates, pooledHome, pooledAway, groups };
}
function poisson(mean:number, goals:number):number {
  let p=Math.exp(-mean);
  for(let k=1;k<=goals;k++)p*=mean/k;
  return p;
}
type Strength = { attack:number; defense:number; matches:number; homeMatches:number; awayMatches:number;
  signals:FirstHalfTeamSignals };
function teamStrength(
  key:string, venue:"home"|"away", training:Weighted[],
  rates:Map<string,{home:number;away:number}>, naive:Map<string,{attack:number;defense:number}>,
):Strength {
  const rows = training.filter(m=>m.homeKey===key || m.awayKey===key)
    .sort((a,b)=>b.date.localeCompare(a.date));
  const prior=5;
  let weighted=0, forSum=prior, againstSum=prior;
  let homeMatches=0, awayMatches=0;
  for(const m of rows){
    const isHome=m.homeKey===key;
    if(isHome)homeMatches++;else awayMatches++;
    const multiplier=(isHome ? "home":"away")===venue ? 1:.48;
    const w=m.weight*multiplier;
    const league=rates.get(m.competition)!;
    const forBaseline=isHome?league.home:league.away;
    const againstBaseline=isHome?league.away:league.home;
    const opponent=isHome?m.awayKey:m.homeKey;
    const opponentDefense=clamp(naive.get(opponent)?.defense ?? 1,.65,1.6);
    const opponentAttack=clamp(naive.get(opponent)?.attack ?? 1,.65,1.6);
    weighted+=w;
    forSum+=w*(isHome?m.halfTimeHomeGoals!:m.halfTimeAwayGoals!)/(Math.max(.08,forBaseline)*opponentDefense);
    againstSum+=w*(isHome?m.halfTimeAwayGoals!:m.halfTimeHomeGoals!)/(Math.max(.08,againstBaseline)*opponentAttack);
  }
  const recent=rows.slice(0,10);
  const recentScored=recent.reduce((s,m)=>s+(m.homeKey===key?m.halfTimeHomeGoals!:m.halfTimeAwayGoals!),0);
  const recentAllowed=recent.reduce((s,m)=>s+(m.homeKey===key?m.halfTimeAwayGoals!:m.halfTimeHomeGoals!),0);
  const signals:FirstHalfTeamSignals={
    matches:rows.length,homeMatches,awayMatches,
    attackIndex:clamp(forSum/(prior+weighted),.45,2.5),
    defensiveVulnerability:clamp(againstSum/(prior+weighted),.45,2.5),
    recentFirstHalfScored:recent.length?recentScored/recent.length:0,
    recentFirstHalfAllowed:recent.length?recentAllowed/recent.length:0,
    recentFirstHalfOver05:recent.filter(m=>(m.halfTimeHomeGoals!+m.halfTimeAwayGoals!)>=1).length,
    recentSample:recent.length,
  };
  return {attack:signals.attackIndex,defense:signals.defensiveVulnerability,
    matches:rows.length,homeMatches,awayMatches,signals};
}

/** Diagnostic uses the same cross-competition training pool as the actual model. */
export function firstHalfCoverage(matches:HistoricalMatch[], fixture:Fixture) {
  const training=firstHalfHistory(matches,fixture);
  const home=clubHalfTimeKey(fixture.home.name), away=clubHalfTimeKey(fixture.away.name);
  const cutoff=Date.parse(fixture.kickoff.slice(0,10)+"T00:00:00Z");
  const earlierMatches=matches.filter(m=>
    m.competition===fixture.league && Date.parse(m.date)<cutoff &&
    Date.parse(m.date)>=cutoff-TRAINING_DAYS*DAY).length;
  const counts=[...new Set(training.map(m=>m.competition))].map(name=>({
    name,matches:training.filter(m=>m.competition===name).length,
  })).sort((a,b)=>b.matches-a.matches);
  return {
    competition:fixture.league,earlierMatches,validHalfTime:training.length,
    homeMatches:training.filter(m=>m.homeKey===home||m.awayKey===home).length,
    awayMatches:training.filter(m=>m.homeKey===away||m.awayKey===away).length,
    earliestDate:training.length?training.reduce((v,m)=>m.date<v?m.date:v,training[0].date):null,
    source:counts.length?counts.map(c=>c.name).join(", "):"Missing verified 1H scores",
    competitions:counts,
  };
}

/**
 * Multi-competition first-half goals model. For Champions League fixtures
 * domestic results supply the attack/defense evidence. Per-league goals are
 * normalized to their own league baseline, then home/away splits, recency,
 * and opponent strength affect the estimates. ESPN HT-scored UEFA matches
 * contribute only when they contain reconciled real first-half scores.
 * Women's fixtures are strictly isolated from men's data.
 */
export function estimateFirstHalf(matches:HistoricalMatch[], fixture:Fixture):FirstHalfForecast|null {
  const training=firstHalfHistory(matches,fixture);
  const hKey=clubHalfTimeKey(fixture.home.name), aKey=clubHalfTimeKey(fixture.away.name);
  if(!hKey||!aKey||hKey===aKey||training.length<60)return null;
  const effective=totalWeight(training);
  if(effective<18)return null;
  const {rates,pooledHome,pooledAway,groups}=leagueRates(training);
  if(pooledHome<=.05||pooledAway<=.05)return null;
  // Opponent strengths from league-normalized historical first-half results.
  const prelim=new Map<string,{n:number,scored:number,allowed:number}>();
  for(const m of training){
    const base=rates.get(m.competition)!;
    for(const [key,scored,allowed,forBase,againstBase] of [
      [m.homeKey,m.halfTimeHomeGoals!,m.halfTimeAwayGoals!,base.home,base.away],
      [m.awayKey,m.halfTimeAwayGoals!,m.halfTimeHomeGoals!,base.away,base.home],
    ] as Array<[string,number,number,number,number]>){
      const stat=prelim.get(key)??{n:0,scored:0,allowed:0};
      stat.n+=m.weight;
      stat.scored+=m.weight*scored/Math.max(.08,forBase);
      stat.allowed+=m.weight*allowed/Math.max(.08,againstBase);
      prelim.set(key,stat);
    }
  }
  const naive=new Map([...prelim].map(([key,s])=>[key,{
    attack:clamp((5+s.scored)/(5+s.n),.5,2),
    defense:clamp((5+s.allowed)/(5+s.n),.5,2),
  }]));
  const home=teamStrength(hKey,"home",training,rates,naive);
  const away=teamStrength(aKey,"away",training,rates,naive);
  if(home.matches<4||away.matches<4)return null;
  const league=rates.get(fixture.league);
  const continental=isContinentalMen(fixture)||isContinentalWomen(fixture);
  // UCL venue scoring prior blends pooled domestic with available real UCL
  // history, but never uses full-time scores as a proxy.
  const european=training.filter(m=>m.competition===fixture.league);
  const europeW=totalWeight(european);
  const europeHome=europeW?
    european.reduce((s,m)=>s+m.weight*m.halfTimeHomeGoals!,0)/europeW:pooledHome;
  const europeAway=europeW?
    european.reduce((s,m)=>s+m.weight*m.halfTimeAwayGoals!,0)/europeW:pooledAway;
  const mix=continental?Math.min(.35,europeW/(europeW+90)) : 0;
  const baseHome=continental?pooledHome*(1-mix)+europeHome*mix:(league?.home??pooledHome);
  const baseAway=continental?pooledAway*(1-mix)+europeAway*mix:(league?.away??pooledAway);
  const expectedHomeGoals=clamp(baseHome*home.attack*away.defense,.08,2.6);
  const expectedAwayGoals=clamp(baseAway*away.attack*home.defense,.06,2.4);
  const total=expectedHomeGoals+expectedAwayGoals;
  const pOver05=1-Math.exp(-total);
  const pOver15=1-Math.exp(-total)*(1+total);
  const pDraw=Array.from({length:11},(_,g)=>poisson(expectedHomeGoals,g)*poisson(expectedAwayGoals,g))
    .reduce((a,b)=>a+b,0);
  const scores=Array.from({length:5},(_,h)=>Array.from({length:5},(_,a)=>({
    score:h+"–"+a, probability:poisson(expectedHomeGoals,h)*poisson(expectedAwayGoals,a),
  }))).flat().sort((a,b)=>b.probability-a.probability).slice(0,4);
  const quality=home.matches>=14&&away.matches>=14&&effective>=80 &&
    (!continental || europeW>=25)?"good":"limited";
  const trainingCompetitions=[...groups].map(([name,rows])=>({name,matches:rows.length}))
    .sort((a,b)=>b.matches-a.matches);
  return {
    modelVersion:"migo-first-half-cross-league-v2",quality,
    historicalMatches:training.length,effectiveMatches:effective,
    homeTeamMatches:home.matches,awayTeamMatches:away.matches,
    expectedHomeGoals,expectedAwayGoals,
    homeSignals:home.signals,awaySignals:away.signals,trainingCompetitions,
    markets:[
      {key:"first-half-over-0.5",label:"1H Over 0.5 goals",probability:pOver05},
      {key:"first-half-over-1.5",label:"1H Over 1.5 goals",probability:pOver15},
      {key:"home-first-half-goal",label:fixture.home.shortName+" scores in 1H",
       probability:1-Math.exp(-expectedHomeGoals)},
      {key:"away-first-half-goal",label:fixture.away.shortName+" scores in 1H",
       probability:1-Math.exp(-expectedAwayGoals)},
      {key:"half-time-draw",label:"Half-time draw",probability:pDraw},
    ],
    halfTimeScores:scores,
    notes:[
      "Domestic and verified European halftime records; "+home.matches+" "+fixture.home.shortName+
        " and "+away.matches+" "+fixture.away.shortName+" earlier matches.",
      "Opponent-adjusted first-half attack and goals conceded; venue, 210-day recency decay, league baselines.",
      "Experimental, not yet calibrated; no first-half bookmaker prices. UEFA evidence may be sparse.",
    ],
  };
}

/** Expensive by design: explicitly walk forward in time without score leakage. */
export function backtestFirstHalf(
  matches: HistoricalMatch[], competition: string, maxFixtures = 250,
): FirstHalfBacktest {
  const rows = matches.filter((match) => match.competition === competition && validFirstHalfScore(match))
    .sort((a, b) => a.date.localeCompare(b.date));
  const evaluated: Array<{ p05: number; p15: number; y05: number; y15: number }> = [];
  for (const match of rows.slice(-Math.max(1, Math.min(500, maxFixtures)))) {
    const fixture: Fixture = {
      id: match.id, kickoff: match.date, league: match.competition,
      leagueId: "eng.1", status: "scheduled", statusLabel: "Historical",
      home: { id: "h", name: match.homeTeam, shortName: match.homeTeam, abbreviation: "H" },
      away: { id: "a", name: match.awayTeam, shortName: match.awayTeam, abbreviation: "A" },
      source: "ESPN", sourceUpdatedAt: match.date,
    };
    const forecast = estimateFirstHalf(rows, fixture);
    if (!forecast) continue;
    const market = (key: FirstHalfMarketKey) => forecast.markets.find((m) => m.key === key)!.probability;
    const goals = match.halfTimeHomeGoals! + match.halfTimeAwayGoals!;
    evaluated.push({ p05: market("first-half-over-0.5"), p15: market("first-half-over-1.5"),
      y05: Number(goals >= 1), y15: Number(goals >= 2) });
  }
  const calc = (p: "p05" | "p15", y: "y05" | "y15") => evaluated.length ? {
    predicted: evaluated.reduce((s, m) => s + m[p], 0) / evaluated.length,
    observed: evaluated.reduce((s, m) => s + m[y], 0) / evaluated.length,
    brier: evaluated.reduce((s, m) => s + (m[p] - m[y]) ** 2, 0) / evaluated.length,
  } : null;
  return { evaluated: evaluated.length, over05: calc("p05", "y05"), over15: calc("p15", "y15") };
}
