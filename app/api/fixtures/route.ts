import { NextRequest, NextResponse } from "next/server";
import { getFixtures, parseLeagueQuery } from "@/lib/espn";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const leagues = parseLeagueQuery(request.nextUrl.searchParams.get("leagues"));
  if (leagues.length === 0) return NextResponse.json({ error: "No supported leagues requested" }, { status: 400 });
  const result = await getFixtures(leagues);
  return NextResponse.json({ ...result, source: "ESPN unofficial scoreboard API", demo: false });
}
