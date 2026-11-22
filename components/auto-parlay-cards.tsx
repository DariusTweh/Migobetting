"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowRight, Layers3, ShieldAlert } from "lucide-react";
import { useLocalMatchHistoryStatus } from "@/lib/use-local-history";
import { useOddsFeed } from "@/lib/use-odds-feed";
import { buildPricedCard, type PricedCard } from "@/lib/priced-cards";
import { snapshotAutoPaperParlays } from "@/lib/paper-parlays";
import { formatAmerican } from "@/lib/odds";
import { parlayAIContext } from "@/lib/ai-analysis";
import { AIReasoning } from "./ai-reasoning";
import type { Fixture } from "@/lib/types";
import { Panel, PanelHead } from "./ui";

const pct = (value: number) => (value * 100).toFixed(1) + "%";

function Card({ card }: { card: PricedCard }) {
  const title = card.kind === "daily-double" ? "Daily Double" : "Banger Card";
  const payload = encodeURIComponent(JSON.stringify(card.legs.map((leg) => ({
    fixtureId: leg.fixtureId, marketKey: leg.marketKey, bookKey: leg.bookKey,
  }))));
  return <Panel>
    <PanelHead title={title} meta={card.kind === "daily-double" ? "Real quoted odds · target +100 minimum" : "Real quoted odds · higher-risk +400 target"} />
    {card.legs.length ? <div className="suggested-card">
      <div className="suggested-card-summary">
        <span className="badge badge-good">{card.bookmaker} · QUOTED ODDS</span>
        <strong>{card.combinedAmerican === null ? "—" : formatAmerican(card.combinedAmerican)}
          <small>combined quoted price</small></strong>
      </div>
      <div className="suggested-legs">{card.legs.map((leg) => <div key={leg.fixtureId} className="suggested-leg">
        <div>
          <small>{leg.league} · {leg.source}</small>
          <b>{leg.fixtureLabel}</b>
          <strong>{leg.market}</strong>
        </div>
        <div className="quoted-leg-price">
          <b>{formatAmerican(leg.americanOdds)}</b>
          <small>Model {pct(leg.probability)}</small>
        </div>
      </div>)}</div>
      <div className="suggested-card-bottom">
        <span>Uncalibrated model-implied chance (independent fixtures)</span>
        <strong>{card.jointProbability !== null ? pct(card.jointProbability) : "—"}</strong>
      </div>
      <div className="model-warning"><ShieldAlert size={14}/><span>These are published bookmaker quotes, not guaranteed available at your location. Confirm prices before paper-locking. Model edge is not proven.</span></div>
      <AIReasoning
        kind="parlay"
        context={parlayAIContext(card)}
        fingerprint={card.kind + ":" + card.bookKey + ":" + JSON.stringify(card.legs.map((leg) =>
          [leg.fixtureId, leg.marketKey, leg.americanOdds, leg.updatedAt]))}
      />
      <Link className="button button-primary full-button" href={"/builder?mode=" + card.kind + "&selections=" + payload}>
        <Layers3 size={16}/> Open this priced slip <ArrowRight size={16}/>
      </Link>
    </div> : <div className="card-body">
      <div className="card-symbol"><Layers3 size={21}/></div>
      <strong>PASS · No qualifying {title}</strong>
      <p>{card.notes[0]} MIGO no longer fills a slip with -1100 selections simply to make its predicted win rate look high.</p>
      <Link className="button" href="/builder">Open builder <ArrowRight size={15}/></Link>
    </div>}
  </Panel>;
}

export function AutoParlayCards({ fixtures }: { fixtures: Fixture[] }) {
  const { matches: history, ready: historyReady } = useLocalMatchHistoryStatus();
  const { feed, loading, error } = useOddsFeed();
  const quotes = feed?.quotes ?? [];
  const double = buildPricedCard(fixtures, quotes, "daily-double", history);
  const banger = buildPricedCard(fixtures, quotes, "banger", history);
  useEffect(() => {
    if (!loading && feed && historyReady) snapshotAutoPaperParlays([double, banger]);
  }, [loading, feed, historyReady, double, banger]);
  return <div className="stack">
    {loading ? <div className="notice">Loading published market prices for upcoming fixtures…</div> : null}
    {error ? <div className="notice">Odds connection unavailable: {error}</div> : null}
    {feed ? <div className="notice">
      Odds feed: {feed.provider} · {quotes.length} matching quoted selections · updated {new Date(feed.fetchedAt).toLocaleTimeString()}.
      {feed.setupRequired ? " Add THERUNDOWN_API_KEY to .env.local for free DraftKings, FanDuel and BetMGM pre-match odds." : " Free data is delayed about five minutes."}
      {feed.errors.length ? " Some competitions have no usable quotes." : ""}
      {(double.legs.length || banger.legs.length) ? " Qualifying cards are automatically locked as $10 simulation tickets for forward grading." : ""}
    </div> : null}
    <Card card={double}/>
    <Card card={banger}/>
  </div>;
}
