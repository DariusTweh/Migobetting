"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, FlaskConical, Play, RotateCcw, Save, ShieldAlert, WalletCards } from "lucide-react";
import { forecastFixture } from "@/lib/model";
import type { Fixture } from "@/lib/types";
import type { SimulationResult } from "@/lib/simulation";
import { simulateStrategy, type StrategyResult } from "@/lib/strategy";
import { Metric, Notice, PageHeader, Panel, PanelHead } from "./ui";
import { LiveMatchSimulator } from "./live-match-simulator";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const SAVED_KEY = "migo:simulations:v1";

export function SimulationLab({ fixtures, providerErrors, fetchedAt }: { fixtures: Fixture[]; providerErrors: string[]; fetchedAt: string }) {
  const [tab, setTab] = useState<"live" | "match" | "strategy">("live");
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get("view") === "probabilities") setTab("match");
    else if (search.get("view") === "strategy") setTab("strategy");
    else if (search.get("view") === "live") setTab("live");
  }, []);
  return <>
    <PageHeader eyebrow="Virtual match center" title="Simulation Lab" description="Watch a synthetic match unfold minute by minute, or inspect model probabilities and long-run strategy risk." />
    <div className="lab-tabs"><button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")}><Activity size={16} />Live-style match</button><button className={tab === "match" ? "active" : ""} onClick={() => setTab("match")}><FlaskConical size={16} />Probability lab</button><button className={tab === "strategy" ? "active" : ""} onClick={() => setTab("strategy")}><WalletCards size={16} />Strategy risk</button></div>
    {tab === "live" ? <LiveMatchSimulator fixtures={fixtures} /> : tab === "match" ? <MatchSimulator fixtures={fixtures} providerErrors={providerErrors} fetchedAt={fetchedAt} /> : <StrategySimulator />}
  </>;
}

function MatchSimulator({ fixtures, providerErrors, fetchedAt }: { fixtures: Fixture[]; providerErrors: string[]; fetchedAt: string }) {
  const [fixtureId, setFixtureId] = useState(fixtures[0]?.id ?? "");
  const [iterations, setIterations] = useState(50_000);
  const [seed, setSeed] = useState("migo-2026");
  const [homeMultiplier, setHomeMultiplier] = useState(1);
  const [awayMultiplier, setAwayMultiplier] = useState(1);
  const [homeAdvantage, setHomeAdvantage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [saved, setSaved] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const fixture = fixtures.find((item) => item.id === fixtureId) ?? fixtures[0];
  const forecast = useMemo(() => fixture ? forecastFixture(fixture) : null, [fixture]);
  const modified = homeMultiplier !== 1 || awayMultiplier !== 1 || homeAdvantage !== 0;
  const expectedHome = Math.max(0, (forecast?.expectedHomeGoals ?? 0) * homeMultiplier + homeAdvantage);
  const expectedAway = Math.max(0, (forecast?.expectedAwayGoals ?? 0) * awayMultiplier);
  useEffect(() => () => workerRef.current?.terminate(), []);

  function resetScenario() { setHomeMultiplier(1); setAwayMultiplier(1); setHomeAdvantage(0); setResult(null); }
  function run() {
    if (!fixture || !forecast || forecast.dataQuality === "insufficient") return;
    workerRef.current?.terminate();
    const worker = new Worker("/simulation-worker.js");
    workerRef.current = worker;
    setRunning(true); setProgress(0); setSaved(false);
    worker.onmessage = (event: MessageEvent<{ type: string; progress?: number; result?: SimulationResult }>) => {
      if (event.data.type === "progress") setProgress(event.data.progress ?? 0);
      if (event.data.type === "result" && event.data.result) { setResult(event.data.result); setRunning(false); setProgress(1); worker.terminate(); }
    };
    worker.onerror = () => { setRunning(false); worker.terminate(); };
    worker.postMessage({ homeTeam: fixture.home.shortName, awayTeam: fixture.away.shortName, expectedHomeGoals: expectedHome, expectedAwayGoals: expectedAway, iterations, seed, modelVersion: "migo-poisson-mc-0.2", scenario: modified ? "what-if" : "baseline" });
  }
  function save() {
    if (!result) return;
    let previous: SimulationResult[] = [];
    try { previous = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as SimulationResult[]; } catch { previous = []; }
    localStorage.setItem(SAVED_KEY, JSON.stringify([result, ...previous].slice(0, 20)));
    setSaved(true);
  }

  return <div className="stack">
    <div className="simulation-layout">
      <Panel>
        <PanelHead title="Simulation controls" meta="One seed reproduces the same sampled outcomes" />
        <div className="simulation-form">
          <div className="field"><label>Upcoming fixture</label><select className="select" value={fixtureId} onChange={(event) => { setFixtureId(event.target.value); setResult(null); }}>{fixtures.map((item) => <option key={item.id} value={item.id}>{item.home.shortName} vs {item.away.shortName} · {item.league}</option>)}</select></div>
          <div className="form-grid"><div className="field"><label>Simulation count</label><select className="select" value={iterations} onChange={(event) => setIterations(Number(event.target.value))}><option value="10000">10,000</option><option value="50000">50,000</option><option value="100000">100,000</option></select></div><div className="field"><label>Random seed</label><input className="input" value={seed} onChange={(event) => setSeed(event.target.value)} /></div></div>
          <div className="scenario-box"><div className="scenario-head"><div><strong>What-if assumptions</strong><span className={`badge ${modified ? "badge-limited" : "badge-good"}`}>{modified ? "Modified scenario" : "Baseline"}</span></div><button className="button button-small" onClick={resetScenario}><RotateCcw size={14} />Reset</button></div>
            <div className="form-grid"><RangeField label="Home attack multiplier" value={homeMultiplier} onChange={setHomeMultiplier} /><RangeField label="Away attack multiplier" value={awayMultiplier} onChange={setAwayMultiplier} /><RangeField label="Extra home-goal adjustment" value={homeAdvantage} onChange={setHomeAdvantage} min={-0.4} max={0.4} step={0.05} /></div>
            <div className="lambda-preview"><span>Simulation inputs</span><strong>{expectedHome.toFixed(2)} xG</strong><i>vs</i><strong>{expectedAway.toFixed(2)} xG</strong></div>
          </div>
          {forecast?.dataQuality === "insufficient" ? <div className="correlation-warning"><ShieldAlert size={16} />Missing season records. Simulation is disabled instead of substituting hidden assumptions.</div> : null}
          <button className="button button-primary" onClick={run} disabled={running || !fixture || forecast?.dataQuality === "insufficient"}><Play size={16} />{running ? `Simulating ${Math.round(progress * 100)}%` : "Run simulation"}</button>
          {running ? <div className="simulation-progress"><i style={{ width: `${progress * 100}%` }} /></div> : null}
        </div>
      </Panel>
      <Panel>
        <PanelHead title="Outcome summary" meta={result ? `${result.input.iterations.toLocaleString()} trials · seed ${result.input.seed}` : "Run a scenario to calculate"} action={result ? <button className="button button-small" onClick={save}><Save size={14} />{saved ? "Saved" : "Save locally"}</button> : undefined} />
        {result ? <div className="outcome-summary"><Outcome label={result.input.homeTeam} value={result.outcomes.home} tone="home" /><Outcome label="Draw" value={result.outcomes.draw} tone="draw" /><Outcome label={result.input.awayTeam} value={result.outcomes.away} tone="away" /><div className="consistency-check"><Activity size={16} /><span>Analytical Poisson check</span><strong>max Δ {(result.analytical.maximumDelta * 100).toFixed(2)}pp</strong></div></div> : <div className="empty-state"><FlaskConical size={32} /><strong>No simulation yet</strong>Select a fixture and run the deterministic engine.</div>}
      </Panel>
    </div>

    {result ? <>
      <div className="metrics-grid"><Metric label="Expected home goals" value={result.expectedGoals.home.toFixed(2)} sub="sample mean" /><Metric label="Expected away goals" value={result.expectedGoals.away.toFixed(2)} sub="sample mean" /><Metric label="Over 2.5" value={percent(result.totals.over25)} sub="same sampled outcomes" tone="green" /><Metric label="BTTS" value={percent(result.bothTeamsScore)} sub="both score ≥1" /></div>
      <div className="grid-2">
        <Panel><PanelHead title="Total-goal distribution" meta="Frequency across simulated matches" /><div className="histogram">{result.goalDistribution.slice(0, 9).map((item) => <div key={item.goals}><span style={{ height: `${Math.max(3, item.probability * 280)}px` }} /><b>{percent(item.probability)}</b><small>{item.goals}</small></div>)}</div></Panel>
        <Panel><PanelHead title="Most frequent scores" meta="Top five sampled scorelines" /><div className="score-frequency">{result.scorelines.map((item, index) => <div key={item.score}><span>{index + 1}</span><strong>{item.score}</strong><i><em style={{ width: `${item.probability / result.scorelines[0].probability * 100}%` }} /></i><b>{percent(item.probability)}</b></div>)}</div></Panel>
      </div>
      <Panel><PanelHead title="Coherent market matrix" meta="Every probability is computed from the same simulated score outcomes" /><div className="simulation-market-grid"><Market label="Home or draw" value={result.doubleChance.homeOrDraw} /><Market label="Away or draw" value={result.doubleChance.awayOrDraw} /><Market label="Over 0.5" value={result.totals.over05} /><Market label="Over 1.5" value={result.totals.over15} /><Market label="Over 2.5" value={result.totals.over25} /><Market label="Over 3.5" value={result.totals.over35} /><Market label="Home over 0.5" value={result.teamGoals.homeOver05} /><Market label="Away over 0.5" value={result.teamGoals.awayOver05} /><Market label="DNB home / push" value={result.drawNoBet.home} note={`${percent(result.drawNoBet.push)} push`} /></div></Panel>
    </> : null}
    {providerErrors.length ? <Notice>Some ESPN competitions failed: {providerErrors.join(" · ")}</Notice> : null}
    <Notice>ESPN fixture and season-record inputs fetched {new Date(fetchedAt).toLocaleString()}. More trials reduce sampling noise, not real-world model error. First-half markets remain unavailable because no separate first-half model has been validated.</Notice>
  </div>;
}

function StrategySimulator() {
  const [startingBankroll, setStartingBankroll] = useState(1000); const [staking, setStaking] = useState<"flat" | "percentage">("flat"); const [stake, setStake] = useState(10); const [probability, setProbability] = useState(55); const [odds, setOdds] = useState(-110); const [bets, setBets] = useState(200); const [paths, setPaths] = useState(5000); const [seed, setSeed] = useState("migo-risk-1"); const [result, setResult] = useState<StrategyResult | null>(null);
  function run() { setResult(simulateStrategy({ startingBankroll, staking, stake, winProbability: probability / 100, americanOdds: odds, bets, paths, seed })); }
  return <div className="stack"><div className="simulation-layout"><Panel><PanelHead title="Strategy assumptions" meta="Hypothetical paths only" /><div className="simulation-form"><div className="form-grid"><NumberField label="Starting bankroll ($)" value={startingBankroll} onChange={setStartingBankroll} /><div className="field"><label>Staking method</label><select className="select" value={staking} onChange={(event) => setStaking(event.target.value as "flat" | "percentage")}><option value="flat">Flat stake</option><option value="percentage">Fixed percentage</option></select></div><NumberField label={staking === "flat" ? "Stake per bet ($)" : "Bankroll per bet (%)"} value={stake} onChange={setStake} /><NumberField label="Estimated win probability (%)" value={probability} onChange={setProbability} /><NumberField label="American odds" value={odds} onChange={setOdds} /><NumberField label="Bets per path" value={bets} onChange={setBets} /><NumberField label="Simulation paths" value={paths} onChange={setPaths} /><div className="field"><label>Random seed</label><input className="input" value={seed} onChange={(event) => setSeed(event.target.value)} /></div></div><button className="button button-primary" onClick={run}><Play size={16} />Run risk simulation</button></div></Panel><Panel><PanelHead title="Risk distribution" meta={result ? `${paths.toLocaleString()} paths · ${bets} bets each` : "Awaiting simulation"} />{result ? <div className="risk-result"><Metric label="Median ending bankroll" value={`$${result.median.toFixed(0)}`} sub="50th percentile" /><Metric label="10th–90th percentile" value={`$${result.percentile10.toFixed(0)}–$${result.percentile90.toFixed(0)}`} sub="hypothetical range" /><Metric label="Median max drawdown" value={percent(result.medianMaxDrawdown)} sub="peak-to-trough" tone="orange" /><Metric label="Exhaustion probability" value={percent(result.exhaustionProbability)} sub="bankroll ≤ $0.01" /></div> : <div className="empty-state"><WalletCards size={32} /><strong>No risk paths yet</strong>Use conservative assumptions and compare staking methods.</div>}</Panel></div><Notice>These are hypothetical trajectories under fixed probability and price assumptions. They are not realized profits, and the model does not assume your estimated edge is correct.</Notice></div>;
}

function RangeField({ label, value, onChange, min = 0.7, max = 1.3, step = 0.05 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) { return <div className="field range-field"><label>{label}<b>{value.toFixed(2)}</b></label><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <div className="field"><label>{label}</label><input className="input" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>; }
function Outcome({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="simulation-outcome"><div><span>{label}</span><strong>{percent(value)}</strong></div><i><em className={tone} style={{ width: `${value * 100}%` }} /></i></div>; }
function Market({ label, value, note }: { label: string; value: number; note?: string }) { return <div><span>{label}</span><strong>{percent(value)}</strong>{note ? <small>{note}</small> : null}</div>; }
