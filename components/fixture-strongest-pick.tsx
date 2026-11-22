"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Fixture } from "@/lib/types";
import type { HistoricalMatch } from "@/lib/history";
import type { MarketQuote } from "@/lib/market-odds";
import { useOddsFeed } from "@/lib/use-odds-feed";
import { strongestModelPick } from "@/lib/strongest-pick";
import {
  readStrongestPicks, snapshotStrongestPick, type StrongestPickRecord,
} from "@/lib/strongest-record";
import { formatAmerican } from "@/lib/odds";
import { Panel, PanelHead } from "./ui";

const EMPTY_QUOTES: MarketQuote[] = [];

export function FixtureStrongestPick({
  fixture, history, historyReady,
}: {
  fixture: Fixture;
  history: HistoricalMatch[];
  historyReady: boolean;
}) {
  const canLock = fixture.status === "scheduled" && Date.parse(fixture.kickoff) > Date.now();
  const { feed, loading: oddsLoading } = useOddsFeed(canLock);
  const quotes = feed?.quotes ?? EMPTY_QUOTES;
  const [locked, setLocked] = useState<StrongestPickRecord | null>(null);

  useEffect(() => {
    const sync = () => {
      const saved = readStrongestPicks().find((item) =>
        item.fixtureId === fixture.id && item.leagueId === fixture.leagueId);
      setLocked(saved ?? null);
    };
    sync();
    window.addEventListener("migo:strongest", sync);
    return () => window.removeEventListener("migo:strongest", sync);
  }, [fixture.id, fixture.leagueId]);

  // A selected fixture can be more than 72h away; the Command Center keeps
  // its original 72h shortlist. Both share identical odds and market rules.
  const candidate = useMemo(
    () => canLock && historyReady && !oddsLoading
      ? strongestModelPick([fixture], quotes, history, Date.now(), Number.POSITIVE_INFINITY)
      : null,
    [canLock, historyReady, oddsLoading, fixture, quotes, history],
  );
  useEffect(() => {
    if (!candidate || !canLock || !historyReady || oddsLoading) return;
    const saved = snapshotStrongestPick(candidate, fixture, "fixture");
    if (saved) setLocked(saved);
  }, [candidate, fixture, canLock, historyReady, oddsLoading]);

  const visible = locked ?? candidate;
  const label = fixture.status === "final" ? "Pre-match strongest pick" : "Strongest Model Lean";
  const meta = locked ? "Recorded before kickoff · Paper Performance" :
    canLock ? "One selection for this match" : "Historical results are not retroactive predictions";

  return <Panel>
    <PanelHead title={label} meta={meta} />
    {visible ? <div className="fixture-strongest">
      <div className="fixture-strongest-heading">
        <strong>{visible.market}</strong>
        <span className={"badge " + (locked?.status === "won" ? "badge-good" :
          locked?.status === "lost" ? "badge-insufficient" : "badge-limited")}>
          {locked?.status === "won" ? "WON" : locked?.status === "lost" ? "LOST" :
            locked ? "TRACKED" : "MODEL LEAN"}
        </span>
      </div>
      <div className="fixture-strongest-numbers">
        <div><small>Model probability</small><strong>{(visible.probability * 100).toFixed(1)}%</strong></div>
        <div><small>Quoted odds</small><strong>{visible.quotedAmerican === null ? "—" : formatAmerican(visible.quotedAmerican)}</strong></div>
      </div>
      <div className="fixture-strongest-bottom">
        <span>{visible.bookmaker ?? "No qualified bookmaker quote"}
          {" · "}{locked ? "Saved " + new Date(locked.lockedAt).toLocaleString() : "Model only"}</span>
        {locked?.result ? <strong>Full time: {locked.result.homeGoals}–{locked.result.awayGoals}</strong> : null}
        {locked ? <Link href="/paper">View tracked record</Link> : null}
      </div>
    </div> :
      <div className="empty-state compact">
        <strong>{canLock ? historyReady && !oddsLoading ? "PASS" : "Loading match research…" : "No pre-match pick recorded"}</strong>
        {canLock ? historyReady && !oddsLoading ?
          "No qualifying model market for this fixture." :
          "Checking scoring history and available prices." :
          "MIGO only records strongest picks before kickoff; finished matches cannot be backfilled."}
      </div>}
  </Panel>;
}
