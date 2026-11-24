import type { HistoricalMatch } from "./history";

type Obj = Record<string,unknown>;
const obj = (value:unknown):Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const arr = (value:unknown):unknown[] => Array.isArray(value)?value:[];
const str = (value:unknown):string => value===undefined || value===null?"":String(value);
function integer(value:unknown):number|null {
  if(value===null || value===undefined || value==="")return null;
  const n=Number(value);
  return Number.isInteger(n)&&n>=0?n:null;
}
function linescoreHalf(side:Obj, final:number):number|null {
  const values=arr(side.linescores).map(obj);
  if(values.length<2)return null;
  const first=values.find(m=>Number(obj(m.period).number)===1 ||
    /^(first|1st)\s*half/i.test(str(m.displayName||m.name||obj(m.period).displayValue))) ?? values[0];
  const second=values.find(m=>Number(obj(m.period).number)===2 ||
    /^(second|2nd)\s*half/i.test(str(m.displayName||m.name||obj(m.period).displayValue))) ?? values[1];
  const h=integer(first.value ?? first.score), a=integer(second.value??second.score);
  // Never treat running/cumulative line scores as individual half totals.
  return h!==null && a!==null && h+a===final?h:null;
}
function goalClock(event:Obj):{minute:number;firstHalf:boolean}|null {
  const period=Number(obj(event.period).number);
  const clock=str(obj(event.clock).displayValue||event.clock||event.minute).trim();
  const match=clock.match(/(\d+)(?:\s*\+\s*(\d+))?/);
  if(!match)return null;
  const minute=Number(match[1]);
  if(minute>130)return null;
  if(period===1)return {minute,firstHalf:true};
  if(period===2)return {minute,firstHalf:false};
  if(period>2)return null;
  return {minute,firstHalf:minute<=45};
}
function isValidGoal(event:Obj) {
  if(event.scoringPlay===true)return true;
  const type=obj(event.type);
  const label=str(type.text||type.displayName||type.name||event.typeText||event.shortText).toLowerCase();
  const detail=str(event.text||event.description).toLowerCase();
  return /\bgoal\b/.test(label) && !/\b(disallow|cancel|overturn|ruled out|missed|no goal)\b/.test(label+" "+detail);
}
function matchSides(summary:Obj):{home:Obj;away:Obj}|null {
  const top=obj(arr(obj(summary.header).competitions)[0]);
  const competitors=arr(top.competitors).map(obj);
  const home=competitors.find(c=>c.homeAway==="home");
  const away=competitors.find(c=>c.homeAway==="away");
  if(!home||!away)return null;
  return {home,away};
}
/**
 * Parse only halftime scores provable by reconciled period linescores or a
 * complete ESPN goal timeline. Missing details return null, not a guessed 0–0.
 */
export function enrichEspnHalfTime(summary:unknown,match:HistoricalMatch):HistoricalMatch|null {
  const data=obj(summary),sides=matchSides(data);
  if(!sides)return null;
  const htHome=linescoreHalf(sides.home,match.homeGoals);
  const htAway=linescoreHalf(sides.away,match.awayGoals);
  if(htHome!==null&&htAway!==null)return {
    ...match,halfTimeHomeGoals:htHome,halfTimeAwayGoals:htAway,
    source:"ESPN verified half-by-half linescores",
  };
  const homeId=str(obj(sides.home.team).id),awayId=str(obj(sides.away.team).id);
  if(!homeId||!awayId)return null;
  const possible=[...arr(data.keyEvents),...arr(data.scoringPlays)];
  if(!possible.length)return null;
  let totalH=0,totalA=0,halfH=0,halfA=0;
  const seen=new Set<string>();
  for(const raw of possible){
    const event=obj(raw);
    if(!isValidGoal(event))continue;
    const id=str(event.id||obj(event.play).id);
    if(id && seen.has(id))continue;
    if(id)seen.add(id);
    const teamId=str(obj(event.team).id||obj(obj(event.competitor).team).id);
    const moment=goalClock(event);
    if(!moment || (teamId!==homeId&&teamId!==awayId))return null;
    if(teamId===homeId){totalH++;if(moment.firstHalf)halfH++;}
    else {totalA++;if(moment.firstHalf)halfA++;}
  }
  // Complete event-based goal reconciliation is mandatory.
  if(totalH!==match.homeGoals||totalA!==match.awayGoals)return null;
  return { ...match,halfTimeHomeGoals:halfH,halfTimeAwayGoals:halfA,
    source:"ESPN reconciled goal event timestamps" };
}
