import Link from "next/link";
import type { NflGame } from "@/lib/nfl/engine";
import { ArrowUpRight, CalendarDays, ChevronRight, Radio, ShieldCheck, Trophy } from "lucide-react";

type Board = { games: NflGame[]; errors: string[]; fetchedAt: string };
const dateFmt = (value:string)=>new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",weekday:"long",month:"short",day:"numeric"}).format(new Date(value));
const timeFmt = (value:string)=>new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",hour:"numeric",minute:"2-digit"}).format(new Date(value));
const todayKey = (value:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
function Logo({logo,code}:{logo?:string;code:string}) {
 return <span className="nm-logo">{logo?<img src={logo} alt="" loading="lazy"/>:<b>{code.slice(0,3)}</b>}</span>;
}
export function NflScoreboard({board}:{board:Board}){
 const byDay = new Map<string,NflGame[]>();
 for(const game of board.games){
  const key=todayKey(game.kickoff);
  byDay.set(key,[...(byDay.get(key)??[]),game]);
 }
 const playable=board.games.filter(g=>g.status==="scheduled");
 const live=board.games.filter(g=>g.status==="live");
 const groups=[...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
 return <div className="nm-app">
  <div className="nm-page-heading">
   <div><div className="nm-eyebrow"><span className="nm-live-pulse"/> MIGO / FOOTBALL INTELLIGENCE</div>
    <h1>NFL <em>Match Center</em></h1>
    <p>Fixtures, projected scores, game markets, player opportunities and injury intelligence — one screen per matchup.</p>
   </div>
   <Link href="/nfl/validation" className="nm-link-outline"><ShieldCheck size={16}/> Model validation <ArrowUpRight size={15}/></Link>
  </div>
  <div className="nm-dashboard-metrics">
   <div><span><CalendarDays size={16}/> UPCOMING</span><strong>{playable.length}</strong><small>scheduled fixtures</small></div>
   <div><span><Radio size={16}/> LIVE NOW</span><strong>{live.length}</strong><small>games in progress</small></div>
   <div><span><Trophy size={16}/> MODEL STATUS</span><strong className="nm-small-stat">RESEARCH</strong><small>probabilities not calibrated</small></div>
  </div>
  <div className="nm-section-header"><div><h2>Game slate</h2><p>All times Pacific · tap a matchup to open its dedicated intelligence report</p></div><span className="nm-stat-label">{board.games.length} MATCHUPS</span></div>
  {board.errors.length>0?<div className="nm-notice">Some fixture dates were unavailable from the schedule provider. Only confirmed fixtures are displayed.</div>:null}
  {groups.length?groups.map(([date,games])=><section className="nm-day-section" key={date}>
   <div className="nm-day-label"><span className="nm-day-line"/><strong>{dateFmt(games[0].kickoff)}</strong><span>{games.length} {games.length===1?"GAME":"GAMES"}</span></div>
   <div className="nm-fixture-grid">{games.map(game=><Link className="nm-fixture-card" href={"/nfl/games/"+encodeURIComponent(game.id)} key={game.id}>
    <div className="nm-fixture-top"><span className={"nm-game-state nm-"+game.status}>{game.status==="live"?"LIVE":game.status==="final"?"FINAL":timeFmt(game.kickoff)}</span><span>{game.statusLabel}</span></div>
    <div className="nm-fixture-match">
      <div className="nm-fixture-team"><Logo logo={game.away.logo} code={game.away.abbreviation}/><strong>{game.away.abbreviation}</strong><small>{game.away.record??"Away"}</small></div>
      <div className="nm-fixture-center"><strong>{game.status==="final"||game.status==="live"?[(game.away.score??"–"),(game.home.score??"–")].join(" : "):"VS"}</strong><small>{game.status==="scheduled"?"PRE-GAME":"MATCH SCORE"}</small></div>
      <div className="nm-fixture-team"><Logo logo={game.home.logo} code={game.home.abbreviation}/><strong>{game.home.abbreviation}</strong><small>{game.home.record??"Home"}</small></div>
    </div>
    <div className="nm-fixture-footer"><div><span>REFERENCE LINE</span><strong>{game.spreadDetails||"Not available"}{typeof game.overUnder==="number"?" · O/U "+game.overUnder:""}</strong></div><span className="nm-fixture-open">Analysis <ChevronRight size={16}/></span></div>
   </Link>)}</div>
  </section>):<div className="nm-empty"><strong>No games in the current NFL slate.</strong><p>ESPN has not returned upcoming fixtures in the current schedule window. Check again on a game day.</p></div>}
  <div className="nm-bottom-note"><ShieldCheck size={17}/> <span>Research environment · no executable sportsbook odds · injury statuses must be rechecked before kickoff</span></div>
 </div>;
}
