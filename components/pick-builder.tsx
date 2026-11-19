"use client";

import { useMemo, useState } from "react";
import { Calculator, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { PageHeader, Panel, PanelHead, Notice } from "./ui";
import type { Fixture, PaperBet } from "@/lib/types";
import { americanToDecimal, combineAmericanOdds, formatAmerican, impliedProbability } from "@/lib/odds";
import { savePaperBet } from "./local-storage";
import { estimateParlayProbability } from "@/lib/parlay";

type Leg = { id: string; fixtureId: string; market: string; odds: number; modelProbability?: number };

export function PickBuilder({ fixtures }: { fixtures: Fixture[] }) {
  const [fixtureId, setFixtureId] = useState(fixtures[0]?.id ?? "");
  const [market, setMarket] = useState("Home win");
  const [odds, setOdds] = useState(-110);
  const [stake, setStake] = useState(10);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [saved, setSaved] = useState(false);
  const combined = legs.length ? combineAmericanOdds(legs.map((leg) => leg.odds)) : null;
  const decimal = combined ? americanToDecimal(combined) : 0;
  const selectedFixture = fixtures.find((fixture) => fixture.id === fixtureId);
  const duplicateFixture = new Set(legs.map((leg) => leg.fixtureId)).size < legs.length;
  const modelEstimate = useMemo(() => legs.length ? estimateParlayProbability(legs, fixtures) : null, [legs, fixtures]);

  const payout = useMemo(() => stake * decimal, [stake, decimal]);
  function addLeg() {
    if (!fixtureId || !Number.isFinite(odds) || odds === 0) return;
    setLegs((current) => [...current, { id: crypto.randomUUID(), fixtureId, market, odds }]);
    setSaved(false);
  }
  function save() {
    if (!legs.length) return;
    legs.forEach((leg) => {
      const fixture = fixtures.find((item) => item.id === leg.fixtureId);
      if (!fixture) return;
      const bet: PaperBet = { id: crypto.randomUUID(), fixtureId: leg.fixtureId, fixtureLabel: `${fixture.home.shortName} vs ${fixture.away.shortName}`, market: leg.market, americanOdds: leg.odds, stake: stake / legs.length, lockedAt: new Date().toISOString(), kickoff: fixture.kickoff, status: "open" };
      savePaperBet(bet);
    });
    setSaved(true);
  }

  return <>
    <PageHeader eyebrow="Manual pricing workspace" title="Pick Builder" description="Enter the price you actually see, inspect the implied probability, and build a paper-only card." />
    <div className="builder-layout">
      <Panel>
        <PanelHead title="Add a selection" meta="Odds are never guessed or auto-filled" />
        <div className="builder-form">
          <div className="field"><label>Fixture</label><select className="select" value={fixtureId} onChange={(event) => setFixtureId(event.target.value)}>{fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.home.shortName} vs {fixture.away.shortName} · {fixture.league}</option>)}</select></div>
          <div className="form-grid">
            <div className="field"><label>Market</label><select className="select" value={market} onChange={(event) => setMarket(event.target.value)}>{["Home win", "Draw", "Away win", "Home or draw", "Away or draw", "Over 1.5 goals", "Over 2.5 goals", "Under 3.5 goals", "Both teams to score"].map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label>American odds</label><input className="input" type="number" value={odds} onChange={(event) => setOdds(Number(event.target.value))} /><small>Implied probability: {odds ? (impliedProbability(odds) * 100).toFixed(1) : "—"}%</small></div>
          </div>
          <button className="button button-primary" onClick={addLeg} disabled={!selectedFixture}><Plus size={16} />Add to card</button>
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Paper card" meta={legs.length ? `${legs.length} ${legs.length === 1 ? "leg" : "legs"}` : "Nothing added"} />
        {legs.length ? <div className="builder-card">
          <div className="leg-list">{legs.map((leg) => { const fixture = fixtures.find((item) => item.id === leg.fixtureId); return <div className="leg-row" key={leg.id}><div><span>{fixture?.league}</span><strong>{leg.market}</strong><small>{fixture?.home.shortName} vs {fixture?.away.shortName}</small></div><b>{formatAmerican(leg.odds)}</b><button className="icon-button" onClick={() => setLegs((current) => current.filter((item) => item.id !== leg.id))} aria-label="Remove leg"><Trash2 size={16} /></button></div>; })}</div>
          {duplicateFixture && <div className="correlation-warning"><TriangleAlert size={16} /><span>Multiple legs share a fixture. Treat them as correlated; multiplying independent probabilities would overstate confidence.</span></div>}
          {modelEstimate?.warnings.map((warning) => <div className="model-warning" key={warning}><TriangleAlert size={14} /><span>{warning}</span></div>)}
          <div className="card-totals"><div><span>Combined odds</span><strong>{combined ? formatAmerican(combined) : "—"}</strong></div><div><span>Model joint probability</span><strong>{modelEstimate ? `${(modelEstimate.probability * 100).toFixed(1)}%` : "—"}</strong></div><div><span>Stake</span><div className="stake-input"><span>$</span><input type="number" min="1" value={stake} onChange={(event) => setStake(Number(event.target.value))} /></div></div><div><span>Potential return</span><strong>${payout.toFixed(2)}</strong></div></div>
          <button className="button button-primary full-button" onClick={save}><Save size={16} />{saved ? "Saved to paper ledger" : "Lock in paper mode"}</button>
        </div> : <div className="empty-state"><Calculator size={30} /><strong>Build from verified prices</strong>Add a fixture, market, and the current sportsbook price.</div>}
      </Panel>
    </div>
    <Notice>Locking saves an immutable local snapshot of the fixture, market, price, stake, and timestamp. No wager is placed.</Notice>
  </>;
}
