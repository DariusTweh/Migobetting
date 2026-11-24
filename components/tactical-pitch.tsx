"use client";

import { useMemo } from "react";
import { tacticalFrame } from "@/lib/tactical-pitch";
import type { MatchTape, MatchSnapshot } from "@/lib/match-playback";

const px = (x: number) => 40 + x * 9.2;
const py = (y: number) => 45 + y * 5.1;

export function TacticalPitch({ tape, snapshot, minute, homeName, awayName }: {
  tape: MatchTape;
  snapshot: MatchSnapshot;
  minute: number;
  homeName: string;
  awayName: string;
}) {
  const frame = useMemo(() => tacticalFrame(tape, minute), [tape, minute]);
  return <section className="tactical-broadcast" aria-label="Synthetic soccer pitch and moving player positions">
    <div className="tactical-broadcast-head">
      <span><i className="tactical-live-dot"/> VIRTUAL MATCH ENGINE</span>
      <strong>{frame.phase}</strong>
      <span>{minute === 90 ? "FT" : minute + "′"} · SYNTHETIC</span>
    </div>
    <div className="tactical-pitch-stage">
      <svg className="tactical-pitch-svg" viewBox="0 0 1000 600" role="img"
        aria-label={"Animated simulated pitch for " + homeName + " versus " + awayName}>
        <defs>
          <linearGradient id="migo-pitch-grass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#124536" />
            <stop offset=".58" stopColor="#14523c" />
            <stop offset="1" stopColor="#103d32" />
          </linearGradient>
          <linearGradient id="migo-pitch-glow" x1="0" x2="1">
            <stop offset="0" stopColor="#96fae0" stopOpacity=".02"/>
            <stop offset=".5" stopColor="#d3ffdf" stopOpacity=".13"/>
            <stop offset="1" stopColor="#96fae0" stopOpacity=".02"/>
          </linearGradient>
          <filter id="migo-player-shadow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity=".5"/>
          </filter>
          <filter id="migo-ball-glow" x="-150%" y="-150%" width="400%" height="400%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="white" floodOpacity=".65"/>
          </filter>
        </defs>
        <rect x="0" y="0" width="1000" height="600" fill="#081f1c"/>
        <rect x="20" y="25" width="960" height="540" rx="7" fill="#0c302c" stroke="#286457" strokeWidth="12" />
        <rect x="40" y="45" width="920" height="510" fill="url(#migo-pitch-grass)" stroke="#bbe2d2" strokeWidth="3"/>
        {Array.from({ length: 10 }, (_, i) =>
          <rect key={i} x={40 + i * 92} y="45" width="92" height="510"
            fill={i % 2 ? "#ecfff2" : "#000"} opacity={i % 2 ? ".028" : ".035"}/>)}
        <rect x="40" y="45" width="920" height="510" fill="url(#migo-pitch-glow)"/>
        <g fill="none" stroke="#c3e6da" strokeWidth="2.5" opacity=".72">
          <line x1="500" y1="45" x2="500" y2="555"/>
          <circle cx="500" cy="300" r="73"/>
          <rect x="40" y="145" width="153" height="310"/>
          <rect x="807" y="145" width="153" height="310"/>
          <rect x="40" y="215" width="58" height="170"/>
          <rect x="902" y="215" width="58" height="170"/>
          <path d="M193 243 A66 66 0 0 1 193 357"/>
          <path d="M807 243 A66 66 0 0 0 807 357"/>
          <path d="M40 300 h-19 M960 300 h19" strokeWidth="6"/>
        </g>
        <g fill="#d0f4e7" opacity=".8"><circle cx="500" cy="300" r="4"/>
          <circle cx="148" cy="300" r="4"/><circle cx="852" cy="300" r="4"/></g>
        {frame.trail ? <g className="tactical-pass-trail">
          <path d={"M" + px(frame.trail.from.x) + " " + py(frame.trail.from.y) +
            " Q" + ((px(frame.trail.from.x) + px(frame.trail.to.x)) / 2) +
            " " + (Math.min(py(frame.trail.from.y), py(frame.trail.to.y)) - 35) +
            " " + px(frame.trail.to.x) + " " + py(frame.trail.to.y)}
            stroke={frame.attacking === "home" ? "#a9f43c" : "#8bb8ff"}
            fill="none" strokeWidth="4" strokeDasharray="11 7" opacity=".8"/>
        </g> : null}
        {frame.players.map((p) => <g key={p.id} className={"tactical-player tactical-player-" + p.side}
          transform={"translate(" + px(p.x) + " " + py(p.y) + ")"}>
          {p.active && <circle r="21" fill="none" stroke="#fbfff6" strokeWidth="3" opacity=".8"/>}
          <circle r="16" fill={p.side === "home" ? "#baf43a" : "#66a0ff"}
            stroke={p.side === "home" ? "#14251d" : "#e4edff"} strokeWidth="3"
            filter="url(#migo-player-shadow)"/>
          <text textAnchor="middle" y="5" fill={p.side === "home" ? "#122019" : "#081c3a"}
            fontSize="14" fontWeight="900">{p.index + 1}</text>
        </g>)}
        <g className="tactical-ball" transform={"translate(" + px(frame.ball.x) + " " + py(frame.ball.y) + ")"}>
          <circle r="11" fill="#f7fcff" stroke="#0a161a" strokeWidth="2.5"
            filter="url(#migo-ball-glow)"/>
          <circle r="4" fill="#233440"/>
          <circle cx="-6" cy="3" r="2" fill="#233440"/>
          <circle cx="5" cy="-5" r="2" fill="#233440"/>
        </g>
        {frame.event?.kind === "goal" ? <g className="tactical-goal-flash">
          <rect x="355" y="270" width="290" height="61" rx="11"
            fill="#061714" fillOpacity=".89" stroke="#bcf83b" strokeWidth="2"/>
          <text x="500" y="312" textAnchor="middle" fontWeight="950"
            fontSize="36" fill="#c5ff44">GOAL!</text>
        </g> : null}
      </svg>
      <div className="tactical-pitch-label tactical-pitch-label-home">{homeName}</div>
      <div className="tactical-pitch-label tactical-pitch-label-away">{awayName}</div>
    </div>
    <div className="tactical-broadcast-foot">
      <div><span className="tactical-team-dot home"/>{homeName}
        <strong>{snapshot.possession.home}%</strong></div>
      <div className="tactical-possession-track">
        <i style={{ width: snapshot.possession.home + "%" }}/>
      </div>
      <div><strong>{snapshot.possession.away}%</strong>{awayName}
        <span className="tactical-team-dot away"/></div>
    </div>
    <div className="tactical-play-caption">
      <b>{minute === 0 ? "PRE-MATCH" : minute + "′"}</b>
      <span>{frame.event?.description ?? (minute === 0 ?
        "Kick off the simulated match to see tactical movement." :
        frame.phase + " · virtual player tracking")}</span>
    </div>
    <p className="tactical-synthetic-disclaimer">Illustrative positions and ball paths generated from MIGO's synthetic event tape. Not real optical tracking or actual live match play.</p>
  </section>;
}
