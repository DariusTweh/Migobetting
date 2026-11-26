import { parseEspnHistory, isEspnHistoryLeague } from "../../../../lib/espn-history";
import { enrichEspnHalfTime } from "../../../../lib/espn-half-events";
import { clubHalfTimeKey } from "../../../../lib/first-half-model";
import type { HistoricalMatch } from "../../../../lib/history";

export const dynamic="force-dynamic";
const LEAGUES=new Set(["uefa.champions","uefa.europa","uefa.europa.conf","uefa.wchampions"]);
const ESPN="https://site.api.espn.com/apis/site/v2/sports/soccer/";
const HEADERS={Accept:"application/json","User-Agent":"MIGO-Soccer-Intelligence/0.5"};

function monthKeys(before:string):string[] {
  const date=new Date(before);
  if(!Number.isFinite(date.getTime()))return [];
  const month=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1));
  // Rolling history for the current season plus three preceding seasons.
  return Array.from({length:48},(_,i)=>{
    const m=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()-i,1));
    return m.getUTCFullYear()+String(m.getUTCMonth()+1).padStart(2,"0");
  });
}
const matchesClub=(match:HistoricalMatch,key:string)=>
  clubHalfTimeKey(match.homeTeam)===key||clubHalfTimeKey(match.awayTeam)===key;

export async function GET(request:Request) {
  const query=new URL(request.url).searchParams;
  const league=query.get("league")??"";
  const home=(query.get("home")??"").trim().slice(0,100);
  const away=(query.get("away")??"").trim().slice(0,100);
  const kickoff=query.get("kickoff")??"";
  if(!LEAGUES.has(league)||!isEspnHistoryLeague(league)||!home||!away||!Number.isFinite(Date.parse(kickoff)))
    return Response.json({error:"Specify a supported UEFA league, home, away and kickoff."},{status:400});
  const homeKey=clubHalfTimeKey(home),awayKey=clubHalfTimeKey(away);
  if(!homeKey||!awayKey||homeKey===awayKey)
    return Response.json({error:"Invalid or identical home and away club names."},{status:400});
  const months=monthKeys(kickoff);
  const warnings:string[]=[];
  const fetched=await Promise.allSettled(months.map(async month=>{
    const url=ESPN+league+"/scoreboard?dates="+month+"&limit=500";
    const response=await fetch(url,{headers:HEADERS,signal:AbortSignal.timeout(9500),
      next:{revalidate:21600}});
    if(!response.ok)throw new Error(month+" ESPN "+response.status);
    const data:unknown=await response.json();
    const events=(data as {events?:unknown[]}).events;
    if(Array.isArray(events)&&events.length>=500)throw new Error(month+" schedule may be truncated");
    return parseEspnHistory(data,league,new Date().toISOString());
  }));
  const all=[...new Map(fetched.flatMap((r,i)=>{
    if(r.status==="fulfilled")return r.value;
    warnings.push(months[i]+": scoreboard unavailable");
    return [];
  }).map(m=>[m.id,m])).values()];
  const cutoff=new Date(kickoff).toISOString().slice(0,10);
  const completed=all.filter(m=>m.date.slice(0,10)<cutoff)
    .sort((a,b)=>b.date.localeCompare(a.date));
  // Prioritize the current two clubs to avoid retrieving hundreds of unrelated match summaries.
  const target=[...new Map([
    ...completed.filter(m=>matchesClub(m,homeKey)).slice(0,22),
    ...completed.filter(m=>matchesClub(m,awayKey)).slice(0,22),
  ].map(m=>[m.id,m])).values()].slice(0,40);
  const detailed=await Promise.allSettled(target.map(async(match)=>{
    const eventId=match.id.split(":").at(-1);
    const response=await fetch(ESPN+league+"/summary?event="+encodeURIComponent(eventId??""),{
      headers:HEADERS,signal:AbortSignal.timeout(9500),next:{revalidate:86400},
    });
    if(!response.ok)return null;
    return enrichEspnHalfTime(await response.json(),match);
  }));
  const matches=detailed.flatMap(r=>r.status==="fulfilled"&&r.value?[r.value]:[]);
  const failures=detailed.filter(r=>r.status==="rejected").length;
  if(failures)warnings.push(failures+" ESPN event summaries were unavailable");
  return Response.json({
    matches,league,source:"ESPN verified halftime line scores / reconciled goal events",
    coverage:{
      monthsRequested:months.length,monthsReturned:fetched.filter(r=>r.status==="fulfilled").length,
      previousCompletedMatchesForTeams:target.length,
      verifiedHalftimeScores:matches.length,
      unverifiedMatches:target.length-matches.length,
    },warnings,
    warningsInfo:"Only complete score-reconciled ESPN halftime records enter the model. Missing soccer event detail is never guessed.",
  });
}
