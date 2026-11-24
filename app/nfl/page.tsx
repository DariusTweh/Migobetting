import { getNflScoreboard } from "@/lib/nfl/espn";
import { NflHub } from "@/components/nfl-hub";
import "./nfl.css";
export const dynamic = "force-dynamic";
export default async function NflPage() {
  const board = await getNflScoreboard();
  return <NflHub initialData={board} />;
}
