import { NextRequest, NextResponse } from "next/server";
import { getNflPreview, getNflScoreboard } from "@/lib/nfl/espn";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId");
  const board = await getNflScoreboard();
  if (!eventId) return NextResponse.json({ ...board, source: "ESPN unofficial NFL feed" });
  if (!/^\\d{5,15}$/.test(eventId)) return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  const game = board.games.find((item) => item.id === eventId);
  if (!game) return NextResponse.json({ error: "Event not found in the current slate" }, { status: 404 });
  const preview = await getNflPreview(game);
  return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
}
