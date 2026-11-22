"use client";

import { useEffect, useMemo, useState } from "react";
import { useOddsFeed } from "@/lib/use-odds-feed";
import { buildPricedCard } from "@/lib/priced-cards";
import { forecastWithHistory } from "@/lib/historical-forecast";
import { Calculator, Layers3, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { PageHeader, Panel, PanelHead, Notice } from "./ui";
import type { Fixture } from "@/lib/types";
import { americanToDecimal, decimalToAmerican, formatAmerican, impliedProbability } from "@/lib/odds";
import { useLocalMatchHistory } from "@/lib/use-local-history";
import { createPaperParlay, savePaperParlay } from "@/lib/paper-parlays";

type Leg = { id: string; fixtureId: string; market: string; odds: number | null; bookKey?: string; bookmaker?: string; quoteSource?: string; quoteUpdatedAt?: string };
type CardKind = "daily-double" | "banger" | "manual";
const MARKETS = ["Home win", "Draw", "Away win", "Home or draw", "Away or draw", "Over 1.5 goals", "Over 2.5 goals", "Under 3.5 goals", "Both teams to score"];
const MARKET_KEYS: Record<string, string> = {
  "home": "Home win", "draw": "Draw", "away": "Away win",
  "home-draw": "Home or draw", "away-draw": "Away or draw",
  "over-1.5": "Over 1.5 goals", "over-2.5": "Over 2.5 goals",
  "under-3.5": "Under 3.5 goals", "btts": "Both teams to score",
};

export function PickBuilder({ fixtures }: { fixtures: Fixture[] }) {
  const history = useLocalMatchHistory();
  const { feed, loading: oddsLoading, error: oddsError } = useOddsFeed();
  const [initializedFromUrl, setInitializedFromUrl] = useState(false);
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
  const modelEstimate = useMemo(() => {
    if (!legs.length) return null;
    let probability = 1;
    for (const leg of legs) {
      const fixture = fixtureMap.get(leg.fixtureId);
      const key = Object.entries(MARKET_KEYS).find(([, label]) => label === leg.market)?.[0];
      if (!fixture || !key) return null;
      const market = forecastWithHistory(fixture, history).markets.find((m) => m.key === key);
      if (!market) return null;
      probability *= market.probability;
    }
    return { probability };
  }, [legs, fixtureMap, history]);

  function autoBuild(target: "daily-double" | "banger") {
    const proposed = buildPricedCard(fixtures, feed?.quotes ?? [], target, history);
    if (!proposed.legs.length) {
      setLegs([]); setKind(target); setSaved(false);
      setNotice(proposed.notes[0] + (feed?.setupRequired ? " Configure your free THERUNDOWN_API_KEY to unlock quoted prices." : ""));
      return;
    }
    setLegs(proposed.legs.map((leg) => ({
      id: crypto.randomUUID(), fixtureId: leg.fixtureId,
      market: MARKET_KEYS[leg.marketKey] ?? leg.market, odds: leg.americanOdds,
      bookKey: leg.bookKey, bookmaker: leg.bookmaker, quoteSource: leg.source,
      quoteUpdatedAt: leg.updatedAt,
    })));
    setKind(target); setSaved(false);
    setNotice("Loaded a qualified " + target + " priced card from " + proposed.bookmaker +
      ". Quotes are indicative, may be delayed, and must be checked before use.");
  }

  useEffect(() => {
    if (oddsLoading || initializedFromUrl) return;
    setInitializedFromUrl(true);
    const search = new URLSearchParams(window.location.search);
    const mode = search.get("mode");
    if (mode !== "daily-double" && mode !== "banger") return;
    const encoded = search.get("selections");
    if (encoded) {
      try {
        const decoded: unknown = JSON.parse(encoded);
        if (Array.isArray(decoded) && decoded.length >= 2 && decoded.length <= 6) {
          const imported: Leg[] = decoded.flatMap((raw: unknown) => {
            const item = raw as { fixtureId?: string; marketKey?: string; bookKey?: string };
            const fixture = fixtures.find((candidate) => candidate.id === item.fixtureId);
            const canonical = item.marketKey ? MARKET_KEYS[item.marketKey] : undefined;
            if (!fixture || !canonical || fixture.status !== "scheduled" || Date.parse(fixture.kickoff) <= Date.now()) return [];
            const quote = (feed?.quotes ?? []).find((q) =>
              q.fixtureId === item.fixtureId && q.marketKey === item.marketKey && q.bookKey === item.bookKey);
            return [{
              id: crypto.randomUUID(), fixtureId: fixture.id, market: canonical,
              odds: quote?.americanOdds ?? null, bookKey: quote?.bookKey,
              bookmaker: quote?.bookmaker, quoteSource: quote?.source, quoteUpdatedAt: quote?.updatedAt,
            }];
          });
          if (imported.length === decoded.length && new Set(imported.map((x) => x.fixtureId)).size === imported.length) {
            setLegs(imported); setKind(mode); setSaved(false);
            setNotice(imported.every((leg) => leg.odds !== null)
              ? "Imported the exact quoted slip from Command Center. Recheck bookmaker prices before paper-locking."
              : "Imported your selected markets; some old prices are no longer available. Enter the missing current odds manually.");
            return;
          }
        }
      } catch { /* Untrusted URL selection; use freshly retrieved quotes instead. */ }
    }
    autoBuild(mode);
    // Hydrate once after the current quote feed has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oddsLoading, initializedFromUrl, feed, fixtures]);

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
    setLegs((current) => current.map((leg) => leg.id === id ? { ...leg, odds: price, bookmaker: undefined, bookKey: undefined, quoteSource: undefined, quoteUpdatedAt: undefined } : leg));
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
            bookmaker: leg.bookmaker, oddsSource: leg.quoteSource, quoteUpdatedAt: leg.quoteUpdatedAt,
          };
        }),
      });
      savePaperParlay(card);
      setSaved(true);
      setNotice("Combined paper parlay saved as ONE ticket. No real bet has been placed.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not lock paper card"); }
  }

  return <>
    <PageHeader eyebrow="Research and paper parlays" title="Pick Builder" description="Build, price, and save paper parlays." />
    <div className="lab-tabs">
      <button onClick={() => autoBuild("daily-double")}><Layers3 size={16}/> Generate Daily Double</button>
      <button onClick={() => autoBuild("banger")}><Layers3 size={16}/> Generate Banger</button>
      <button onClick={() => { setLegs([]); setKind("manual"); setSaved(false); setNotice(""); }}>Clear card</button>
    </div>
    <div className="notice">Odds provider: {oddsLoading ? "Loading…" : feed?.provider ?? "Unavailable"}. {feed?.setupRequired ? "TheRundown free key not yet configured." : "Only currently quoted prices are used for automatic parlays."}{oddsError ? " " + oddsError : ""}</div>
    {notice ? <div className="lineup-explanation">{notice}</div> : null}
    <div className="builder-layout">
      <Panel>
        <PanelHead title="Add a leg" meta="Enter the odds shown by your bookmaker" />
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
            <div><span>{fixture?.league}</span><strong>{leg.market}</strong><small>{fixture?.home.shortName} vs {fixture?.away.shortName}</small><label className="field"><small>{leg.bookmaker ? leg.bookmaker + " · " + leg.quoteSource + " · quoted " + (leg.quoteUpdatedAt ? new Date(leg.quoteUpdatedAt).toLocaleTimeString() : "time unknown") : "Manually entered American odds"}</small><input className="input" style={{ maxWidth: 185 }} type="number" placeholder="-150 or +120" value={leg.odds ?? ""} onChange={(event) => updateLeg(leg.id, event.target.value)} /></label></div>
            <b>{leg.odds === null || leg.odds === 0 ? "NEEDS PRICE" : formatAmerican(leg.odds)}</b>
            <button className="icon-button" onClick={() => setLegs((current) => current.filter((item) => item.id !== leg.id))} aria-label="Remove leg"><Trash2 size={16}/></button>
          </div>; })}</div>
          {duplicateFixture ? <div className="correlation-warning"><TriangleAlert size={16}/> Duplicate fixtures are not allowed for the current parlay generator.</div> : null}
          <div className="model-warning"><TriangleAlert size={14}/><span>Model probability is uncalibrated; combined legs assume independence.</span></div>
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
    <Notice>Paper only · quotes can change · manual odds are unverified.</Notice>
  </>;
}
