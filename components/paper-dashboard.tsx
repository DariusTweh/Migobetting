"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, WalletCards } from "lucide-react";
import { getBankroll, getPaperBets } from "./local-storage";
import { Metric, Notice, PageHeader, Panel, PanelHead } from "./ui";
import { formatAmerican } from "@/lib/odds";
import type { PaperBet } from "@/lib/types";
import { applyPaperParlayResults, readPaperParlays, type PaperParlay } from "@/lib/paper-parlays";
import { applyFinalResults, readForwardPredictions, type ForwardPrediction } from "@/lib/forward-store";
import { applyStrongestPickResults, readStrongestPicks, type StrongestPickRecord } from "@/lib/strongest-record";
import { RecentThreeDayReview } from "./recent-three-day-review";

export function PaperDashboard() {
  const [bets, setBets] = useState<PaperBet[]>([]);
  const [parlays, setParlays] = useState<PaperParlay[]>([]);
  const [bankroll, setBankroll] = useState(1000);
  const [forward, setForward] = useState<ForwardPrediction[]>([]);
  const [strongest, setStrongest] = useState<StrongestPickRecord[]>([]);
  const [checkingResults, setCheckingResults] = useState(false);
  const [resultError, setResultError] = useState("");
  const checkingRef = useRef(false);
  useEffect(() => { const load = () => { setBets(getPaperBets()); setParlays(readPaperParlays()); setBankroll(getBankroll()); }; load(); window.addEventListener("migo:storage", load); return () => window.removeEventListener("migo:storage", load); }, []);
  useEffect(() => { const load = () => setForward(readForwardPredictions()); load(); window.addEventListener("migo:forward", load); return () => window.removeEventListener("migo:forward", load); }, []);
  useEffect(() => {
    const load = () => setStrongest(readStrongestPicks());
    load();
    window.addEventListener("migo:strongest", load);
    return () => window.removeEventListener("migo:strongest", load);
  }, []);

  async function refreshPaperResults() {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setCheckingResults(true);
    setResultError("");
    try {
      const now = Date.now();
      const pendingParlays = readPaperParlays().flatMap((card) => card.legs)
        .filter((leg) => !leg.result && Date.parse(leg.kickoff) < now);
      const pendingForward = readForwardPredictions().filter((pick) =>
        pick.status === "open" && Date.parse(pick.kickoff) < now);
      const pendingStrongest = readStrongestPicks().filter((pick) =>
        pick.status === "open" && Date.parse(pick.kickoff) < now);
      const events = [...new Map([
        ...pendingParlays.map((leg) => ({ fixtureId: leg.fixtureId, leagueId: leg.leagueId })),
        ...pendingForward.map((pick) => ({ fixtureId: pick.fixtureId, leagueId: pick.leagueId })),
        ...pendingStrongest.map((pick) => ({ fixtureId: pick.fixtureId, leagueId: pick.leagueId })),
      ].map((event) => [event.leagueId + ":" + event.fixtureId, event])).values()];
      if (!events.length) return;

      // The results endpoint accepts up to 50 events per request.
      const results: Parameters<typeof applyStrongestPickResults>[0] = [];
      for (let start = 0; start < events.length; start += 50) {
        const response = await fetch("/api/results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: events.slice(start, start + 50) }),
        });
        if (!response.ok) throw new Error("ESPN final-score check failed (HTTP " + response.status + ")");
        const payload = await response.json() as { results?: typeof results };
        if (!Array.isArray(payload.results)) throw new Error("Final-score provider returned an invalid response");
        results.push(...payload.results);
      }
      setParlays(applyPaperParlayResults(results));
      setForward(applyFinalResults(results));
      setStrongest(applyStrongestPickResults(results));
    } catch (error) {
      setResultError(error instanceof Error ? error.message : "Could not refresh final scores");
    } finally {
      checkingRef.current = false;
      setCheckingResults(false);
    }
  }

  useEffect(() => { void refreshPaperResults(); /* run once per page visit */ }, []);
  const graded = bets.filter((bet) => bet.status !== "open");
  const profit = useMemo(() => graded.reduce((sum, bet) => sum + (bet.payout ?? 0) - bet.stake, 0), [graded]);
  const won = graded.filter((bet) => bet.status === "won").length;
  const gradedParlays = parlays.filter((parlay) => parlay.status !== "open");
  const parlayProfit = gradedParlays.reduce((sum, card) => sum + (card.payout ?? 0) - card.stake, 0);
  const totalProfit = profit + parlayProfit;
  const gradedCount = graded.length + gradedParlays.length;
  const totalWon = won + gradedParlays.filter((card) => card.status === "won").length;
  const gradedForward = forward.filter((item) => item.status === "graded");
  const autoTracked = parlays.filter((card) => card.origin === "migo-auto").length;
  const strongestWins = strongest.filter((pick) => pick.status === "won").length;
  const strongestLosses = strongest.filter((pick) => pick.status === "lost").length;
  const strongestGraded = strongestWins + strongestLosses;
  const strongestOpen = strongest.filter((pick) => pick.status === "open").length;
  return <>
    <PageHeader eyebrow="Simulation only" title="Paper Performance" description="Forward-test locked decisions without changing a prediction after the result is known." action={<Link href="/builder" className="button button-primary"><Plus size={16} />New paper pick</Link>} />
    <div className="paper-banner"><span className="paper-pill"><span /> PAPER MODE</span><p>No real money is wagered. Records live only in this browser.</p></div>
    <div className="metrics-grid">
      <Metric label="Starting bankroll" value={`$${bankroll.toFixed(2)}`} sub="local setting" />
      <Metric label="Open selections" value={String(bets.filter((bet) => bet.status === "open").length + parlays.filter((card) => card.status === "open").length)} sub="awaiting result" tone="orange" />
      <Metric label="Graded selections" value={String(gradedCount)} sub={gradedCount ? `${Math.round(totalWon / gradedCount * 100)}% hit rate` : "no results yet"} />
      <Metric label="Simulated P/L" value={gradedCount ? `${totalProfit >= 0 ? "+" : "-"}$${Math.abs(totalProfit).toFixed(2)}` : "—"} sub="graded singles and parlays" tone={totalProfit > 0 ? "green" : "default"} />
    </div>
    <RecentThreeDayReview strongest={strongest} forward={forward} />
    <Panel className="strongest-ledger">
      <PanelHead title="Strongest Pick Record" meta="Pre-match picks · checked against ESPN final scores"
        action={<button className="button" disabled={checkingResults} onClick={() => void refreshPaperResults()}>
          {checkingResults ? "Checking…" : "Refresh results"}</button>} />
      <div className="strongest-record-metrics">
        <div><span>Win–Loss</span><strong>{strongestWins}–{strongestLosses}</strong></div>
        <div><span>Hit rate</span><strong>{strongestGraded ? (100 * strongestWins / strongestGraded).toFixed(1) + "%" : "—"}</strong></div>
        <div><span>Tracked</span><strong>{strongest.length}</strong></div>
        <div><span>Awaiting final</span><strong>{strongestOpen}</strong></div>
      </div>
      {resultError ? <div className="lineup-explanation">{resultError}</div> : null}
      {strongest.length ? <div className="strongest-record-list">
        {strongest.slice().sort((a, b) => b.lockedAt.localeCompare(a.lockedAt)).map((pick) => <div className="strongest-record-row" key={pick.id}>
          <div className="strongest-record-main">
            <strong>{pick.fixtureLabel}</strong>
            <span>{pick.league} · {pick.market} · {(pick.probability * 100).toFixed(1)}% model</span>
            <small>{pick.quotedAmerican === null ? "Unpriced lean" :
              (pick.bookmaker ?? "Bookmaker") + " " + formatAmerican(pick.quotedAmerican)}
              {" · "}Recorded {new Date(pick.lockedAt).toLocaleString()}</small>
          </div>
          <div className="strongest-record-result">
            <span className={"badge " + (pick.status === "won" ? "badge-good" :
              pick.status === "lost" ? "badge-insufficient" : "badge-limited")}>
              {pick.status === "won" ? "WON" : pick.status === "lost" ? "LOST" : "PENDING"}
            </span>
            {pick.result ? <strong>{pick.result.homeGoals}–{pick.result.awayGoals}</strong> : <small>Awaiting FT</small>}
          </div>
        </div>)}
      </div> : <div className="empty-state compact"><strong>No strongest picks tracked yet</strong>
        Open Command Center or a future fixture before kickoff to start a record. Past results are not backfilled.
      </div>}
      <p className="strongest-record-foot">Only selections stored before kickoff count. This browser keeps the record; clearing site data or using another device will not preserve it.</p>
    </Panel>
    <Panel>
      <PanelHead title="Locked selection ledger" meta={`${bets.length} local records`} />
      {bets.length ? <div className="paper-table"><div className="paper-table-head"><span>Fixture / market</span><span>Price</span><span>Stake</span><span>Status</span></div>{bets.map((bet) => <div className="paper-row" key={bet.id}><div><strong>{bet.fixtureLabel}</strong><small>{bet.market} · locked {new Date(bet.lockedAt).toLocaleString()}</small></div><b>{formatAmerican(bet.americanOdds)}</b><span>${bet.stake.toFixed(2)}</span><span className={`badge ${bet.status === "open" ? "badge-limited" : bet.status === "won" ? "badge-good" : "badge-insufficient"}`}>{bet.status}</span></div>)}</div> : <div className="empty-state"><WalletCards size={32} /><strong>No paper selections yet</strong>Build a card and lock it before kickoff to start a forward-testing record.</div>}
    </Panel>
    <Panel>
      <PanelHead title="Locked paper parlays" meta={`${parlays.length} complete tickets · ${autoTracked} MIGO auto-tracked`} />
      {parlays.length ? <div className="paper-table">
        <div className="paper-table-head"><span>Slip / legs</span><span>Combined price</span><span>Stake</span><span>Status</span></div>
        {parlays.map((card) => <div className="paper-row" key={card.id}>
          <div><strong>{card.origin === "migo-auto" ? "MIGO auto-tracked " : ""}{card.kind === "daily-double" ? "Daily Double" : card.kind === "banger" ? "Banger" : "Custom parlay"} · {card.legs.length} legs</strong>
            {card.legs.map((leg) => <small key={leg.fixtureId}>{leg.fixtureLabel}: {leg.market} ({formatAmerican(leg.americanOdds)}){leg.result ? ` — ${leg.result.status.toUpperCase()} ${leg.result.homeGoals}–${leg.result.awayGoals}` : " — awaiting final"}</small>)}
            <small>Locked {new Date(card.lockedAt).toLocaleString()}{card.status !== "open" ? ` · return $${(card.payout ?? 0).toFixed(2)} · P/L ${(card.payout ?? 0) - card.stake >= 0 ? "+" : "-"}$${Math.abs((card.payout ?? 0) - card.stake).toFixed(2)}` : ""}</small>
          </div>
          <b>{formatAmerican(card.decimalOdds >= 2 ? Math.round((card.decimalOdds - 1) * 100) : Math.round(-100 / (card.decimalOdds - 1)))}</b>
          <span>${card.stake.toFixed(2)}</span>
          <span className={`badge ${card.status === "won" ? "badge-good" : card.status === "lost" ? "badge-insufficient" : "badge-limited"}`}>{card.status.toUpperCase()}</span>
        </div>)}
      </div> : <div className="empty-state compact"><strong>No parlays locked yet</strong>Use Pick Builder to generate and price a Daily Double or Banger.</div>}
    </Panel>
    <Panel className="forward-panel">
      <PanelHead title="MIGO forward validation" meta="Automatically locked before kickoff and graded from ESPN finals" />
      <div className="forward-summary"><div><span>Locked forecasts</span><strong>{forward.length}</strong></div><div><span>Graded outcomes</span><strong>{gradedForward.length}</strong></div><div><span>Outcome accuracy</span><strong>{gradedForward.length ? `${Math.round(gradedForward.filter((item) => item.correct).length / gradedForward.length * 100)}%` : "—"}</strong></div><div><span>Average Brier</span><strong>{gradedForward.length ? (gradedForward.reduce((sum, item) => sum + (item.brier ?? 0), 0) / gradedForward.length).toFixed(4) : "—"}</strong></div></div>
      {forward.length ? <div className="forward-list">{forward.slice().reverse().slice(0, 12).map((item) => <div key={item.id}><div><strong>{item.fixtureLabel}</strong><small>{item.modelVersion}{item.modelInputs ? ` · goals ${item.modelInputs.expectedHomeGoals.toFixed(2)}–${item.modelInputs.expectedAwayGoals.toFixed(2)} · ρ ${item.modelInputs.lowScoreCorrelation.toFixed(2)}` : ""} · locked {new Date(item.lockedAt).toLocaleString()}</small></div><span className={`badge ${item.status === "graded" ? item.correct ? "badge-good" : "badge-insufficient" : "badge-limited"}`}>{item.status === "graded" ? item.correct ? "Correct" : "Incorrect" : "Awaiting final"}</span>{item.actual ? <b>{item.actual.homeGoals}–{item.actual.awayGoals}</b> : <b>{item.predictedOutcome}</b>}</div>)}</div> : <div className="empty-state compact"><strong>No forward forecasts yet</strong>Open Command Center before kickoff to create immutable model snapshots.</div>}
    </Panel>
    <Notice>Paper only. Strongest picks and parlays are recorded before kickoff and graded separately. Manual singles are not automatically settled.</Notice>
  </>;
}
