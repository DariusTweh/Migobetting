"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [lineups, setLineups] = useState<LineupIntelligence | null>(null);
  const [lineupStatus, setLineupStatus] = useState("Using placeholder roster until lineups load");
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [selectedSide, setSelectedSide] = useState<MatchSide>("home");
  const fixture = fixtures.find((f) => f.id === fixtureId);
  const forecast = useMemo(() => fixture ? forecastWithHistory(fixture, history) : null, [fixture, history]);

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
    const homeLineup = lineups?.fixtureId === fixture.id ? lineups.home.players : undefined;
    const awayLineup = lineups?.fixtureId === fixture.id ? lineups.away.players : undefined;
    return generateMatchTape({
      seed: seed + ":" + fixture.id,
      homeName: fixture.home.shortName, awayName: fixture.away.shortName,
      expectedHomeGoals: forecast.expectedHomeGoals, expectedAwayGoals: forecast.expectedAwayGoals,
      homeLineup: homeLineup?.length === 11 ? homeLineup : undefined,
      awayLineup: awayLineup?.length === 11 ? awayLineup : undefined,
    });
  }, [fixture, forecast, seed, lineups]);

  useEffect(() => { setMinute(0); setPlaying(false); }, [fixtureId, seed, lineups]);
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
      <PanelHead title="Match playback controls" meta="A seeded scenario. Replay the same seed for the same sequence." />
      <div className="builder-form">
        <div className="field"><label>Fixture</label><select className="select" value={fixtureId} onChange={(event) => { setFixtureId(event.target.value); setPlaying(false); }}>{fixtures.map((f) => <option value={f.id} key={f.id}>{f.home.shortName} vs {f.away.shortName} · {f.league}</option>)}</select></div>
        <div className="form-grid">
          <div className="field"><label>Simulation seed</label><input className="input" value={seed} onChange={(event) => setSeed(event.target.value)} /></div>
          <div className="field"><label>Playback speed</label><select className="select" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="1">1×</option><option value="4">4×</option><option value="10">10×</option></select></div>
        </div>
        <div className="playback-actions">
          <button className="button button-primary" disabled={!tape || minute === 90} onClick={() => setPlaying((x) => !x)}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "Pause match" : minute ? "Resume match" : "Kick off simulation"}</button>
          <button className="button" onClick={() => { setMinute(0); setPlaying(false); }} disabled={!tape}><RotateCcw size={16} />Restart</button>
          <button className="button" onClick={() => { setMinute((x) => Math.min(90, x + 5)); setPlaying(false); }} disabled={!tape || minute === 90}><SkipForward size={16} />+5 min</button>
          <button className="button" onClick={() => { setMinute(90); setPlaying(false); }} disabled={!tape || minute === 90}>Full time</button>
        </div>
        <div className="field"><label>Match clock · {minute}′ / 90′</label><input aria-label="Simulated minute" type="range" min={0} max={90} value={minute} disabled={!tape} onChange={(event) => { setMinute(Number(event.target.value)); setPlaying(false); }} style={{ width: "100%" }} /></div>
      </div>
    </Panel>
    {!fixture || !forecast || !tape || !snapshot ? <Panel><div className="empty-state"><strong>Insufficient fixture data</strong>Choose a match with valid ESPN season records before simulating.</div></Panel> : <>
      <div className="playback-scoreboard">
        <div className="playback-topline"><span>{fixture.league}</span><span>{minute === 0 ? "PRE-MATCH" : minute === 90 ? "FULL TIME · SIMULATED" : String(minute) + "′ · SIMULATED"}</span></div>
        <div className="playback-scores">
          <div><small>HOME</small><strong>{fixture.home.shortName}</strong></div>
          <b>{snapshot.home.goals} <span>–</span> {snapshot.away.goals}</b>
          <div><small>AWAY</small><strong>{fixture.away.shortName}</strong></div>
        </div>
        <div className="playback-progress"><span style={{ width: minute / 90 * 100 + "%" }} /></div>
        <div className="playback-xg">Forecast goals: {forecast.expectedHomeGoals.toFixed(2)}–{forecast.expectedAwayGoals.toFixed(2)} · {lineupStatus}</div>
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
