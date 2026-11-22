"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { ArrowRight, Layers3 } from "lucide-react";
import { useLocalMatchHistoryStatus } from "@/lib/use-local-history";
import { useOddsFeed } from "@/lib/use-odds-feed";
import { buildPricedCard, type PricedCard } from "@/lib/priced-cards";
import { strongestModelPick } from "@/lib/strongest-pick";
import { snapshotStrongestPick } from "@/lib/strongest-record";
import { snapshotAutoPaperParlays } from "@/lib/paper-parlays";
import { formatAmerican } from "@/lib/odds";
import type { Fixture } from "@/lib/types";
import type { MarketQuote } from "@/lib/market-odds";
import { Panel, PanelHead } from "./ui";

const pct = (p: number) => (p * 100).toFixed(1) + "%";
const EMPTY_QUOTES: MarketQuote[] = [];

function StrongestPick({ fixtures, quotes, history, ready }: {
  fixtures: Fixture[];
  quotes: NonNullable<ReturnType<typeof useOddsFeed>["feed"]>["quotes"];
  history: ReturnType<typeof useLocalMatchHistoryStatus>["matches"];
  ready: boolean;
}) {
  const pick = useMemo(() => ready ? strongestModelPick(fixtures, quotes, history) : null, [ready, fixtures, quotes, history]);
  useEffect(() => {
    if (!ready || !pick) return;
    const fixture = fixtures.find((item) => item.id === pick.fixtureId);
    if (fixture) snapshotStrongestPick(pick, fixture, "command-center");
  }, [ready, pick, fixtures]);
  return <Panel>
    <PanelHead title="Strongest Model Pick" meta="Next 72 hours · recorded before kickoff" />
    {!ready ? <div className="empty-state compact">Loading match data and odds…</div> :
      pick ? <div className="top-pick">
        <div className="top-pick-top">
          <span className={"badge " + (pick.pricing === "quoted" ? "badge-good" : "badge-limited")}>
            {pick.pricing === "quoted" ? "PRICED" : "MODEL LEAN"}
          </span>
          <span>{pick.league} · {new Date(pick.kickoff).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
        <strong className="top-pick-match">{pick.fixtureLabel}</strong>
        <div className="top-pick-selection">{pick.market}</div>
        <div className="top-pick-numbers">
          <div><small>Model probability</small><strong>{pct(pick.probability)}</strong></div>
          <div><small>{pick.pricing === "quoted" ? "Quoted American odds" : "Bookmaker odds"}</small>
            <strong>{pick.quotedAmerican !== null ? formatAmerican(pick.quotedAmerican) : "Unavailable"}</strong></div>
        </div>
        <p className="top-pick-evidence">{pick.evidence}</p>
        <div className="top-pick-bottom">
          <span>{pick.pricing === "quoted" ? pick.bookmaker + " · " + pick.quality + " data" :
            "No qualifying quote · " + pick.quality + " data"}</span>
          <Link className="button" href={"/matches/" + pick.fixtureId}>Match breakdown <ArrowRight size={14}/></Link>
        </div>
      </div> : <div className="empty-state compact">
        <strong>PASS</strong>No supported pick in the next 72 hours.
      </div>}
  </Panel>;
}

function Card({ card }: { card: PricedCard }) {
  const title = card.kind === "daily-double" ? "Daily Double" : "Banger";
  const payload = encodeURIComponent(JSON.stringify(card.legs.map((leg) => ({
    fixtureId: leg.fixtureId, marketKey: leg.marketKey, bookKey: leg.bookKey,
  }))));
  return <Panel>
    <PanelHead title={title} meta={card.kind === "daily-double" ? "+100 target" : "+400 target"} />
    {card.legs.length ? <div className="suggested-card">
      <div className="suggested-card-summary">
        <span className="badge badge-good">{card.bookmaker}</span>
        <strong>{card.combinedAmerican === null ? "—" : formatAmerican(card.combinedAmerican)}
          <small>Combined quote</small></strong>
      </div>
      <div className="suggested-legs">{card.legs.map((leg) => <div key={leg.fixtureId} className="suggested-leg">
        <div><small>{leg.league}</small><b>{leg.fixtureLabel}</b><strong>{leg.market}</strong></div>
        <div className="quoted-leg-price"><b>{formatAmerican(leg.americanOdds)}</b><small>{pct(leg.probability)} model</small></div>
      </div>)}</div>
      <div className="suggested-card-bottom">
        <span>Estimated combined chance</span><strong>{card.jointProbability === null ? "—" : pct(card.jointProbability)}</strong>
      </div>
      <Link className="button button-primary full-button" href={"/builder?mode=" + card.kind + "&selections=" + payload}>
        <Layers3 size={16}/> Open slip <ArrowRight size={16}/>
      </Link>
    </div> : <div className="card-body card-body-compact">
      <strong>PASS</strong><p>{card.notes[0]}</p>
      <Link className="button" href="/builder">Build manually <ArrowRight size={14}/></Link>
    </div>}
  </Panel>;
}

export function AutoParlayCards({ fixtures }: { fixtures: Fixture[] }) {
  const { matches: history, ready: historyReady } = useLocalMatchHistoryStatus();
  const { feed, loading, error } = useOddsFeed();
  const quotes = feed?.quotes ?? EMPTY_QUOTES;
  const double = useMemo(() => buildPricedCard(fixtures, quotes, "daily-double", history), [fixtures, quotes, history]);
  const banger = useMemo(() => buildPricedCard(fixtures, quotes, "banger", history), [fixtures, quotes, history]);
  useEffect(() => {
    if (!loading && feed && historyReady) snapshotAutoPaperParlays([double, banger]);
  }, [loading, feed, historyReady, double, banger]);
  return <div className="stack">
    <StrongestPick fixtures={fixtures} quotes={quotes} history={history} ready={historyReady && !loading} />
    {error ? <div className="notice">Odds unavailable · model-only picks shown.</div> :
      feed?.setupRequired ? <div className="notice">Add TheRundown key for quoted picks.</div> : null}
    <Card card={double} />
    <Card card={banger} />
    <small className="top-pick-note">Model estimates are not calibrated win rates. Quotes may change; no bet is placed.</small>
  </div>;
}
