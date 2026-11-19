"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock3 } from "lucide-react";
import { forecastFixture } from "@/lib/model";
import { formatAmerican } from "@/lib/odds";
import type { Fixture } from "@/lib/types";

function percent(value: number) { return `${Math.round(value * 100)}%`; }

export function FixtureCard({ fixture }: { fixture: Fixture }) {
  const forecast = forecastFixture(fixture);
  const date = new Date(fixture.kickoff);
  const best = forecast.markets[0];
  return (
    <Link className="fixture-card" href={`/matches/${fixture.id}`}>
      <div className="fixture-top">
        <span>{fixture.league}</span>
        <span className={`badge badge-${fixture.status === "live" ? "live" : forecast.dataQuality}`}>{fixture.status === "live" ? "Live" : forecast.dataQuality}</span>
      </div>
      <div className="fixture-time"><Clock3 size={13} />{date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</div>
      <div className="teams">
        <div className="team-row">
          <div className="team-identity">{fixture.home.logo ? <Image src={fixture.home.logo} alt="" width={28} height={28} unoptimized /> : <span className="team-fallback">{fixture.home.abbreviation}</span>}<strong>{fixture.home.shortName}</strong></div>
          <span className="team-record">{fixture.home.record ?? "No record"}</span>
        </div>
        <div className="team-row">
          <div className="team-identity">{fixture.away.logo ? <Image src={fixture.away.logo} alt="" width={28} height={28} unoptimized /> : <span className="team-fallback">{fixture.away.abbreviation}</span>}<strong>{fixture.away.shortName}</strong></div>
          <span className="team-record">{fixture.away.record ?? "No record"}</span>
        </div>
      </div>
      <div className="forecast-strip">
        {forecast.dataQuality === "insufficient" ? <span>Insufficient data for a qualified forecast</span> : <><div><small>Model lean</small><strong>{best.label}</strong></div><div className="forecast-value"><strong>{percent(best.probability)}</strong><small>fair {formatAmerican(best.fairAmerican)}</small></div></>}
      </div>
    </Link>
  );
}
