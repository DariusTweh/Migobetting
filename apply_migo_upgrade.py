#!/usr/bin/env python3
"""Apply MIGO local-first UWCL/MLS historical & parlay upgrade in repository root.

Never deletes existing files. Validates source markers before writing changes.
"""
from pathlib import Path
import sys

root = Path.cwd()
base = Path(__file__).resolve().parent
for path in ("package.json", "lib/history.ts", "components/backtest-lab.tsx", "lib/leagues.ts"):
    if not (root / path).is_file():
        sys.exit(f"Run from the root of the Migobetting repository; missing {path}")

changes = {}

def replace(path: str, old: str, new: str):
    text = changes.get(path, (root / path).read_text(encoding="utf-8"))
    if new in text:
        return
    if text.count(old) != 1:
        sys.exit(f"Cannot safely patch {path}: expected marker not found exactly once. No files were changed.")
    changes[path] = text.replace(old, new, 1)

replace("lib/types.ts", 'export type LeagueId = "eng.1" | "esp.1" | "ger.1" | "ita.1" | "fra.1" | "uefa.champions";',
    'export type LeagueId = "eng.1" | "esp.1" | "ger.1" | "ita.1" | "fra.1" | "uefa.champions" | "uefa.wchampions" | "usa.1";')
replace("lib/leagues.ts", '  { id: "uefa.champions", name: "Champions League", short: "UCL" },',
    '  { id: "uefa.champions", name: "Champions League", short: "UCL" },\n  { id: "uefa.wchampions", name: "UEFA Women\'s Champions League", short: "UWCL" },\n  { id: "usa.1", name: "Major League Soccer", short: "MLS" },')

# Make the history replay respect dates, not just individual fixtures. All
# fixtures played on one day are predicted before any result from that day is applied.
path = "lib/history.ts"
replace(path,
    '  let excludedWarmup = 0;\n  const splitIndex =',
    '''  let excludedWarmup = 0;
  let lastDay = "";
  const pending: HistoricalMatch[] = [];
  function commitHistory(match: HistoricalMatch) {
    const homeKey = `${match.competition}:${normalizeTeamName(match.homeTeam)}`;
    const awayKey = `${match.competition}:${normalizeTeamName(match.awayTeam)}`;
    const homeStats = stats.get(homeKey) ?? emptyStats();
    const awayStats = stats.get(awayKey) ?? emptyStats();
    const league = leagueHistory.get(match.competition) ?? { homeGoals: 0, awayGoals: 0, matches: 0 };
    homeStats.played += 1; homeStats.goalsFor += match.homeGoals; homeStats.goalsAgainst += match.awayGoals; homeStats.homePlayed += 1; homeStats.homeFor += match.homeGoals; homeStats.homeAgainst += match.awayGoals;
    awayStats.played += 1; awayStats.goalsFor += match.awayGoals; awayStats.goalsAgainst += match.homeGoals; awayStats.awayPlayed += 1; awayStats.awayFor += match.awayGoals; awayStats.awayAgainst += match.homeGoals;
    stats.set(homeKey, homeStats); stats.set(awayKey, awayStats);
    league.homeGoals += match.homeGoals; league.awayGoals += match.awayGoals; league.matches += 1;
    leagueHistory.set(match.competition, league);
    if (match.lineup) {
      priorLineups.set(homeKey, match.lineup.home.starters.map((player) => player.id));
      priorLineups.set(awayKey, match.lineup.away.starters.map((player) => player.id));
    }
  }
  function flushDay() { pending.forEach(commitHistory); pending.length = 0; }
  const splitIndex =''')
replace(path,
    '  sorted.forEach((match, matchIndex) => {\n    const homeKey =',
    '''  sorted.forEach((match, matchIndex) => {
    const day = match.date.slice(0, 10);
    if (lastDay && day !== lastDay) flushDay();
    lastDay = day;
    const homeKey =''')
start = '''    homeStats.played += 1; homeStats.goalsFor += match.homeGoals; homeStats.goalsAgainst += match.awayGoals; homeStats.homePlayed += 1; homeStats.homeFor += match.homeGoals; homeStats.homeAgainst += match.awayGoals;
    awayStats.played += 1; awayStats.goalsFor += match.awayGoals; awayStats.goalsAgainst += match.homeGoals; awayStats.awayPlayed += 1; awayStats.awayFor += match.awayGoals; awayStats.awayAgainst += match.homeGoals;
    stats.set(homeKey, homeStats); stats.set(awayKey, awayStats);
    league.homeGoals += match.homeGoals; league.awayGoals += match.awayGoals; league.matches += 1;
    leagueHistory.set(match.competition, league);
    if (match.lineup) {
      priorLineups.set(homeKey, match.lineup.home.starters.map((player) => player.id));
      priorLineups.set(awayKey, match.lineup.away.starters.map((player) => player.id));
    }
  });

  const qualified'''
replace(path, start, '''    pending.push(match);
  });
  flushDay();

  const qualified''')

path = "components/backtest-lab.tsx"
replace(path,
    'import { PageHeader, Panel, PanelHead } from "./ui";',
    '''import { PageHeader, Panel, PanelHead } from "./ui";
import { HistoricalParlayLab } from "./historical-parlay-lab";
import { ESPN_HISTORY_COMPETITIONS, type EspnHistoryLeague } from "@/lib/espn-history";''')
replace(path,
    '  const [market, setMarket] = useState<BacktestMarket>("best-pick");',
    '''  const [espnLeague, setEspnLeague] = useState<EspnHistoryLeague>("usa.1");
  const [espnYear, setEspnYear] = useState(2025);
  const [espnInfo, setEspnInfo] = useState("");
  const [market, setMarket] = useState<BacktestMarket>("best-pick");''')
replace(path,
    '  async function importPreset() {',
    '''  async function importEspnSeason() {
    setLoading(true); setEspnInfo("Importing ESPN historical final scores; odds will remain unavailable…");
    try {
      const response = await fetch(`/api/historical/espn?league=${encodeURIComponent(espnLeague)}&year=${espnYear}`);
      const payload = await response.json() as { matches?: HistoricalMatch[]; errors?: string[]; warnings?: string[]; error?: string };
      if (!response.ok || !payload.matches) throw new Error(payload.error ?? "ESPN historical import failed");
      const imported = await importHistoricalMatches(payload.matches);
      const all = await getHistoricalMatches();
      setMatches(all); setResult(null); setSeason("all");
      const name = ESPN_HISTORY_COMPETITIONS[espnLeague];
      setCompetition(name);
      setEspnInfo(`${imported.inserted} new ${name} matches, ${imported.updated} refreshed · ${payload.errors?.length ?? 0} monthly fetch errors. No historical odds imported.`);
      await evaluate(all.filter((match) => match.competition === name));
    } catch (error) {
      setEspnInfo(error instanceof Error ? error.message : "ESPN historical import failed");
    } finally { setLoading(false); }
  }

  async function importPreset() {''')
replace(path,
    '    {result ? <BacktestResults result={result} /> : <Panel className="results-placeholder">',
    '''    <Panel>
      <PanelHead title="Test MLS and UEFA Women's Champions League" meta="Import actual completed matches from ESPN by calendar year; no API key required" />
      <div className="import-controls">
        <div className="field"><label>Competition</label><select className="select" value={espnLeague} onChange={(event) => setEspnLeague(event.target.value as EspnHistoryLeague)}>
          <option value="usa.1">MLS</option><option value="uefa.wchampions">UEFA Women's Champions League</option>
        </select></div>
        <div className="field"><label>Calendar year</label><select className="select" value={espnYear} onChange={(event) => setEspnYear(Number(event.target.value))}>
          {Array.from({ length: Math.max(1, new Date().getFullYear() - 2022) }, (_, n) => 2023 + n).map((year) => <option key={year} value={year}>{year}</option>)}
        </select></div>
        <button className="button" onClick={importEspnSeason} disabled={loading || running}><DatabaseZap size={16} />Import and backtest</button>
      </div>
      <div className="lineup-explanation">{espnInfo || "Import multiple years to improve prior-match coverage. Women's UCL spans calendar years. Historical ESPN data adds completed results but does NOT include bookmaker odds, so price-based ROI remains unavailable for those fixtures."}</div>
    </Panel>
    {result ? <><BacktestResults result={result} /><HistoricalParlayLab result={result} matches={filtered} /></> : <Panel className="results-placeholder">''')

path = "README.md"
original = changes.get(path, (root / path).read_text(encoding="utf-8"))
addition = '''

## MLS, UWCL and historical parlays

MLS (`usa.1`) and UEFA Women's Champions League (`uefa.wchampions`) appear in live fixtures and the Simulation Lab. In Backtesting Lab, select either competition and a calendar year to import genuine completed ESPN match results without API credentials. Import multiple calendar years, especially for UEFA Women's Champions League. ESPN coverage is not guaranteed complete; extra-time and penalty events are conservatively excluded when identifiable, and historical pre-match odds are not provided.

The Historical Parlay Lab uses only the imported 1X2 and O/U 2.5 decimal prices where present. It forms one-selection-per-match daily cards from held-out predictions and can PASS entirely if odds or positive model edges are missing. These imported CSV prices have no independently verified publication timestamps: its reported returns are **hypothetical price-linked scenarios**, not verified executable profits. In particular, ESPN-only MLS and UWCL results cannot produce priced parlay returns without an independent market-odds source. A day-level barrier also prevents the model from learning an earlier match's result before predicting another fixture on that same date.
'''
if "## MLS, UWCL and historical parlays" not in original:
    changes[path] = original.rstrip() + addition

# Validate every patch marker before any modifications are written.
for p, content in changes.items():
    (root / p).write_text(content, encoding="utf-8")
for relative in (
    "lib/espn-history.ts", "lib/historical-parlays.ts",
    "app/api/historical/espn/route.ts", "components/historical-parlay-lab.tsx",
    "tests/espn-history.test.ts", "tests/historical-parlays.test.ts", "tests/history-day-leakage.test.ts",
):
    dest = root / relative
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.read_bytes() != (base / relative).read_bytes():
        sys.exit(f"Already exists with different contents: {relative}. Do not overwrite it automatically.")
    dest.write_bytes((base / relative).read_bytes())
print(f"MIGO upgrade applied to {root}. Changed {len(changes)} existing files; added 7 new files.")
print("Next: npm test && npm run build && git add -A && git commit -m 'Add MLS UWCL historical and parlay labs' && git push origin main")
