"use client";

import { useEffect, useState } from "react";
import { useLocalMatchHistoryStatus } from "@/lib/use-local-history";
import {
  validateFirstHalfMultiSeason, type FirstHalfValidationReport,
} from "@/lib/first-half-validation";
import { Panel, PanelHead } from "./ui";

const LEAGUES = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "Champions League", "UEFA Women\'s Champions League"];
const pct = (n: number | null) => n === null ? "—" : (n * 100).toFixed(1) + "%";
const decimal = (n: number | null) => n === null ? "—" : n.toFixed(3);

export function FirstHalfValidationPanel() {
  const { matches, ready, error } = useLocalMatchHistoryStatus();
  const [league, setLeague] = useState(LEAGUES[0]);
  const [cap, setCap] = useState(250);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<FirstHalfValidationReport | null>(null);

  // Validation is deliberately on-demand. Evaluating thousands of earlier
  // fixtures is CPU-intensive, and should never block initial live-score UI.
  function run() {
    if (!ready || running) return;
    setRunning(true);
    setReport(null);
    window.setTimeout(() => {
      try {
        setReport(validateFirstHalfMultiSeason(matches, league, cap));
      } finally { setRunning(false); }
    }, 20);
  }
  useEffect(() => { setReport(null); }, [league, cap]);

  return <div className="stack">
    <Panel>
      <PanelHead title="First-half · multi-season validation"
        meta="Walk-forward predictions · genuine historical halftime scores" />
      <div className="first-half-validation-controls">
        <div className="field">
          <label>League</label>
          <select className="select" value={league} onChange={(event) => setLeague(event.target.value)}>
            {LEAGUES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Maximum matches per season</label>
          <select className="select" value={cap} onChange={(event) => setCap(Number(event.target.value))}>
            <option value={100}>100</option>
            <option value={250}>250</option>
            <option value={400}>400</option>
          </select>
        </div>
        <button className="button button-primary" disabled={!ready || running}
          onClick={run}>{running ? "Validating seasons…" : "Run historical validation"}</button>
      </div>
      <p className="first-half-foot">
        The model only learns from matches dated before each target match.
        This is a retrospective walk-forward test, not live-logged accuracy.
        Brier score is lower-is-better; bookmaker profitability cannot be inferred.
        {error ? " History provider warning: " + error : ""}
      </p>
    </Panel>
    {report ? <>
      <Panel>
        <PanelHead title={report.competition + " · model diagnostics"}
          meta={report.scored + " eligible predictions from " + report.candidates + " checked matches · " +
            report.perSeason.length + " seasons"} />
        {report.scored === 0 ? <div className="empty-state compact">
          <strong>Insufficient historical halftime coverage</strong>
          No out-of-sample predictions were available. Import more completed seasons with HTHG and HTAG.
        </div> : <>
          <div className="fhv-metric-table">
            <div className="fhv-row fhv-head">
              <span>Market</span><span>Avg model</span><span>Actual</span><span>Brier</span><span>≥68% hits</span>
            </div>
            {report.metrics.map((m) => <div className="fhv-row" key={m.market}>
              <strong>{m.label}</strong><span>{pct(m.predictedRate)}</span>
              <span>{pct(m.observedRate)}</span><span>{decimal(m.brier)}</span>
              <span>{m.passesAt68 ? m.hitsAt68 + "/" + m.passesAt68 : "—"}</span>
            </div>)}
          </div>
        </>}
      </Panel>
      <Panel>
        <PanelHead title="Season-by-season accuracy" meta="Forecast versus observed first-half goals" />
        <div className="fhv-season-list">
          {report.perSeason.map((season) => <div className="fhv-season" key={season.season}>
            <div><strong>{season.season}</strong><small>{season.scored} evaluated / {season.candidates} available</small></div>
            <div>{season.metrics.slice(0, 2).map((m) => <span key={m.market}>
              {m.label} · predicted <b>{pct(m.predictedRate)}</b> · actual <b>{pct(m.observedRate)}</b> · Brier <b>{decimal(m.brier)}</b>
            </span>)}</div>
          </div>)}
        </div>
      </Panel>
      <Panel>
        <PanelHead title="Reliability by model confidence"
          meta="Do predicted 1H goal percentages match observed frequencies?" />
        {(["first-half-over-0.5", "first-half-over-1.5"] as const).map((market) =>
          <section className="fhv-calibration" key={market}>
            <h3>{market === "first-half-over-0.5" ? "1H Over 0.5" : "1H Over 1.5"}</h3>
            {report.calibration[market].filter((bin) => bin.count > 0).map((bin) =>
              <div className="fhv-bin" key={bin.band}>
                <span>{bin.band}<small>{bin.count} games</small></span>
                <div><i style={{ width: (bin.predicted * 100) + "%" }} />
                  <b style={{ left: (bin.observed * 100) + "%" }}/></div>
                <strong>{pct(bin.predicted)} / {pct(bin.observed)}</strong>
              </div>)}
          </section>)}
        <p className="first-half-foot">Lime bar = model average. White tick = actual hit rate. Sparse confidence bands are not reliable calibration evidence.</p>
      </Panel>
    </> : null}
  </div>;
}
