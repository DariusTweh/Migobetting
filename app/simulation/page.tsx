import { SimulationLab } from "@/components/simulation-lab";
import { getFixtures } from "@/lib/espn";

export const dynamic = "force-dynamic";

export default async function SimulationPage() {
  const { fixtures, errors, fetchedAt } = await getFixtures();
  return <SimulationLab fixtures={fixtures} providerErrors={errors} fetchedAt={fetchedAt} />;
}
