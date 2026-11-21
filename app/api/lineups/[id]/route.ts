import { getFixtures } from "@/lib/espn";
import { getLineupIntelligence } from "@/lib/lineups";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/lineups/[id]">) {
  const { id } = await context.params;
  const { fixtures } = await getFixtures(undefined, { includeYesterday: true });
  const fixture = fixtures.find((item) => item.id === id);
  if (!fixture) return Response.json({ error: "Fixture not found in current ESPN window" }, { status: 404 });
  return Response.json(await getLineupIntelligence(fixture));
}
