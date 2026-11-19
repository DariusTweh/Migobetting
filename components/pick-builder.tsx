"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Layers3, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { PageHeader, Panel, PanelHead, Notice } from "./ui";
import type { Fixture } from "@/lib/types";
import { americanToDecimal, decimalToAmerican, formatAmerican, impliedProbability } from "@/lib/odds";
import { estimateParlayProbability } from "@/lib/parlay";
import { buildResearchCard } from "@/lib/auto-cards";
import { createPaperParlay, savePaperParlay } from "@/lib/paper-parlays";

type Leg = { id: string; fixtureId: string; market: string; odds: number | null };
type CardKind = "daily-double" | "banger" | "manual";
const MARKETS = ["Home win", "Draw", "Away win", "Home or draw", "Away or draw", "Over 1.5 goals", "Over 2.5 goals", "Under 3.5 goals", "Both teams to score"];
const MARKET_KEYS: Record<string, string> = {
  "home": "Home win", "draw": "Draw", "away": "Away win",
  "home-draw": "Home or draw", "away-draw": "Away or draw",
  "over-1.5": "Over 1.5 goals", "over-2.5": "Over 2.5 goals",
  "under-3.5": "Under 3.5 goals", "btts": "Both teams to score",
};

export function PickBuilder({ fixtures }: { fixtures: Fixture[] }) {
  const [fixtureId, setFixtureId] = useState(fixtures.find((f) => f.status === "scheduled")?.id ?? fixtures[0]?.id ?? "");
  const [market, setMarket] = useState("Home win");
  const [odds, setOdds] = useState(-110);
  const [stake, setStake] = useState(10);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [kind, setKind] = useState<CardKind>("manual");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const selectedFixture = fixtures.find((f) => f.id === fixtureId);
  const fixtureMap = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);
  const duplicateFixture = new Set(legs.map((leg) => leg.fixtureId)).size < legs.length;
  const allPriced = legs.length > 0 && legs.every((leg) => Number.isFinite(leg.odds) && leg.odds !== 0 && leg.odds !== null);
  const decimal = useMemo(() => allPriced ? legs.reduce((product, leg) => product * americanToDecimal(leg.odds!), 1) : null, [legs, allPriced]);
  const combined = decimal === null ? null : decimalToAmerican(decimal);
  const payout = decimal === null ? null : stake * decimal;
  const modelEstimate = useMemo(() => legs.length ? estimateParlayProbability(legs, fixtures) : null, [legs, fixtures]);

  function autoBuild(target: "daily-double" | "banger") {
    const suggested = buildResearchCard(fixtures, target);
    if (!suggested.legs.length) {
      setNotice("PASS: no qualified upcoming " + (target === "daily-double" ? "Daily Double" : "Banger") + " card.");
      setSaved(false);
      return;
    }
    setLegs(suggested.legs.map((leg) => ({
      id: crypto.randomUUID(), fixtureId: leg.fixtureId,
      market: MARKET_KEYS[leg.marketKey] ?? leg.market, odds: null,
    })));
    setKind(target);
    setNotice("MIGO loaded the " + target + " research card. Enter REAL sportsbook odds for every leg before paper-locking it.");
    setSaved(false);
  }

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "daily-double" || mode === "banger") autoBuild(mode);
    // Initial URL import is intentionally performed once for the loaded fixture list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addLeg() {
    if (!selectedFixture || selectedFixture.status !== "scheduled" || Date.parse(selectedFixture.kickoff) <= Date.now()) {
      setNotice("Choose an upcoming match before adding a selection.");
      return;
    }
    if (!Number.isFinite(odds) || odds === 0) { setNotice("Enter a valid nonzero American price."); return; }
    if (legs.some((leg) => leg.fixtureId === fixtureId)) {
      setNotice("One leg per fixture for now. Same-game correlations require separate modeling.");
      return;
    }
    setLegs((current) => [...current, { id: crypto.randomUUID(), fixtureId, market, odds }]);
    setKind("manual"); setSaved(false); setNotice("");
  }

  function updateLeg(id: string, raw: string) {
    const price = raw.trim() ? Number(raw) : null;
    setLegs((current) => current.map((leg) => leg.id === id ? { ...leg, odds: price } : leg));
    setSaved(false);
  }

  function save() {
    setSaved(false);
    if (!allPriced || duplicateFixture || !Number.isFinite(stake) || stake <= 0) {
      setNotice("Enter actual nonzero American odds for every leg, use different fixtures, and choose a positive stake.");
      return;
    }
    try {
      const card = createPaperParlay({
        kind, stake,
        legs: legs.map((leg) => {
          const fixture = fixtureMap.get(leg.fixtureId);
          if (!fixture || leg.odds === null) throw new Error("One or more fixtures/prices are unavailable.");
          return {
            fixtureId: fixture.id, fixtureLabel: fixture.home.shortName + " vs " + fixture.away.shortName,
            leagueId: fixture.leagueId, kickoff: fixture.kickoff,
            market: leg.market, americanOdds: leg.odds,
          };
        }),
      });
      savePaperParlay(card);
      setSaved(true);
      setNotice("Combined paper parlay saved as ONE ticket. No real bet has been placed.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not lock paper card"); }
  }

  return <>
    <PageHeader eyebrow="Research and paper parlays" title="Pick Builder" description="Generate Daily Double and Banger cards, enter real sportsbook prices, and track the complete parlay as one paper ticket." />
    <div className="lab-tabs">
      <button onClick={() => autoBuild("daily-double")}><Layers3 size={16}/> Generate Daily Double</button>
      <button onClick={() => autoBuild("banger")}><Layers3 size={16}/> Generate Banger</button>
      <button onClick={() => { setLegs([]); setKind("manual"); setSaved(false); setNotice(""); }}>Clear card</button>
    </div>
    {notice ? <div className="lineup-explanation">{notice}</div> : null}
    <div className="builder-layout">
      <Panel>
        <PanelHead title="Add a selection manually" meta="Only real, user-entered prices count as quotes" />
        <div className="builder-form">
          <div className="field"><label>Fixture</label><select className="select" value={fixtureId} onChange={(event) => setFixtureId(event.target.value)}>{fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.home.shortName} vs {fixture.away.shortName} · {fixture.league}</option>)}</select></div>
          <div className="form-grid">
            <div className="field"><label>Market</label><select className="select" value={market} onChange={(event) => setMarket(event.target.value)}>{MARKETS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label>American odds</label><input className="input" type="number" value={odds} onChange={(event) => setOdds(Number(event.target.value))} /><small>Implied probability: {odds ? (impliedProbability(odds) * 100).toFixed(1) : "—"}%</small></div>
          </div>
          <button className="button button-primary" onClick={addLeg} disabled={!selectedFixture}><Plus size={16}/> Add selection</button>
        </div>
      </Panel>
      <Panel>
        <PanelHead title={kind === "daily-double" ? "Daily Double paper slip" : kind === "banger" ? "Banger paper slip" : "Custom paper parlay"} meta={legs.length ? legs.length + " selected legs" : "Nothing added"} />
        {legs.length ? <div className="builder-card">
          <div className="leg-list">{legs.map((leg) => { const fixture = fixtureMap.get(leg.fixtureId); return <div className="leg-row" key={leg.id}>
            <div><span>{fixture?.league}</span><strong>{leg.market}</strong><small>{fixture?.home.shortName} vs {fixture?.away.shortName}</small><label className="field"><small>Actual American price (manual)</small><input className="input" style={{ maxWidth: 185 }} type="number" placeholder="-150 or +120" value={leg.odds ?? ""} onChange={(event) => updateLeg(leg.id, event.target.value)} /></label></div>
            <b>{leg.odds === null || leg.odds === 0 ? "NEEDS PRICE" : formatAmerican(leg.odds)}</b>
            <button className="icon-button" onClick={() => setLegs((current) => current.filter((item) => item.id !== leg.id))} aria-label="Remove leg"><Trash2 size={16}/></button>
          </div>; })}</div>
          {duplicateFixture ? <div className="correlation-warning"><TriangleAlert size={16}/> Duplicate fixtures are not allowed for the current parlay generator.</div> : null}
          {modelEstimate?.warnings.map((warning) => <div className="model-warning" key={warning}><TriangleAlert size={14}/><span>{warning}</span></div>)}
          <div className="card-totals">
            <div><span>Combined actual odds</span><strong>{combined === null ? "Waiting for prices" : formatAmerican(combined)}</strong></div>
            <div><span>Uncalibrated model probability</span><strong>{modelEstimate ? (modelEstimate.probability * 100).toFixed(1) + "%" : "—"}</strong></div>
            <div><span>Stake</span><div className="stake-input"><span>$</span><input type="number" min="1" value={stake} onChange={(event) => setStake(Number(event.target.value))}/></div></div>
            <div><span>Potential gross return</span><strong>{payout === null ? "—" : "$" + payout.toFixed(2)}</strong></div>
          </div>
          {kind === "daily-double" && combined !== null && combined < 100 ? <div className="model-warning"><TriangleAlert size={14}/>Actual entered prices do not reach the +100 Daily Double target.</div> : null}
          <button className="button button-primary full-button" disabled={!allPriced || duplicateFixture || saved || (kind === "daily-double" && combined !== null && combined < 100)} onClick={save}><Save size={16}/>{saved ? "Saved to paper parlays" : "Lock complete paper parlay"}</button>
        </div> : <div className="empty-state"><Calculator size={30}/><strong>Pick a research card</strong>Generate a Daily Double or Banger above, or build manually. MIGO never invents bookmaker prices.</div>}
      </Panel>
    </div>
    <Notice>A model-only research card is not a priced bet. Enter actual odds to calculate payouts. The ticket is a single paper parlay; no real wager is placed.</Notice>
  </>;
}
