"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatKickoffTime } from "@/lib/date-time";
import { forecastFixture } from "@/lib/model";
import type { Fixture, Forecast } from "@/lib/types";
import type { StrongestPick } from "@/lib/strongest-pick";
import type { StrongestPickRecord } from "@/lib/strongest-record";

export function FixtureCard({ fixture, forecast: suppliedForecast, strongest, picksReady = false }: {
  fixture: Fixture;
  forecast?: Forecast;
  strongest?: StrongestPick | StrongestPickRecord | null;
  picksReady?: boolean;
}) {
  const forecast = suppliedForecast ?? forecastFixture(fixture);
  const modelMarket = forecast.markets.find((item) =>
    item.probability >= 0.62 && item.probability <= 0.78 &&
    ["home", "away", "over-1.5", "over-2.5", "under-3.5", "btts"].includes(item.key));
  const displayedMarket = strongest?.market ?? (!picksReady ? modelMarket?.label : undefined);
  const displayedProbability = strongest?.probability ?? (!picksReady ? modelMarket?.probability : undefined);
  const isTracked = strongest && "lockedAt" in strongest;
  const hasScore = (fixture.status === "live" || fixture.status === "final") && fixture.home.score !== undefined && fixture.away.score !== undefined;
  const status = fixture.status === "live" ? fixture.statusLabel : fixture.status === "final" ? "FT" : fixture.status === "scheduled" ? formatKickoffTime(fixture.kickoff) : fixture.statusLabel;
  return <Link className={`match-row match-row-${fixture.status}`} href={`/matches/${fixture.id}`} aria-label={`${fixture.home.shortName} versus ${fixture.away.shortName}`}>
    <div className="match-row-status"><strong>{status}</strong>{fixture.status === "live" ? <span>LIVE</span> : null}</div>
    <div className="match-row-teams">
      <Team team={fixture.home} score={hasScore ? fixture.home.score : undefined}/>
      <Team team={fixture.away} score={hasScore ? fixture.away.score : undefined}/>
    </div>
    <div className="match-row-model">{fixture.status === "scheduled" && displayedMarket && displayedProbability !== undefined ?
      <><small>{isTracked ? "Saved strongest" : "Model lean"}</small><strong>{displayedMarket}</strong>
        <span>{Math.round(displayedProbability * 100)}%</span></> :
      fixture.status === "scheduled" ? <><small>Model lean</small><strong>{picksReady ? "No qualified pick" : "Checking…"}</strong></> :
      fixture.status === "final" ? <><small>Result</small><strong>{fixture.statusLabel}</strong></> :
      fixture.status === "live" ? <><small>Provider</small><strong>Live score</strong></> :
      <><small>Status</small><strong>{fixture.statusLabel}</strong></>}</div>
    <ChevronRight className="match-row-chevron" size={17}/>
  </Link>;
}

function Team({ team, score }: { team: Fixture["home"]; score?: number }) {
  return <div><span>{team.logo ? <Image src={team.logo} alt="" width={24} height={24} unoptimized/> : <i>{team.abbreviation.slice(0, 2)}</i>}</span><strong>{team.shortName}</strong>{score !== undefined ? <b>{score}</b> : null}</div>;
}
