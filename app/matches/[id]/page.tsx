import { notFound } from "next/navigation";
import { MatchIntelligence } from "@/components/match-intelligence";
import { getFixtures } from "@/lib/espn";
import { getLineupIntelligence } from "@/lib/lineups";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { fixtures } = await getFixtures();
  const fixture = fixtures.find((item) => item.id === id);
  if (!fixture) notFound();
  const lineups = await getLineupIntelligence(fixture);
  return <MatchIntelligence fixture={fixture} lineups={lineups} />;
}
