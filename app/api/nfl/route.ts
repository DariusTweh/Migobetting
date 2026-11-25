import { NextRequest, NextResponse } from "next/server";
import { getNflPreview, getNflScoreboard } from "@/lib/nfl/espn";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId");
  const board = await getNflScoreboard();
  if (!eventId) return NextResponse.json({ ...board, source: "ESPN unofficial NFL feed" });
  if (!/^\d{5,15}$/.test(eventId)) return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  const game = board.games.find((item) => item.id === eventId);
  if (!game) return NextResponse.json({ error: "Event not found in the current slate" }, { status: 404 });
  const requestedLegs = request.nextUrl.searchParams.get("legs");
  if (requestedLegs && (requestedLegs.length > 700 || !/^[a-zA-Z0-9:.,_-]+$/.test(requestedLegs)))
    return NextResponse.json({ error: "Invalid leg IDs" }, { status: 400 });
  const jointLegIds = requestedLegs ? requestedLegs.split(",") : [];
  if (jointLegIds.length > 6 || new Set(jointLegIds).size !== jointLegIds.length)
    return NextResponse.json({ error: "Limit joint analysis to six distinct legs" }, { status: 400 });
  const requestedMarkets = request.nextUrl.searchParams.get("marketLegs");
  if (requestedMarkets && (requestedMarkets.length > 700 || !/^[a-zA-Z0-9:.,_-]+$/.test(requestedMarkets)))
    return NextResponse.json({ error: "Invalid game market IDs" }, { status: 400 });
  const marketLegIds = requestedMarkets ? requestedMarkets.split(",") : [];
  if (marketLegIds.length + jointLegIds.length > 6 ||
    new Set(marketLegIds).size !== marketLegIds.length ||
    marketLegIds.some((id) => !id.startsWith(game.id + ":")))
    return NextResponse.json({ error: "Invalid mixed slip selection" }, { status: 400 });
  const preview = await getNflPreview(game, new Date(), jointLegIds, marketLegIds);
  return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
}
