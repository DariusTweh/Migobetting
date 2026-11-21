import { Dashboard } from "@/components/dashboard";
import { getFixtures } from "@/lib/espn";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await getFixtures(undefined, { includeYesterday: true });
  return <Dashboard initialData={result} />;
}
