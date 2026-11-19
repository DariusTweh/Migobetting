"use client";

import { useMemo, useState } from "react";
import type { BacktestResult, HistoricalMatch } from "@/lib/history";
import { runHistoricalParlayReplay, type HistoricalParlayStrategy } from "@/lib/historical-parlays";
import { decimalToAmerican, formatAmerican } from "@/lib/odds";
import { Panel, PanelHead } from "./ui";

const percent = (value: number | null) => value === null ? "—" : (value * 100).toFixed(1) + "%";

export function HistoricalParlayLab({ result, matches }: { result: BacktestResult; matches: HistoricalMatch[] }) {
  const [strategy, setStrategy] = useState<HistoricalParlayStrategy>("daily-double");
  const [minProbability, setMinProbability] = useState(65);
  const [minEdge, setMinEdge] = useState(2);
  const [maxLegs, setMaxLegs] = useState(3);
  const [stake, setStake] = useState(100);
  const replay = useMemo(() => runHistoricalParlayReplay(result.predictions, matches, {
    strategy, minProbability: minProbability / 100, minEdge: minEdge / 100,
    maxLegs, stake,
  }), [result, matches, strategy, minProbability, minEdge, maxLegs, stake]);
  const recent = replay.cards.slice(-12).reverse();
  return <Panel>
    <PanelHead title="Historical Parlay Lab" meta="Daily Double / Banger replays using recorded historical prices only, with a strict PASS policy" />
    <div className="simple-test-controls">
      <div className="field"><label>Card</label><select className="select" value={strategy} onChange={(event) => setStrategy(event.target.value as HistoricalParlayStrategy)}>
        <option value="daily-double">Daily Double · +100 target</option><option value="banger">Banger · +400 target</option>
      </select></div>
      <div className="field"><label>Minimum model probability</label><select className="select" value={minProbability} onChange={(event) => setMinProbability(Number(event.target.value))}>
        {[50, 55, 60, 65, 70, 75, 80].map((n) => <option key={n} value={n}>{n}%</option>)}
      </select></div>
      <div className="field"><label>Minimum model price edge</label><select className="select" value={minEdge} onChange={(event) => setMinEdge(Number(event.target.value))}>
        {[0, 2, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}%</option>)}
      </select></div>
      <div className="field"><label>Maximum legs</label><select className="select" value={maxLegs} onChange={(event) => setMaxLegs(Number(event.target.value))}>
        {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
      </select></div>
      <div className="field"><label>Hypothetical stake per card</label><input className="input" type="number" min={1} max={10000} value={stake} onChange={(event) => setStake(Math.max(1, Number(event.target.value) || 1))} /></div>
    </div>
    <div className="plain-result-metrics">
      <div><span>Historical fixtures evaluated</span><strong>{replay.evaluatedFixtures}</strong></div>
      <div><span>Fixtures with prices</span><strong>{replay.pricedFixtures}</strong></div>
      <div><span>Price-qualified fixtures</span><strong>{replay.qualifiedFixtures}</strong></div>
      <div><span>Cards built</span><strong>{replay.cards.length}</strong></div>
      <div><span>Won / Lost</span><strong>{replay.cardsWon} / {replay.cardsLost}</strong></div>
      <div><span>Hypothetical price-linked ROI</span><strong>{percent(replay.hypotheticalRoi)}</strong></div>
    </div>
    <div className="lineup-explanation">
      <strong>Recorded prices are NOT time-verified:</strong> this is a retrospective scenario, not validated achievable betting profit. MIGO never invents odds. Only imported 1X2 and O/U 2.5 prices qualify; MLS and UWCL ESPN results alone cannot price cards. Strategies are not independently validated when you adjust thresholds after seeing results.
    </div>
    {recent.length ? <div className="competition-table">
      {recent.map((card) => <div key={card.date}>
        <strong>{card.date}<small> · {card.legs.map((leg) => leg.fixture + " — " + leg.selection).join(" | ")}</small></strong>
        <span>{card.legs.length} legs</span>
        <span>{formatAmerican(decimalToAmerican(card.decimalOdds))}</span>
        <b>{card.won ? "WON" : "LOST"}</b>
      </div>)}
    </div> : <div className="empty-state"><strong>No qualifying historical cards</strong>
      Only matches with imported prices, sufficient forecast probability and the required price edge can enter a card. Try more price-covered leagues or a broader date range. PASS is a valid result.
    </div>}
    <p style={{ opacity: 0.75, fontSize: 12 }}>Sample dates: {replay.testedDates} · Dates without qualifying cards: {replay.skippedDates} · Hypothetical P&amp;L: {replay.hypotheticalProfit.toFixed(2)} units of the selected stake currency (total risk {replay.stakeTotal.toFixed(2)}).</p>
  </Panel>;
}
