"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Layers3 } from "lucide-react";
import { useLocalMatchHistoryStatus } from "@/lib/use-local-history";
import { useOddsFeed } from "@/lib/use-odds-feed";
import { buildPricedCard, type PricedCard } from "@/lib/priced-cards";
import { strongestModelPick } from "@/lib/strongest-pick";
import { snapshotStrongestPick } from "@/lib/strongest-record";
import { snapshotAutoPaperParlays } from "@/lib/paper-parlays";
import { decimalToAmerican, formatAmerican } from "@/lib/odds";
import { todayUpcomingFixtures } from "@/lib/daily-slate";
import { formatDayLabel, todayKey } from "@/lib/date-time";
import type { Fixture } from "@/lib/types";
import type { MarketQuote } from "@/lib/market-odds";
import { Panel, PanelHead } from "./ui";

const pct = (p: number) => (p * 100).toFixed(1) + "%";
const EMPTY_QUOTES: MarketQuote[] = [];

function StrongestPick({ fixtures, quotes, history, ready, now }: {
  fixtures: Fixture[];
  quotes: NonNullable<ReturnType<typeof useOddsFeed>["feed"]>["quotes"];
  history: ReturnType<typeof useLocalMatchHistoryStatus>["matches"];
  ready: boolean;
  now: number;
}) {
  const pick = useMemo(() => ready ? strongestModelPick(fixtures, [], history, now, Number.POSITIVE_INFINITY) : null, [ready, fixtures, history, now]);
  useEffect(() => {
    if (!ready || !pick) return;
    const fixture = fixtures.find((item) => item.id === pick.fixtureId);
    if (fixture) snapshotStrongestPick(pick, fixture, "command-center");
  }, [ready, pick, fixtures]);
  return <Panel className="strongest-spotlight">
    <PanelHead title="Today’s Strongest Model Pick" meta="Today only · Pacific time · saved before kickoff" />
    {!ready ? <div className="empty-state compact">Loading match model history…</div> :
      pick ? <div className="top-pick">
        <div className="top-pick-top">
          <span className="badge badge-limited">MODEL LEAN · FAIR PRICE</span>
          <span>{pick.league} · {new Date(pick.kickoff).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
        <strong className="top-pick-match">{pick.fixtureLabel}</strong>
        <div className="top-pick-selection">{pick.market}</div>
        <div className="top-pick-numbers">
          <div><small>Model probability</small><strong>{pct(pick.probability)}</strong></div>
          <div><small>Model fair odds · not offered</small>
            <strong>{formatAmerican(decimalToAmerican(1 / pick.probability))}</strong></div>
        </div>
        <div className="top-pick-bottom">
          <span>Independent model lean · {pick.quality} data</span>
          <Link className="button" href={"/matches/" + pick.fixtureId}>View match <ArrowRight size={14}/></Link>
        </div>
      </div> : <div className="empty-state compact">
        <strong>PASS</strong>No eligible remaining matches today. Tomorrow’s picks stay on tomorrow’s card.
      </div>}
  </Panel>;
}

function Card({ card }: { card: PricedCard }) {
  const title = card.kind === "daily-double" ? "Daily Double" : "Banger";
  const payload = encodeURIComponent(JSON.stringify(card.legs.map((leg) => ({
    fixtureId: leg.fixtureId, marketKey: leg.marketKey,
    bookKey: card.pricing === "quoted" ? leg.bookKey : undefined,
  }))));
  return <Panel className="parlay-preview">
    <PanelHead title={title} meta={card.kind === "daily-double" ? "Today only · +100 target" : "Today only · +400 target"} />
    {card.legs.length ? <div className="suggested-card">
      <div className="suggested-card-summary">
        <span className={"badge " + (card.pricing === "quoted" ? "badge-good" : "badge-limited")}>
          {card.pricing === "quoted" ? card.bookmaker : "MIGO FAIR · NOT BOOK ODDS"}
        </span>
        <strong>{card.combinedAmerican === null ? "—" : formatAmerican(card.combinedAmerican)}
          <small>{card.pricing === "quoted" ? "Verified combined quote" : "Theoretical fair price only"}</small></strong>
      </div>
      <div className="suggested-legs">{card.legs.map((leg) => <div key={leg.fixtureId} className="suggested-leg">
        <div><small>{leg.league}</small><b>{leg.fixtureLabel}</b><strong>{leg.market}</strong></div>
        <div className="quoted-leg-price"><b>{formatAmerican(leg.americanOdds)}</b>
          <small>{card.pricing === "quoted" ? "BOOK QUOTE" : "MODEL FAIR"}</small>
          <small>{pct(leg.probability)} probability</small></div>
      </div>)}</div>
      <div className="suggested-card-bottom">
        <span>Estimated combined chance · not a bet quote</span><strong>{card.jointProbability === null ? "—" : pct(card.jointProbability)}</strong>
      </div>
      <Link className="button button-primary full-button" href={"/builder?mode=" + card.kind + "&selections=" + payload}>
        <Layers3 size={16}/>{card.pricing === "quoted" ? "Open quoted slip" : "Review fair picks"} <ArrowRight size={16}/>
      </Link>
      <small className="card-fair-disclaimer">{card.pricing === "quoted" ?
        "Bookmaker prices can move before placement." :
        "The displayed payout is a model break-even benchmark—not sportsbook availability or a guaranteed return. Enter real prices before saving a priced paper slip."}</small>
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
  // Refresh the today's slate as the calendar turns, without needing a page reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const slate = useMemo(() => todayUpcomingFixtures(fixtures, now), [fixtures, now]);
  const double = useMemo(() => buildPricedCard(slate, quotes, "daily-double", history, now), [slate, quotes, history, now]);
  const banger = useMemo(() => buildPricedCard(slate, quotes, "banger", history, now), [slate, quotes, history, now]);
  useEffect(() => {
    if (!loading && feed && historyReady) snapshotAutoPaperParlays([double, banger]);
  }, [loading, feed, historyReady, double, banger]);
  return <section className="migo-highlights" aria-label="MIGO picks and parlays">
    <div className="daily-slate-caption"><strong>{formatDayLabel(todayKey(new Date(now)))}</strong><span>{slate.length} upcoming matches left today · Pacific time</span></div>
    <StrongestPick fixtures={slate} quotes={quotes} history={history} ready={historyReady} now={now} />
    {error || feed?.setupRequired ? <div className="notice">Bookmaker odds unavailable · model-fair selections still generated. Fair prices are not offered sportsbook lines.</div> : null}
    <div className="parlay-preview-grid"><Card card={double} /><Card card={banger} /></div>
    <small className="top-pick-note">Today-only cards. MIGO selects from its full-time model, including alternative goal lines. Fair odds are mathematical break-even prices, not sportsbook quotes; no bet is placed.</small>
  </section>;
}
