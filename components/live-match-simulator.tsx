"use client";

import { useEffect, useMemo, useState } from "react";
import type { SimulationResult } from "@/lib/simulation";
import { forecastSeedForMatch, representativeFinalScore, type PlaybackMode } from "@/lib/forecast-playback";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { forecastWithHistory } from "@/lib/historical-forecast";
import { useLocalMatchHistory } from "@/lib/use-local-history";
import { generateMatchTape, snapshotMatch, type MatchSide, type SimTeamStat } from "@/lib/match-playback";
import type { Fixture, LineupIntelligence } from "@/lib/types";
import { Panel, PanelHead } from "./ui";

const BAR_FIELDS: Array<{ key: keyof SimTeamStat; title: string }> = [
  { key: "shots", title: "Shots" },
  { key: "onTarget", title: "Shots on target" },
  { key: "passes", title: "Completed passes (sim.)" },
  { key: "corners", title: "Corners" },
  { key: "fouls", title: "Fouls" },
  { key: "saves", title: "Saves" },
];

export function LiveMatchSimulator({ fixtures }: { fixtures: Fixture[] }) {
  const history = useLocalMatchHistory();
  const [fixtureId, setFixtureId] = useState(fixtures.find((f) => f.status === "scheduled")?.id ?? fixtures[0]?.id ?? "");
  const [seed, setSeed] = useState("migo-matchday");
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("alternate");
  const [forecastResult, setForecastResult] = useState<SimulationResult | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastProgress, setForecastProgress] = useState(0);
  const [forecastError, setForecastError] = useState("");
  const [lineups, setLineups] = useState<LineupIntelligence | null>(null);
  const [lineupStatus, setLineupStatus] = useState("Using placeholder roster until lineups load");
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [selectedSide, setSelectedSide] = useState<MatchSide>("home");
  const fixture = fixtures.find((f) => f.id === fixtureId);
  const forecast = useMemo(() => fixture ? forecastWithHistory(fixture, history) : null, [fixture, history]);
  const forecastSeed = fixture && forecast && forecast.dataQuality !== "insufficient"
    ? forecastSeedForMatch(fixture.id, forecast.modelVersion, forecast.expectedHomeGoals, forecast.expectedAwayGoals, forecast.lowScoreCorrelation)
    : null;
  const prediction = forecastResult?.input.seed === forecastSeed ? forecastResult : null;
  const modalScore = prediction ? representativeFinalScore(prediction) : null;
  const goalRanges = prediction ? [
    { label: "0–1 goals", probability: prediction.goalDistribution.filter((item) => item.goals < 2).reduce((sum, item) => sum + item.probability, 0) },
    { label: "2–3 goals", probability: prediction.goalDistribution.filter((item) => item.goals >= 2 && item.goals < 4).reduce((sum, item) => sum + item.probability, 0) },
    { label: "4+ goals", probability: prediction.goalDistribution.filter((item) => item.goals >= 4).reduce((sum, item) => sum + item.probability, 0) },
  ] : [];

  // Do not use the user-editable playback seed here. A Web Worker runs 30K
  // correlation-adjusted score scenarios whenever model inputs change.
  useEffect(() => {
    setForecastResult(null);
    setForecastError("");
    setForecastProgress(0);
    if (!forecastSeed || !fixture || !forecast || forecast.dataQuality === "insufficient") {
      setForecastLoading(false);
      return;
    }
    let cancelled = false;
    setForecastLoading(true);
    const worker = new Worker("/simulation-worker.js");
    worker.onmessage = (event: MessageEvent<{ type: string; progress?: number; result?: SimulationResult }>) => {
      if (cancelled) return;
      if (event.data.type === "progress") setForecastProgress(event.data.progress ?? 0);
      if (event.data.type === "result" && event.data.result?.input.seed === forecastSeed) {
        setForecastResult(event.data.result);
        setForecastProgress(1);
        setForecastLoading(false);
        worker.terminate();
      }
    };
    worker.onerror = () => {
      if (!cancelled) {
        setForecastError("Could not calculate the 30,000-match forecast in this browser.");
        setForecastLoading(false);
      }
      worker.terminate();
    };
    worker.postMessage({
      homeTeam: fixture.home.shortName, awayTeam: fixture.away.shortName,
      expectedHomeGoals: forecast.expectedHomeGoals,
      expectedAwayGoals: forecast.expectedAwayGoals,
      lowScoreCorrelation: forecast.lowScoreCorrelation,
      iterations: 30_000, seed: forecastSeed, modelVersion: forecast.modelVersion, scenario: "baseline",
    });
    return () => { cancelled = true; worker.terminate(); };
  }, [forecastSeed, fixture?.home.shortName, fixture?.away.shortName, forecast?.expectedHomeGoals, forecast?.expectedAwayGoals, forecast?.lowScoreCorrelation, forecast?.modelVersion, forecast?.dataQuality]);

  useEffect(() => {
    const url = new URLSearchParams(window.location.search);
    const requested = url.get("fixture");
    if (requested && fixtures.some((f) => f.id === requested)) setFixtureId(requested);
  }, [fixtures]);

  useEffect(() => {
    let canceled = false;
    setLineups(null);
    setLineupStatus("Checking ESPN lineup availability…");
    if (!fixtureId) return;
    fetch("/api/lineups/" + encodeURIComponent(fixtureId))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unavailable")))
      .then((data: LineupIntelligence) => {
        if (canceled) return;
        setLineups(data);
        setLineupStatus("Using ESPN-listed projected/confirmed starters when available");
      })
      .catch(() => { if (!canceled) setLineupStatus("ESPN lineup data unavailable — placeholder roster used"); });
    return () => { canceled = true; };
  }, [fixtureId]);

  const tape = useMemo(() => {
    if (!fixture || !forecast || forecast.dataQuality === "insufficient") return null;
    if (playbackMode === "representative" && !modalScore) return null;
    const homeLineup = lineups?.fixtureId === fixture.id ? lineups.home.players : undefined;
    const awayLineup = lineups?.fixtureId === fixture.id ? lineups.away.players : undefined;
    return generateMatchTape({
      seed: seed + ":" + fixture.id,
      homeName: fixture.home.shortName, awayName: fixture.away.shortName,
      expectedHomeGoals: forecast.expectedHomeGoals, expectedAwayGoals: forecast.expectedAwayGoals,
      lowScoreCorrelation: forecast.lowScoreCorrelation,
      homeLineup: homeLineup?.length === 11 ? homeLineup : undefined,
      awayLineup: awayLineup?.length === 11 ? awayLineup : undefined,
      finalScoreOverride: playbackMode === "representative" ? modalScore ?? undefined : undefined,
    });
  }, [fixture, forecast, seed, lineups, playbackMode, modalScore?.home, modalScore?.away]);

  useEffect(() => { setMinute(0); setPlaying(false); }, [fixtureId, seed, lineups, playbackMode, modalScore?.home, modalScore?.away]);
  useEffect(() => {
    if (!playing || !tape) return;
    const handle = window.setInterval(() => setMinute((current) => Math.min(90, current + 1)), Math.max(70, Math.round(900 / speed)));
    return () => window.clearInterval(handle);
  }, [playing, speed, tape]);
  useEffect(() => { if (minute === 90) setPlaying(false); }, [minute]);

  const snapshot = useMemo(() => tape ? snapshotMatch(tape, minute) : null, [tape, minute]);
  const displayedPlayers = useMemo(() =>
    tape?.players.filter((player) => player.side === selectedSide).map((player) => ({
      player, stat: snapshot?.playerStats[player.id],
    })).sort((a, b) => ((b.stat?.goals ?? 0) * 5 + (b.stat?.assists ?? 0) * 3 + (b.stat?.shots ?? 0) + (b.stat?.passes ?? 0) * 0.02) -
      ((a.stat?.goals ?? 0) * 5 + (a.stat?.assists ?? 0) * 3 + (a.stat?.shots ?? 0) + (a.stat?.passes ?? 0) * 0.02)) ?? [],
    [tape, selectedSide, snapshot]);

  return <div className="stack">
    <div className="notice"><strong>SIMULATION · NOT A LIVE MATCH</strong> Every minute, shot, pass, event and player performance shown below is synthetic. ESPN supplies fixture information and available lineup names; this is not an ESPN play-by-play feed.</div>
    <Panel>
      <PanelHead title="Pre-match forecast · 30,000 simulated matches" meta={forecast ? forecast.modelVersion + " · " + forecast.dataQuality + " data quality · same forecast regardless of playback seed" : "Choose a fixture"} />
      {forecastLoading ? <div className="forecast-loading">
        <strong>Running 30,000 background scenarios… {Math.round(forecastProgress * 100)}%</strong>
        <div className="simulation-progress"><i style={{ width: Math.round(forecastProgress * 100) + "%" }} /></div>
      </div> : null}
      {forecastError ? <div className="lineup-explanation">{forecastError}</div> : null}
      {prediction ? <>
        <div className="forecast-outcomes">
          <div><span>{fixture?.home.shortName ?? "Home"} win</span><strong>{(prediction.outcomes.home * 100).toFixed(1)}%</strong></div>
          <div><span>Draw</span><strong>{(prediction.outcomes.draw * 100).toFixed(1)}%</strong></div>
          <div><span>{fixture?.away.shortName ?? "Away"} win</span><strong>{(prediction.outcomes.away * 100).toFixed(1)}%</strong></div>
        </div>
        <div className="forecast-scoring">
          <div><span>Most frequent exact score</span><strong>{prediction.scorelines[0]?.score ?? "—"}</strong>
            <small>{prediction.scorelines[0] ? (prediction.scorelines[0].probability * 100).toFixed(1) + "% of 30,000 samples" : "Unavailable"}</small>
          </div>
          <div><span>Over 1.5 goals</span><strong>{(prediction.totals.over15 * 100).toFixed(1)}%</strong></div>
          <div><span>Over 2.5 goals</span><strong>{(prediction.totals.over25 * 100).toFixed(1)}%</strong></div>
          <div><span>Both teams to score</span><strong>{(prediction.bothTeamsScore * 100).toFixed(1)}%</strong></div>
        </div>
        <div className="forecast-scorelines">
          {prediction.scorelines.map((item) => <span key={item.score}>{item.score} · {(item.probability * 100).toFixed(1)}%</span>)}
        </div>
        <div className="goal-range-grid goal-ranges-simulation">
          {goalRanges.map((range) => <div key={range.label}>
            <small>{range.label}</small>
            <strong>{(range.probability * 100).toFixed(1)}%</strong>
            <div className="prob-track"><i className="home" style={{ width: (range.probability * 100).toFixed(1) + "%" }} /></div>
          </div>)}
        </div>
        <p className="forecast-disclaimer">
          The most frequent exact score represents only {prediction.scorelines[0] ? (prediction.scorelines[0].probability * 100).toFixed(1) : "0"}% of 30,000 trials. Different scores are collectively much more likely.
          These are pre-match model scenarios, not live odds, observed match events, or a guarantee. Lineup-specific player impact is not modeled in these probabilities.
        </p>
      </> : !forecastLoading && !forecastError ? <div className="empty-state compact"><strong>Forecast unavailable</strong>Choose a fixture with sufficient scoring inputs.</div> : null}
    </Panel>
    <Panel>
      <PanelHead title="Match playback controls" meta="Sampled match is the honest default; modal-score playback is available only as an illustration." />
      <div className="builder-form">
        <div className="field"><label>Fixture</label><select className="select" value={fixtureId} onChange={(event) => { setFixtureId(event.target.value); setPlaying(false); }}>{fixtures.map((f) => <option value={f.id} key={f.id}>{f.home.shortName} vs {f.away.shortName} · {f.league}</option>)}</select></div>
        <div className="form-grid">
          <div className="field"><label>Playback mode</label><select className="select" value={playbackMode} onChange={(event) => setPlaybackMode(event.target.value as PlaybackMode)}>
            <option value="alternate">Sampled match · full distribution</option>
            <option value="representative">Illustration · modal score</option>
          </select></div>
          <div className="field"><label>Playback seed · {playbackMode === "alternate" ? "changes score and timeline" : "changes timeline only"}</label><input className="input" value={seed} onChange={(event) => setSeed(event.target.value)} /></div>
          <div className="field"><label>Playback speed</label><select className="select" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="1">1×</option><option value="4">4×</option><option value="10">10×</option></select></div>
        </div>
        <p className="forecast-disclaimer">{playbackMode === "representative"
          ? "Changing the playback seed changes hypothetical goal minutes, players and events, but not the representative final score or the 30,000-match forecast."
          : "Alternate mode samples a different possible final score for each seed. The 30,000-match probabilities remain unchanged."}</p>
        <div className="playback-actions">
          <button className="button button-primary" disabled={!tape || minute === 90} onClick={() => setPlaying((x) => !x)}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "Pause match" : minute ? "Resume match" : "Kick off simulation"}</button>
          <button className="button" onClick={() => { setMinute(0); setPlaying(false); }} disabled={!tape}><RotateCcw size={16} />Restart</button>
          <button className="button" onClick={() => { setMinute((x) => Math.min(90, x + 5)); setPlaying(false); }} disabled={!tape || minute === 90}><SkipForward size={16} />+5 min</button>
          <button className="button" onClick={() => { setMinute(90); setPlaying(false); }} disabled={!tape || minute === 90}>Full time</button>
        </div>
        <div className="field"><label>Match clock · {minute}′ / 90′</label><input aria-label="Simulated minute" type="range" min={0} max={90} value={minute} disabled={!tape} onChange={(event) => { setMinute(Number(event.target.value)); setPlaying(false); }} style={{ width: "100%" }} /></div>
      </div>
    </Panel>
    {!fixture || !forecast || !tape || !snapshot ? <Panel><div className="empty-state"><strong>{forecastLoading ? "Preparing representative match…" : "Match timeline unavailable"}</strong>{forecastLoading ? "The 30,000-match forecast will determine the representative final score." : "Choose a fixture with sufficient model data."}</div></Panel> : <>
      <div className="playback-scoreboard">
        <div className="playback-topline"><span>{fixture.league}</span><span>{minute === 0 ? "PRE-MATCH" : minute === 90 ? "FULL TIME · SIMULATED" : String(minute) + "′ · SIMULATED"}</span></div>
        <div className="playback-scores">
          <div><small>HOME</small><strong>{fixture.home.shortName}</strong></div>
          <b>{snapshot.home.goals} <span>–</span> {snapshot.away.goals}</b>
          <div><small>AWAY</small><strong>{fixture.away.shortName}</strong></div>
        </div>
        <div className="playback-progress"><span style={{ width: minute / 90 * 100 + "%" }} /></div>
        <div className="playback-xg">{playbackMode === "representative" ? "Representative modal-score scenario" : "Random alternate scenario"} · Model goal means: {forecast.expectedHomeGoals.toFixed(2)}–{forecast.expectedAwayGoals.toFixed(2)} · {lineupStatus}</div>
      </div>
      <div className="playback-columns">
        <Panel>
          <PanelHead title="Simulated match statistics" meta="Numbers advance as the simulated clock progresses" />
          <div className="playback-statbox">
            <div className="playback-stat"><b>{snapshot.possession.home}%</b><span>Pass-share possession proxy</span><b>{snapshot.possession.away}%</b></div>
            {BAR_FIELDS.map(({ key, title }) => <div className="playback-stat" key={key}><b>{snapshot.home[key]}</b><span>{title}</span><b>{snapshot.away[key]}</b></div>)}
          </div>
        </Panel>
        <Panel>
          <PanelHead title="Match commentary" meta="Synthetic events · latest first" />
          <div className="playback-feed">
            {snapshot.events.slice(0, 16).map((event) => <div className={"playback-feed-item " + (event.kind === "goal" ? "is-goal" : "")} key={event.id}><b>{event.minute}′</b><div><strong>{event.kind.toUpperCase()}</strong><span>{event.description}</span></div></div>)}
            {!snapshot.events.length ? <div className="empty-state compact">Kick off to see the match unfold.</div> : null}
          </div>
        </Panel>
      </div>
      <Panel>
        <PanelHead title="Simulated player performance" meta="Synthetic stat allocation, not real player tracking or a player-prop forecast" />
        <div className="lab-tabs"><button className={selectedSide === "home" ? "active" : ""} onClick={() => setSelectedSide("home")}>{fixture.home.shortName}</button><button className={selectedSide === "away" ? "active" : ""} onClick={() => setSelectedSide("away")}>{fixture.away.shortName}</button></div>
        <div className="playback-player-table">
          <div className="playback-player-row headings"><span>Player · position</span><span>Passes</span><span>Shots</span><span>Goals</span><span>Assists</span></div>
          {displayedPlayers?.map(({ player, stat }) => <div className="playback-player-row" key={player.id}><span><strong>{player.name}</strong><small>{player.position} · {player.provenance === "placeholder" ? "Placeholder" : "ESPN lineup name"}</small></span><b>{stat?.passes ?? 0}</b><b>{stat?.shots ?? 0}</b><b>{stat?.goals ?? 0}</b><b>{stat?.assists ?? 0}</b></div>)}
        </div>
      </Panel>
    </>}
  </div>;
}
