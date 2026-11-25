import { getNflScoreboard } from "@/lib/nfl/espn";
import { NflScoreboard } from "@/components/nfl-scoreboard";
import "./pro.css";
export const dynamic = "force-dynamic";
export const metadata={title:"NFL Match Center | MIGO Betting",description:"NFL matchup intelligence, model projections, research markets and player availability"};
export default async function NflPage() {
 const board=await getNflScoreboard();
 return <NflScoreboard board={board}/>;
}
