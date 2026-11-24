"use client";
import { useEffect, useState } from "react";
import { RefreshCw, ArrowRight, Copy, ShieldAlert } from "lucide-react";
import type { NflGame, NflProp } from "@/lib/nfl/engine";
type Board = { games: NflGame[]; errors: string[]; fetchedAt: string };
type Preview = {
  game: NflGame; version: string; fetchedAt: string;
  coverage: { completedGames: number; playerLines: number; homeHistory: number; awayHistory: number; note: string };
  props: NflProp[]; probabilityStatus: "UNCALIBRATED"; error?: string;
  supplementalCoverage?: {
    stats: "available" | "unavailable"; snaps: "available" | "unavailable";
    injuries: "available" | "unavailable"; statsRows: number; snapsRows: number;
    injuryRows: number; week: number | null; season: number | null; attribution: string;
  };
};
const time = (date: string) => new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit",
}).format(new Date(date));
const printLeg = (p: NflProp) => p.player + " — " + p.label;
export function NflHub({ initialData }: { initialData: Board }) {
  const [board, setBoard] = useState(initialData);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedLegs, setSelectedLegs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const current = board.games.find((game) => game.id === selected);
  useEffect(() => { setSelectedLegs([]); setPreview(null); setError(""); }, [selected]);
  async function refreshBoard() {
    setLoading(true);
    try {
      const res = await fetch("/api/nfl", { cache: "no-store" });
      if (!res.ok) throw new Error("Unable to refresh NFL schedule");
      setBoard(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Refresh failed"); }
    finally { setLoading(false); }
  }
  async function openGame(id: string) {
    setSelected(id);
    setPreview(null); setError(""); setLoading(true);
    try {
      const res = await fetch("/api/nfl?eventId=" + encodeURIComponent(id), { cache: "no-store" });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || "Unable to load matchup research");
      setPreview(result as Preview);
    } catch (e) { setError(e instanceof Error ? e.message : "Preview failed"); }
    finally { setLoading(false); }
  }
  const selectedProps = (preview?.props ?? []).filter((p) => selectedLegs.includes(p.id));
  function toggle(p: NflProp) {
    if (p.grade === "PASS") return;
    setSelectedLegs((before) => {
      if (before.includes(p.id)) return before.filter((id) => id !== p.id);
      if (before.length >= 6) return before;
      // Limit one prop per player, and avoid same-player markets as independent legs.
      return [...before.filter((id) => !id.startsWith(p.athleteId + ":")), p.id];
    });
  }
  async function copy() {
    if (!selectedProps.length) return;
    await navigator.clipboard.writeText("MIGO NFL RESEARCH SLIP — NOT A BOOKMAKER BET\n" +
      selectedProps.map((p,i) => (i + 1) + ". " + printLeg(p)).join("\n") +
      "\nUncalibrated analysis. Verify active players, final odds and market availability.");
    setCopied(true);
  }
  return <div className="nfl-page">
    <header className="page-header">
      <div><div className="eyebrow">MIGO Football Intelligence · NFL v1</div>
        <h1>NFL Prop Lab</h1>
        <p>Data-first alternate yardage and receptions research, with explicit evidence and risk gates. No hindsight forecasts.</p></div>
      <button className="button" onClick={refreshBoard} disabled={loading}><RefreshCw size={16}/> Refresh</button>
    </header>
    <div className="nfl-warning"><ShieldAlert size={18}/><span><strong>RESEARCH / PAPER MODE.</strong> Ratings are weighted research scores, not winning probabilities. No calibrated odds, live injuries, snap share, weather, or BetMGM feed is connected.</span></div>
    {error && <p className="nfl-error" role="alert">{error}</p>}
    {board.errors.length > 0 && <p className="nfl-footnote">Some ESPN dates could not refresh; games may be missing.</p>}
    <section className="nfl-layout">
      <div className="panel">
        <div className="panel-head"><div><h2>Upcoming NFL games</h2><span>Pacific times · ESPN schedule</span></div></div>
        <div className="nfl-games">{board.games.length ? board.games.map((game) => <button
          key={game.id} className={"nfl-game " + (selected === game.id ? "nfl-game-active" : "")}
          onClick={() => openGame(game.id)} disabled={loading}>
          <span className="nfl-game-top">{time(game.kickoff)} · {game.statusLabel}</span>
          <span className="nfl-team"><span>{game.away.logo ? <img src={game.away.logo} alt="" /> : null}{game.away.abbreviation} {game.away.name}</span><strong>{game.away.score ?? ""}</strong></span>
          <span className="nfl-team"><span>{game.home.logo ? <img src={game.home.logo} alt="" /> : null}{game.home.abbreviation} {game.home.name}</span><strong>{game.home.score ?? ""}</strong></span>
          <span className="nfl-game-bottom">{game.spreadDetails || "Spread unavailable"} {game.overUnder ? "· O/U " + game.overUnder : ""} <ArrowRight size={15}/></span>
        </button>) : <div className="empty-state"><strong>No NFL fixtures loaded.</strong>Try refreshing the ESPN schedule.</div>}</div>
      </div>
      <div className="panel">
        <div className="panel-head"><div><h2>{current ? current.away.abbreviation + " @ " + current.home.abbreviation : "Matchup research"}</h2><span>Recent game-box usage · scenario analysis</span></div></div>
        {!current ? <div className="empty-state"><strong>Choose an NFL matchup</strong>We analyze actual player box scores from games before kickoff.</div> :
        loading ? <div className="empty-state">Collecting available ESPN historical box scores…</div> :
        !preview ? <div className="empty-state"><strong>No pre-game projection</strong>{error || "Choose a scheduled game to see available research."}</div> :
        <div className="nfl-preview">
          <div className="nfl-metrics">
            <div><span>Usable box scores</span><strong>{preview.coverage.completedGames}</strong></div>
            <div><span>Player stat lines</span><strong>{preview.coverage.playerLines}</strong></div>
            <div><span>Probability model</span><strong>Not calibrated</strong></div>
          </div>
          {preview.supplementalCoverage ? <div className="nfl-provider">
            <strong>Player opportunity coverage · {preview.supplementalCoverage.season ?? "?"} W{preview.supplementalCoverage.week ?? "?"}</strong>
            <span>Weekly stats: {preview.supplementalCoverage.stats} ({preview.supplementalCoverage.statsRows} rows)</span>
            <span>Offensive snaps: {preview.supplementalCoverage.snaps} ({preview.supplementalCoverage.snapsRows} rows)</span>
            <span>Injury reports: {preview.supplementalCoverage.injuries} ({preview.supplementalCoverage.injuryRows} dated reports)</span>
            <small>Source: {preview.supplementalCoverage.attribution}. Incomplete sources do not count as verified player availability.</small>
          </div> : null}
          <p className="nfl-footnote">{preview.coverage.note} Pick ratings use Usage 35%, Matchup 25%, Script 20%, Efficiency 10%, Context 10%; unknown inputs cannot count as confirmed strengths. Player opportunities are historical; official game-day active status is still unverified.</p>
          <h3>Ranked props · research only</h3>
          {preview.props.length ? <div className="nfl-props">
            {preview.props.map((pick) => <article key={pick.id} className="nfl-prop">
              <div className="nfl-prop-head">
                <div><strong>{pick.player}</strong><span>{pick.position} · {pick.label}</span></div>
                <span className={pick.grade === "RESEARCH" ? "nfl-score" : "nfl-score nfl-score-muted"}>{pick.researchScore}/100 · {pick.grade}</span>
              </div>
              <div className="nfl-prop-values"><span>Projected <b>{pick.projection}</b></span><span>Earlier listed hit rate <b>{pick.historicalHits}/{pick.sampleGames}</b></span><span>No fair odds yet</span></div>
              {pick.intelligence ? <div className="nfl-intelligence">
                <span>Recent targets <b>{pick.intelligence.targets?.toFixed(1) ?? "unknown"}</b></span>
                <span>Recent carries <b>{pick.intelligence.carries?.toFixed(1) ?? "unknown"}</b></span>
                <span>Offense snaps <b>{pick.intelligence.snapShare !== null ? pick.intelligence.snapShare.toFixed(1) + "%" : "unknown"}</b></span>
                <span>Target share <b>{pick.intelligence.targetShare !== null ? pick.intelligence.targetShare.toFixed(1) + "%" : "unknown"}</b></span>
                <span>Injury status <b>{pick.intelligence.status}</b></span>
              </div> : <p className="nfl-footnote">No unique nflverse player/team match; using ESPN box-score research only.</p>}
              <details><summary>See evidence and limitations</summary>
                <ul>{pick.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
                <ul>{pick.risks.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </details>
              <button className="button button-small" disabled={pick.grade === "PASS"} onClick={() => toggle(pick)}>
                {selectedLegs.includes(pick.id) ? "Remove from research slip" : "Add to research slip"}
              </button>
            </article>)}
          </div> : <div className="empty-state"><strong>PASS — insufficient verified game logs.</strong>We never invent player projections when provider coverage is missing.</div>}
        </div>}
      </div>
    </section>
    {selectedProps.length ? <section className="panel nfl-slip">
      <div className="panel-head"><div><h2>Research slip · {selectedProps.length}/6</h2><span>No fabricated combined odds or parlay win probability</span></div></div>
      <ol>{selectedProps.map((p) => <li key={p.id}>{printLeg(p)} · {p.researchScore}/100 research score</li>)}</ol>
      <button className="button button-primary" onClick={copy}><Copy size={16}/>{copied ? "Copied" : "Copy research slip"}</button>
    </section> : null}
  </div>;
}
