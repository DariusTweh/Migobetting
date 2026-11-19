"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DatabaseZap, FileUp, Play, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { clearHistoricalMatches, getHistoricalMatches, importHistoricalMatches, replaceSynchronizedHistory } from "@/lib/history-store";
import { parseHistoricalCsv, runHistoricalBacktest, type BacktestMarket, type BacktestResult, type HistoricalMatch } from "@/lib/history";
import { decimalToAmerican, formatAmerican } from "@/lib/odds";
import { PageHeader, Panel, PanelHead } from "./ui";

const PRESETS = [
  { id: "epl-2025", label: "Premier League 2025–26", season: "2025–26" },
  { id: "epl-2024", label: "Premier League 2024–25", season: "2024–25" },
  { id: "laliga-2025", label: "La Liga 2025–26", season: "2025–26" },
  { id: "bundesliga-2025", label: "Bundesliga 2025–26", season: "2025–26" },
  { id: "seriea-2025", label: "Serie A 2025–26", season: "2025–26" },
  { id: "ligue1-2025", label: "Ligue 1 2025–26", season: "2025–26" },
];
const ESPN_LEAGUES: Record<string, string> = {
  "Premier League": "eng.1",
  "La Liga": "esp.1",
  Bundesliga: "ger.1",
  "Serie A": "ita.1",
  "Ligue 1": "fra.1",
};
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;

export function BacktestLab() {
  const [matches, setMatches] = useState<HistoricalMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading local history…");
  const [preset, setPreset] = useState(PRESETS[0].id);
  const [market, setMarket] = useState<BacktestMarket>("best-pick");
  const [threshold, setThreshold] = useState(68);
  const [iterations, setIterations] = useState(10_000);
  const [seed, setSeed] = useState("migo-backtest-1");
  const [competition, setCompetition] = useState("all");
  const [season, setSeason] = useState("all");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [autoStatus, setAutoStatus] = useState<"syncing" | "testing" | "lineups" | "ready" | "error">("syncing");
  const initializationStarted = useRef(false);

  useEffect(() => {
    if (initializationStarted.current) return;
    initializationStarted.current = true;
    void initializeAutomatedLoop();
  }, []);
  const competitions = useMemo(() => [...new Set(matches.map((item) => item.competition))].sort(), [matches]);
  const seasons = useMemo(() => [...new Set(matches.map((item) => item.season))].sort(), [matches]);
  const filtered = useMemo(() => matches.filter((item) => (competition === "all" || item.competition === competition) && (season === "all" || item.season === season)), [matches, competition, season]);

  function evaluate(data: HistoricalMatch[], settings = { market, threshold: threshold / 100, iterations, seed }) {
    setRunning(true); setAutoStatus("testing"); setMessage(`Replaying ${data.length.toLocaleString()} fixtures chronologically…`);
    return new Promise<BacktestResult>((resolve) => window.setTimeout(() => {
      const next = runHistoricalBacktest(data, { ...settings, trainingFraction: 0.6 });
      setResult(next); setRunning(false); setAutoStatus("ready");
      setMessage(`Evaluation complete: ${next.evaluated.toLocaleString()} past matches predicted first, then checked against the real final scores.`);
      resolve(next);
    }, 30));
  }

  async function syncCoreHistory() {
    setLoading(true); setAutoStatus("syncing"); setMessage("MIGO is downloading five domestic leagues across three completed seasons…");
    const response = await fetch("/api/historical?bundle=core");
    if (!response.ok) throw new Error((await response.json()).error ?? "Automatic historical sync failed");
    const bundle = await response.json() as { datasets: Array<{ csv: string; season: string; url: string }>; errors: string[] };
    const normalized = bundle.datasets.flatMap((dataset) => parseHistoricalCsv(dataset.csv, { season: dataset.season, source: dataset.url }).matches);
    const imported = await replaceSynchronizedHistory(normalized);
    const all = await getHistoricalMatches(); setMatches(all); setLoading(false);
    setMessage(`${all.length.toLocaleString()} authentic matches ready · ${imported.inserted.toLocaleString()} new · ${bundle.errors.length} provider errors.`);
    return all;
  }

  async function initializeAutomatedLoop() {
    try {
      const existing = await getHistoricalMatches();
      let data = existing;
      try {
        data = await syncCoreHistory();
      } catch (error) {
        if (!existing.length) throw error;
        setLoading(false);
        setMessage(`Using ${existing.length.toLocaleString()} saved matches because the data provider could not be reached.`);
      }
      setMatches(data); setLoading(false);
      const settings = { market: "best-pick" as const, threshold: 0.68, iterations: 10_000, seed: "migo-auto-baseline-v1" };
      const enriched = await enrichHistoricalLineups(data);
      await evaluate(enriched, settings);
    } catch (error) {
      setLoading(false); setAutoStatus("error"); setMessage(error instanceof Error ? error.message : "Automatic historical loop failed");
    }
  }

  async function syncAndRerun() {
    try {
      const data = await syncCoreHistory();
      const enriched = await enrichHistoricalLineups(data);
      await evaluate(enriched);
    } catch (error) {
      setLoading(false); setAutoStatus("error"); setMessage(error instanceof Error ? error.message : "Automatic historical sync failed");
    }
  }

  async function enrichHistoricalLineups(data: HistoricalMatch[]) {
    const groups = Object.entries(ESPN_LEAGUES).map(([competitionName, leagueId]) => ({
      competitionName,
      leagueId,
      matches: data.filter((item) => item.competition === competitionName && item.season === "2025-26").sort((a, b) => a.date.localeCompare(b.date)).slice(-80).filter((item) => !item.lineup),
    })).filter((group) => group.matches.length);
    const missingCount = groups.reduce((sum, group) => sum + group.matches.length, 0);
    if (!missingCount) return data;
    setAutoStatus("lineups"); setLoading(true);
    const additions = new Map<string, NonNullable<HistoricalMatch["lineup"]>>();
    let processed = 0;
    await Promise.all(groups.map(async (group) => {
      for (let offset = 0; offset < group.matches.length; offset += 12) {
        const batch = group.matches.slice(offset, offset + 12);
        const response = await fetch("/api/historical/lineups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leagueId: group.leagueId, fixtures: batch.map((item) => ({ id: item.id, date: item.date, homeTeam: item.homeTeam, awayTeam: item.awayTeam })) }) });
        processed += batch.length;
        setMessage(`Adding real historical starting XIs across five leagues ${Math.min(processed, missingCount)}/${missingCount}…`);
        if (!response.ok) continue;
        const payload = await response.json() as { lineups: Array<{ matchId: string; lineup: NonNullable<HistoricalMatch["lineup"]> }> };
        payload.lineups.forEach((item) => additions.set(item.matchId, item.lineup));
      }
    }));
    if (!additions.size) { setLoading(false); setAutoStatus("ready"); setMessage("The score test is complete. No additional historical starting lineups were available to add."); return data; }
    const enriched = data.map((item) => additions.has(item.id) ? { ...item, lineup: additions.get(item.id) } : item);
    await importHistoricalMatches(enriched.filter((item) => additions.has(item.id)));
    setMatches(enriched); setLoading(false);
    setMessage(`${additions.size} historical matches enriched with real ESPN starting XIs; rerunning model comparison…`);
    return enriched;
  }

  async function importPreset() {
    setLoading(true); setMessage("Downloading documented provider CSV…");
    try {
      const selected = PRESETS.find((item) => item.id === preset)!;
      const response = await fetch(`/api/historical?preset=${preset}`);
      if (!response.ok) throw new Error((await response.json()).error ?? "Import failed");
      const parsed = parseHistoricalCsv(await response.text(), { season: response.headers.get("X-MIGO-Season") ?? selected.season, source: response.headers.get("X-MIGO-Source") ?? "football-data.co.uk" });
      const imported = await importHistoricalMatches(parsed.matches);
      const all = await getHistoricalMatches(); setMatches(all); setResult(null);
      setMessage(`${imported.inserted} inserted, ${imported.updated} existing fixtures refreshed, ${parsed.rejected} rows rejected.`);
      evaluate(all);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Historical import failed"); }
    finally { setLoading(false); }
  }
  async function importFile(file: File) {
    setLoading(true);
    try {
      const parsed = parseHistoricalCsv(await file.text(), { season: "Custom import", source: `Local file: ${file.name}` });
      const imported = await importHistoricalMatches(parsed.matches); const all = await getHistoricalMatches(); setMatches(all); setResult(null);
      setMessage(`${imported.inserted} inserted, ${imported.updated} idempotently refreshed, ${parsed.rejected} rejected.`);
      evaluate(all);
    } catch (error) { setMessage(error instanceof Error ? error.message : "CSV import failed"); }
    finally { setLoading(false); }
  }
  function run() {
    if (!filtered.length) return;
    setResult(null); evaluate(filtered);
  }
  async function clear() {
    if (!window.confirm("Remove all locally imported historical fixtures?")) return;
    await clearHistoricalMatches(); setMatches([]); setResult(null); setMessage("Local historical store cleared.");
  }

  return <>
    <PageHeader eyebrow="Past-match reality check" title="Did MIGO actually get the picks right?" description="MIGO goes back through old matches, makes a prediction using only information available before each kickoff, then reveals the final score and marks the pick won or lost." />
    <div className={`automation-banner automation-${autoStatus}`}><div><span className={`status-dot ${autoStatus === "ready" ? "live" : ""}`} /><div><strong>{autoStatus === "syncing" ? "Getting real historical matches" : autoStatus === "testing" ? "Making and grading old predictions" : autoStatus === "lineups" ? "Adding real historical starting lineups" : autoStatus === "ready" ? "Historical test is up to date" : "Historical test needs attention"}</strong><p>{message}</p></div></div><button className="button" onClick={syncAndRerun} disabled={loading || running}><RefreshCw size={15} className={loading || running ? "spin" : ""} />Update data and test again</button></div>

    <Panel className="simple-test-panel">
      <PanelHead title="Choose the test" meta={`${matches.length.toLocaleString()} real matches are loaded locally. Automatic mode lets MIGO choose a different market for every match.`} />
      <div className="simple-test-controls">
        <div className="field"><label>League</label><select className="select" value={competition} onChange={(event) => { setCompetition(event.target.value); setResult(null); }}><option value="all">All five leagues</option>{competitions.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="field"><label>Season</label><select className="select" value={season} onChange={(event) => { setSeason(event.target.value); setResult(null); }}><option value="all">All three seasons</option>{seasons.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="field"><label>Type of pick</label><select className="select" value={market} onChange={(event) => { setMarket(event.target.value as BacktestMarket); setResult(null); }}><option value="best-pick">Automatic — strongest pick</option><optgroup label="Match result"><option value="match-winner">Match winner (ML)</option><option value="double-chance">Best double chance</option></optgroup><optgroup label="Total goals"><option value="over-1.5">Over 1.5 goals</option><option value="under-1.5">Under 1.5 goals</option><option value="over-2.5">Over 2.5 goals</option><option value="under-2.5">Under 2.5 goals</option><option value="over-3.5">Over 3.5 goals</option><option value="under-3.5">Under 3.5 goals</option></optgroup><optgroup label="Both teams to score"><option value="btts-yes">BTTS Yes</option><option value="btts-no">BTTS No</option></optgroup></select></div>
        <div className="field"><label>Only count picks at or above</label><div className="percent-input"><input className="input" type="number" min="50" max="95" value={threshold} onChange={(event) => { setThreshold(Number(event.target.value)); setResult(null); }} /><span>% confidence</span></div></div>
      </div>
      <div className="test-explainer"><div><b>1</b><span><strong>MIGO compares the markets</strong><small>Attack, defense, home/away scoring and prior matches set the probabilities.</small></span></div><div><b>2</b><span><strong>The strongest side is selected</strong><small>ML, double chance, totals, BTTS Yes/No—or PASS.</small></span></div><div><b>3</b><span><strong>The real score grades it</strong><small>Every recorded pick becomes WON or LOST.</small></span></div></div>
      <button className="button button-primary run-backtest" onClick={run} disabled={!filtered.length || running}><Play size={17} />{running ? "Testing old matches…" : "Run the historical test"}</button>
    </Panel>

    {result ? <BacktestResults result={result} /> : <Panel className="results-placeholder"><DatabaseZap size={34} /><strong>{running ? "Running the historical test…" : "Ready for a fresh historical test"}</strong><p>{running ? "MIGO is predicting old matches before revealing their final scores." : "Run the test to see predictions, real final scores, and WON/LOST results for these settings."}</p></Panel>}

    <details className="advanced-backtest">
      <summary>Advanced settings, data controls, and statistical diagnostics</summary>
      <div className="advanced-backtest-body">
        <div className="backtest-layout">
          <Panel><PanelHead title="Simulation settings" meta="More simulations reduce random sampling noise. They do not train MIGO or guarantee better predictions." /><div className="lab-form"><div className="form-grid"><div className="field"><label>Simulations per match</label><select className="select" value={iterations} onChange={(event) => { setIterations(Number(event.target.value)); setResult(null); }}><option value="10000">10,000</option><option value="50000">50,000</option></select></div><div className="field"><label>Reproducible random seed</label><input className="input" value={seed} onChange={(event) => { setSeed(event.target.value); setResult(null); }} /></div></div></div></Panel>
          <Panel><PanelHead title="How cheating is prevented" meta="The prediction is frozen before MIGO sees the answer." /><div className="control-checks"><Check text="Matches are processed oldest to newest." /><Check text="Only matches played earlier can affect the prediction." /><Check text="Each team needs at least five earlier matches." /><Check text="The final score stays hidden until after prediction." /><Check text="The newest 40% of matches are reserved for the final test." /></div></Panel>
        </div>
        <Panel><PanelHead title="Optional manual data controls" meta="The automatic sync already handles this." /><div className="import-controls"><div className="field"><label>Single provider dataset</label><select className="select" value={preset} onChange={(event) => setPreset(event.target.value)}>{PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><button className="button" disabled={loading} onClick={importPreset}><DatabaseZap size={16} />Import one season</button><label className="button file-button"><FileUp size={16} />Import your own CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} /></label><button className="button button-danger" onClick={clear} disabled={!matches.length}><RotateCcw size={15} />Delete local history</button></div></Panel>
      </div>
    </details>
  </>;
}

function BacktestResults({ result }: { result: BacktestResult }) {
  const picks = result.predictions.filter((item) => item.selected !== null);
  const visiblePicks = picks.slice().reverse().slice(0, 100);
  const unitResult = result.profit === null ? null : `${result.profit >= 0 ? "+" : ""}${result.profit.toFixed(2)} units`;
  const threshold = Math.round(result.config.threshold * 100);
  const marketLabels: Record<BacktestMarket, string> = { "best-pick": "automatic strongest pick", "match-winner": "match winner", "double-chance": "best double chance", "over-1.5": "Over 1.5 goals", "under-1.5": "Under 1.5 goals", "over-2.5": "Over 2.5 goals", "under-2.5": "Under 2.5 goals", "over-3.5": "Over 3.5 goals", "under-3.5": "Under 3.5 goals", "btts-yes": "BTTS Yes", "btts-no": "BTTS No", btts: "BTTS Yes" };
  const marketLabel = marketLabels[result.config.market];
  return <div className="stack backtest-results">
    <Panel className="plain-summary"><div className="plain-summary-copy"><span className="eyebrow">What happened · {marketLabel}</span><h2>MIGO made {result.qualified.toLocaleString()} picks. {result.correct.toLocaleString()} won and {result.incorrect.toLocaleString()} lost.</h2><p>It predicted {result.evaluated.toLocaleString()} later matches after learning team history from the older matches. A pick only counted when confidence reached {threshold}%; everything else was a pass.</p></div><div className="plain-result-metrics"><div><span>Picks made</span><strong>{result.qualified.toLocaleString()}</strong></div><div><span>Won</span><strong className="result-win">{result.correct.toLocaleString()}</strong></div><div><span>Lost</span><strong className="result-loss">{result.incorrect.toLocaleString()}</strong></div><div><span>Accuracy</span><strong>{percent(result.hitRate)}</strong></div><div><span>Money result</span><strong className={result.profit !== null && result.profit >= 0 ? "result-win" : "result-loss"}>{unitResult ?? "No valid prices"}</strong><small>{result.roi === null ? "ROI hidden without matching odds" : `${percent(result.roi)} return at 1 unit per pick`}</small></div></div></Panel>

    {result.config.market === "best-pick" ? <Panel><PanelHead title="Markets MIGO chose automatically" meta="This shows which side had the highest model probability in each match. High confidence is not the same as betting value." /><div className="competition-table">{result.byMarket.map((item) => <div key={item.market}><strong>{item.market}</strong><span>{item.qualified} picks</span><span>{item.correct} won</span><b>{percent(item.hitRate)}</b></div>)}</div></Panel> : null}

    <Panel><PanelHead title="Every pick compared with the real final score" meta={`Showing ${visiblePicks.length} of ${picks.length} picks · newest first`} /><div className="result-ledger"><div className="result-ledger-head"><span>Date / match</span><span>MIGO picked</span><span>Confidence</span><span>Actual final score</span><span>Result</span><span>Price / P&L</span></div>{visiblePicks.map((pick) => <div className="result-ledger-row" key={pick.matchId}><div className="ledger-match"><small>{new Date(pick.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {pick.competition}</small><strong>{pick.homeTeam} vs {pick.awayTeam}</strong></div><div className="ledger-pick"><strong>{pick.selectedLabel}</strong></div><div className="ledger-confidence">{Math.round(pick.selectedProbability * 100)}%</div><div className="ledger-score"><strong>{pick.homeTeam} {pick.actualHomeGoals}–{pick.actualAwayGoals} {pick.awayTeam}</strong><small>{pick.actualOutcome === "home" ? `${pick.homeTeam} won` : pick.actualOutcome === "away" ? `${pick.awayTeam} won` : "Draw"}</small></div><div><span className={`result-badge ${pick.correct ? "won" : "lost"}`}>{pick.correct ? "WON" : "LOST"}</span></div><div className="ledger-money"><strong>{pick.oddsUsed ? formatAmerican(decimalToAmerican(pick.oddsUsed)) : "No price"}</strong><small>{pick.profit === undefined ? "P&L unavailable" : `${pick.profit >= 0 ? "+" : ""}${pick.profit.toFixed(2)} units`}</small></div></div>)}</div></Panel>

    <Panel><PanelHead title="Historical lineup coverage" meta="These are three information levels, not Team A, Team B, or Team C." /><div className="model-comparison plain-model-comparison">{result.modelComparison.map((item, index) => <div key={item.model} className={item.evaluated ? "available" : "unavailable"}><span className={`badge ${item.evaluated ? "badge-good" : "badge-insufficient"}`}>{item.evaluated ? `${item.evaluated} matches found` : "Not enough matched lineups"}</span><h3>{item.model}</h3><p>{item.note}</p><small>{index === 0 ? "Prediction error" : "Current match-history error on those matches"}: {item.brierScore?.toFixed(4) ?? "not available"} · lower is better</small></div>)}</div><div className="lineup-explanation"><strong>What this means:</strong> the real historical XIs are now being collected and tracked. MIGO does not apply a made-up player boost just to make this number look better; a lineup adjustment must beat the same match-history forecast on later matches first.</div></Panel>

    <details className="diagnostics"><summary>Show probability diagnostics</summary><div className="diagnostics-body"><div className="diagnostic-cards"><div><span>Probability error</span><strong>{result.brierScore?.toFixed(4) ?? "—"}</strong><p>Lower is better. Zero would mean perfect probabilities.</p></div><div><span>Surprise penalty</span><strong>{result.logLoss?.toFixed(4) ?? "—"}</strong><p>Penalizes MIGO more when it is confidently wrong.</p></div><div><span>Matches reserved for testing</span><strong>{result.evaluated}</strong><p>These matches were not used to choose settings.</p></div></div><div className="grid-2"><Panel><PanelHead title="Confidence versus actual wins" meta="If MIGO says 70%, roughly 70% should win over a large sample." /><div className="calibration-list">{result.calibration.map((item) => <div key={item.band}><span>{item.band}<small>{item.predictions} picks</small></span><i><em style={{ width: `${item.averageConfidence * 100}%` }} /><b style={{ left: `${item.hitRate * 100}%` }} /></i><strong>{item.predictions ? percent(item.hitRate) : "—"}</strong></div>)}</div></Panel><Panel><PanelHead title="Results by league" meta="Accuracy among picks that met the confidence requirement" /><div className="competition-table">{result.byCompetition.map((item) => <div key={item.competition}><strong>{item.competition}</strong><span>{item.evaluated} matches</span><span>{item.qualified} picks</span><b>{percent(item.hitRate)}</b></div>)}</div></Panel></div></div></details>
  </div>;
}

function Check({ text }: { text: string }) { return <div><ShieldCheck size={16} /><span>{text}</span></div>; }
