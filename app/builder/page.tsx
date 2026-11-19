import { PickBuilder } from "@/components/pick-builder";
import { getFixtures } from "@/lib/espn";

export const dynamic = "force-dynamic";

export default async function BuilderPage() {
  const { fixtures } = await getFixtures();
  return <PickBuilder fixtures={fixtures} />;
}
