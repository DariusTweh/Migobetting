import { NextResponse } from "next/server";
import { getNflverseHistoricalSeason } from "@/lib/nfl/nflverse";
import { validateNflSeason } from "@/lib/nfl/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Single permitted 2026 historical-diagnostic endpoint: read-only, no bets,
 * no future-week stat leakage, bounded compute and explicit data limitations.
 */
export async function GET() {
  try {
    const history = await getNflverseHistoricalSeason(2026);
    const report = validateNflSeason(history, { simulationsPerGame: 500 });
    return NextResponse.json({
      ...report, generatedAt: new Date().toISOString(), source: history.source,
    }, {headers:{"Cache-Control":"public, s-maxage=3600, stale-while-revalidate=300"}});
  } catch (error) {
    return NextResponse.json({
      error: "NFL historical validation is unavailable; no calibration has been applied.",
      detail: error instanceof Error ? error.message : "Unknown provider error",
    }, {status:503,headers:{"Cache-Control":"no-store"}});
  }
}
