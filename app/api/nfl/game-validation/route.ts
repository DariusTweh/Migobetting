import {NextRequest,NextResponse} from "next/server";
import {getNflverseScheduleArchive} from "@/lib/nfl/nflverse";
import {parseScheduleScores} from "@/lib/nfl/game-markets";
import {validateNflGameMarketArchive} from "@/lib/nfl/game-validation";
import {getNflScoreboard} from "@/lib/nfl/espn";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:NextRequest){
 try{
  const schedule=await getNflverseScheduleArchive();
  const now=await getNflScoreboard();
  const upcoming=now.games.filter(g=>g.status==="scheduled"&&g.season===2026&&Number.isInteger(g.week))
   .sort((a,b)=>a.kickoff.localeCompare(b.kickoff))[0];
  const finished=parseScheduleScores(schedule,2026,23);
  const latest=finished.length?Math.max(...finished.map(g=>g.week)):0;
  const defaultWeek=upcoming?.week??Math.min(22,latest+1);
  const requested=request.nextUrl.searchParams.get("week");
  const targetWeek=requested===null?defaultWeek:Number(requested);
  if(!Number.isInteger(targetWeek)||targetWeek<5||targetWeek>22){
   return NextResponse.json({error:"Expected NFL season week 5–22"},{status:400});
  }
  const report=validateNflGameMarketArchive(schedule,2026,targetWeek,250);
  return NextResponse.json({...report,generatedAt:new Date().toISOString()},{
   headers:{"Cache-Control":"public,s-maxage=3600,stale-while-revalidate=300"},
  });
 }catch(e){
  return NextResponse.json({error:"NFL held-out game market validation unavailable",
   detail:e instanceof Error?e.message:"Data provider failed"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
