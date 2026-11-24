import { parseHistoricalCsv, type HistoricalMatch } from "../../../../lib/history";

const DIVISIONS: Record<string, { code: string; name: string }> = {
  "eng.1": { code: "E0", name: "Premier League" },
  "esp.1": { code: "SP1", name: "La Liga" },
  "ger.1": { code: "D1", name: "Bundesliga" },
  "ita.1": { code: "I1", name: "Serie A" },
  "fra.1": { code: "F1", name: "Ligue 1" },
  "nl.1": { code: "N1", name: "Eredivisie" },
  "por.1": { code: "P1", name: "Primeira Liga" },
  "bel.1": { code: "B1", name: "Belgian Pro League" },
  "tur.1": { code: "T1", name: "Turkish Super Lig" },
  "gre.1": { code: "G1", name: "Greek Super League" },
  "sco.1": { code: "SC0", name: "Scottish Premiership" },
};
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const leagueId = new URL(request.url).searchParams.get("league") ?? "";
  const league = DIVISIONS[leagueId];
  if (!league) {
    return Response.json({ error: "No verified three-season halftime data feed configured for this competition.",
      supported: Object.keys(DIVISIONS) }, { status: 404 });
  }
  const today = new Date();
  const seasonStart = today.getUTCMonth() >= 7 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  // Current partial season + three completed seasons.
  const seasons = Array.from({ length: 4 }, (_, i) => seasonStart - i);
  const settled = await Promise.allSettled(seasons.map(async (year) => {
    const code = String(year % 100).padStart(2,"0") + String((year + 1) % 100).padStart(2,"0");
    const url = "https://www.football-data.co.uk/mmz4281/" + code + "/" + league.code + ".csv";
    const response = await fetch(url, { headers: { "Accept": "text/csv", "User-Agent": "MIGO-Soccer-Intelligence/0.4" },
      signal: AbortSignal.timeout(12000), next: { revalidate: 86400 } });
    if (!response.ok) throw new Error(code + " provider HTTP " + response.status);
    const parsed = parseHistoricalCsv(await response.text(), {
      season: year + "-" + String((year + 1) % 100).padStart(2,"0"), source: url,
    });
    return { year, rows: parsed.matches, rejected: parsed.rejected };
  }));
  const matches: HistoricalMatch[] = [];
  const coverage: Array<{ season: string; validHalfTime: number; completed: number }> = [];
  const warnings: string[] = [];
  for (let i=0;i<settled.length;i++) {
    const result = settled[i];
    if (result.status === "rejected") {
      warnings.push(seasons[i] + ": " + (result.reason instanceof Error ? result.reason.message : "Unable to retrieve historical scores"));
      continue;
    }
    const valid = result.value.rows.filter((m) =>
      Number.isInteger(m.halfTimeHomeGoals) && Number.isInteger(m.halfTimeAwayGoals) &&
      m.halfTimeHomeGoals! >= 0 && m.halfTimeAwayGoals! >= 0 &&
      m.halfTimeHomeGoals! <= m.homeGoals && m.halfTimeAwayGoals! <= m.awayGoals);
    coverage.push({ season: result.value.year + "-" + String((result.value.year + 1) % 100).padStart(2,"0"),
      validHalfTime: valid.length, completed: result.value.rows.length });
    matches.push(...valid);
  }
  if (!matches.length) {
    return Response.json({ error: "No verified halftime scores returned by provider", warnings, coverage },
      { status: 502 });
  }
  return Response.json({ league: league.name, leagueId, matches, coverage, warnings,
    source: "football-data.co.uk", fetchedAt: new Date().toISOString() });
}
