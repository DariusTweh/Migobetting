import { notFound } from "next/navigation";
import { getNflScoreboard } from "@/lib/nfl/espn";
import { NflMatchCenter } from "@/components/nfl-match-center";
import "../../pro.css";
export const dynamic = "force-dynamic";
export default async function NflGamePage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 if(!/^\d{5,15}$/.test(id))notFound();
 const board=await getNflScoreboard();
 const game=board.games.find(g=>g.id===id);
 if(!game)notFound();
 return <NflMatchCenter game={game}/>;
}
