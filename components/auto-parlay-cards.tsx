"use client";

import Link from "next/link";
import { ArrowRight, Layers3, ShieldAlert } from "lucide-react";
import { buildResearchCard, type SuggestedCard } from "@/lib/auto-cards";
import { formatAmerican } from "@/lib/odds";
import type { Fixture } from "@/lib/types";
import { Panel, PanelHead } from "./ui";

const pretty = (value: number) => (100 * value).toFixed(1) + "%";

function Card({ card }: { card: SuggestedCard }) {
  const title = card.kind === "daily-double" ? "Daily Double" : "Banger Card";
  return <Panel>
    <PanelHead title={title} meta={card.kind === "daily-double" ? "Research selection · goal: +100 with real quotes" : "Higher-risk multi-match research · requires real quotes"} />
    {card.legs.length ? <div className="suggested-card">
      <div className="suggested-card-summary"><span className="badge badge-limited">MODEL ONLY · NOT PRICED</span><strong>{pretty(card.probability ?? 0)} <small>estimated joint probability</small></strong></div>
      <div className="suggested-legs">
        {card.legs.map((leg) => <div key={leg.fixtureId} className="suggested-leg">
          <div><small>{leg.league}</small><b>{leg.fixtureLabel}</b><strong>{leg.market}</strong></div>
          <span>{pretty(leg.probability)}</span>
        </div>)}
      </div>
      <div className="suggested-card-bottom"><span>Model-implied fair combined odds</span><strong>{card.fairAmerican === null ? "—" : formatAmerican(card.fairAmerican)}</strong></div>
      <div className="model-warning"><ShieldAlert size={14}/><span>No actual bookmaker odds yet. This fair price is NOT an offered betting line, and the model is uncalibrated.</span></div>
      <Link className="button button-primary full-button" href={"/builder?mode=" + card.kind}><Layers3 size={16}/> Open and price all legs <ArrowRight size={16}/></Link>
    </div> : <div className="card-body">
      <div className="card-symbol"><Layers3 size={21}/></div>
      <strong>No qualifying {title} today · PASS</strong>
      <p>Not enough eligible upcoming fixtures meet the model selection rules. MIGO will not invent legs or odds.</p>
      <Link className="button" href="/builder">Build manually <ArrowRight size={15}/></Link>
    </div>}
  </Panel>;
}

export function AutoParlayCards({ fixtures }: { fixtures: Fixture[] }) {
  const double = buildResearchCard(fixtures, "daily-double");
  const banger = buildResearchCard(fixtures, "banger");
  return <div className="stack">
    <Card card={double} />
    <Card card={banger} />
  </div>;
}
