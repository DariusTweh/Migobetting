import type { WeeklyUsage } from "./nflverse";

/**
 * Week-frozen QB role inference. Historical season pass-attempt leaders are
 * not necessarily the CURRENT starter. Evaluate recent team game leaders,
 * then match verified unavailable roster IDs. Never call an unknown QB active.
 */
export type QuarterbackRole = {
  team: string; week: number; currentId: string | null; currentName: string | null;
  observedStarts: number; latestGameWeek: number | null; historicalLeaderId: string | null;
  status: "RECENT_STARTER" | "RECENT_REPLACEMENT" | "UNVERIFIED_REPLACEMENT" | "NO_TEAM_QB_HISTORY";
  sampleGames: number;
};
const normalize=(x:string)=>x.toLowerCase().replace(/[^a-z0-9]/g,"");
type Availability = {id:string;name:string;team:string;status?:string};
export function inferQuarterbackRole(
  team:string, week:number, usage:WeeklyUsage[], unavailable:Availability[],
):QuarterbackRole {
  const teamRows=usage.filter(r=>r.team===team&&r.week<week&&r.week>0&&r.position==="QB");
  const byWeek=new Map<number,WeeklyUsage[]>();
  for(const row of teamRows)byWeek.set(row.week,[...(byWeek.get(row.week)??[]),row]);
  const weeks=[...byWeek].sort((a,b)=>b[0]-a[0]);
  const leaders=weeks.map(([w,rows])=>{
    const sorted=rows.filter(r=>(r.passingAttempts??0)>=12)
      .sort((a,b)=>(b.passingAttempts??0)-(a.passingAttempts??0));
    return {week:w,player:sorted[0]??null};
  }).filter((r):r is {week:number;player:WeeklyUsage}=>r.player!==null);
  const byId=new Map<string,number>();
  for(const r of teamRows)byId.set(r.id,(byId.get(r.id)??0)+(r.passingAttempts??0));
  const historicalLeaderId=[...byId].sort((a,b)=>b[1]-a[1])[0]?.[0]??null;
  const banned=new Set(unavailable.filter(p=>p.team===team).map(p=>p.id));
  const bannedNames=new Set(unavailable.filter(p=>p.team===team).map(p=>normalize(p.name)));
  const eligible=(p:WeeklyUsage)=>!banned.has(p.id)&&!bannedNames.has(normalize(p.name));
  const latest=leaders[0];
  const latestActive=leaders.find(l=>eligible(l.player));
  const candidates=leaders.slice(0,4).filter(l=>eligible(l.player));
  // Prefer whoever played the most recent full team game; never historical total.
  const picked=candidates[0]??latestActive??null;
  if(!picked){
    return {team,week,currentId:null,currentName:null,observedStarts:0,
      latestGameWeek:latest?.week??null,historicalLeaderId,
      status:latest?"UNVERIFIED_REPLACEMENT":"NO_TEAM_QB_HISTORY",sampleGames:leaders.length};
  }
  const observedStarts=leaders.filter(l=>l.player.id===picked.player.id).length;
  const status=latest&&(!eligible(latest.player)||historicalLeaderId!==picked.player.id)
    ?"RECENT_REPLACEMENT":"RECENT_STARTER";
  return {team,week,currentId:picked.player.id,currentName:picked.player.name,
    observedStarts,latestGameWeek:picked.week,historicalLeaderId,status,sampleGames:leaders.length};
}
