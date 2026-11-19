import { isEspnHistoryLeague, parseEspnHistory } from "@/lib/espn-history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const league = search.get("league") ?? "";
  const year = Number(search.get("year"));
  if (!isEspnHistoryLeague(league) || !Number.isInteger(year) || year < 2022 || year > new Date().getUTCFullYear()) {
    return Response.json({ error: "Specify league=usa.1 or uefa.wchampions and a year from 2022 to the current year." }, { status: 400 });
  }

  // Monthly windows avoid silently truncating large soccer schedules on year queries.
  const months = Array.from({ length: 12 }, (_, i) => String(year) + String(i + 1).padStart(2, "0"));
  const importedAt = new Date().toISOString();
  const settled = await Promise.allSettled(months.map(async (month) => {
    const url = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + league + "/scoreboard?dates=" + month + "&limit=500";
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "MIGO-Soccer-Intelligence/0.4" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(month + ": ESPN HTTP " + response.status);
    const data: unknown = await response.json();
    const events = (data as { events?: unknown[] }).events;
    if (Array.isArray(events) && events.length >= 500) throw new Error(month + ": possible truncated results");
    return parseEspnHistory(data, league, importedAt);
  }));
  const errors = settled.flatMap((result) => result.status === "rejected"
    ? [result.reason instanceof Error ? result.reason.message : "ESPN month request failed"] : []);
  const all = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const matches = [...new Map(all.map((match) => [match.id, match])).values()];
  if (!matches.length) {
    return Response.json({ error: "No verified regulation-time final results returned for this league/year.", errors }, { status: 502 });
  }
  return Response.json({
    matches, league, year, errors, importedAt,
    warnings: [
      "ESPN's undocumented feeds may omit fixtures; import coverage is not guaranteed.",
      "Events explicitly marked as extra time or penalty shootouts were excluded.",
      "No historical odds are supplied, so priced ROI and historical parlays are unavailable for these fixtures.",
      ...(errors.length ? ["Partial import: some months failed."] : []),
    ],
  });
}
