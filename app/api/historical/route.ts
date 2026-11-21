const PRESETS: Record<string, { url: string; season: string; competition: string }> = {
  "epl-2026": { url: "https://www.football-data.co.uk/mmz4281/2627/E0.csv", season: "2026-27", competition: "Premier League" },
  "laliga-2026": { url: "https://www.football-data.co.uk/mmz4281/2627/SP1.csv", season: "2026-27", competition: "La Liga" },
  "bundesliga-2026": { url: "https://www.football-data.co.uk/mmz4281/2627/D1.csv", season: "2026-27", competition: "Bundesliga" },
  "seriea-2026": { url: "https://www.football-data.co.uk/mmz4281/2627/I1.csv", season: "2026-27", competition: "Serie A" },
  "ligue1-2026": { url: "https://www.football-data.co.uk/mmz4281/2627/F1.csv", season: "2026-27", competition: "Ligue 1" },
  "epl-2025": { url: "https://www.football-data.co.uk/mmz4281/2526/E0.csv", season: "2025-26", competition: "Premier League" },
  "epl-2024": { url: "https://www.football-data.co.uk/mmz4281/2425/E0.csv", season: "2024-25", competition: "Premier League" },
  "laliga-2025": { url: "https://www.football-data.co.uk/mmz4281/2526/SP1.csv", season: "2025-26", competition: "La Liga" },
  "bundesliga-2025": { url: "https://www.football-data.co.uk/mmz4281/2526/D1.csv", season: "2025-26", competition: "Bundesliga" },
  "seriea-2025": { url: "https://www.football-data.co.uk/mmz4281/2526/I1.csv", season: "2025-26", competition: "Serie A" },
  "ligue1-2025": { url: "https://www.football-data.co.uk/mmz4281/2526/F1.csv", season: "2025-26", competition: "Ligue 1" },
  "epl-2023": { url: "https://www.football-data.co.uk/mmz4281/2324/E0.csv", season: "2023-24", competition: "Premier League" },
  "laliga-2024": { url: "https://www.football-data.co.uk/mmz4281/2425/SP1.csv", season: "2024-25", competition: "La Liga" },
  "laliga-2023": { url: "https://www.football-data.co.uk/mmz4281/2324/SP1.csv", season: "2023-24", competition: "La Liga" },
  "bundesliga-2024": { url: "https://www.football-data.co.uk/mmz4281/2425/D1.csv", season: "2024-25", competition: "Bundesliga" },
  "bundesliga-2023": { url: "https://www.football-data.co.uk/mmz4281/2324/D1.csv", season: "2023-24", competition: "Bundesliga" },
  "seriea-2024": { url: "https://www.football-data.co.uk/mmz4281/2425/I1.csv", season: "2024-25", competition: "Serie A" },
  "seriea-2023": { url: "https://www.football-data.co.uk/mmz4281/2324/I1.csv", season: "2023-24", competition: "Serie A" },
  "ligue1-2024": { url: "https://www.football-data.co.uk/mmz4281/2425/F1.csv", season: "2024-25", competition: "Ligue 1" },
  "ligue1-2023": { url: "https://www.football-data.co.uk/mmz4281/2324/F1.csv", season: "2023-24", competition: "Ligue 1" },
};

const CORE_BUNDLE = Object.entries(PRESETS).filter(([key]) => /-(2023|2024|2025|2026)$/.test(key));

async function downloadDataset(preset: { url: string; season: string; competition: string }) {
  const response = await fetch(preset.url, { headers: { Accept: "text/csv", "User-Agent": "MIGO-Soccer-Intelligence/0.3" }, signal: AbortSignal.timeout(20000), next: { revalidate: 86400 } });
  if (!response.ok) throw new Error(`${preset.competition} ${preset.season}: provider returned ${response.status}`);
  return { ...preset, csv: await response.text() };
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  if (search.get("bundle") === "core") {
    const settled = await Promise.allSettled(CORE_BUNDLE.map(([, preset]) => downloadDataset(preset)));
    const datasets = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const errors = settled.flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "Historical provider failed"] : []);
    if (datasets.length === 0) return Response.json({ error: "No historical datasets could be downloaded", errors }, { status: 502 });
    return Response.json({ datasets, errors, source: "football-data.co.uk", fetchedAt: new Date().toISOString() });
  }
  const key = search.get("preset") ?? "";
  const preset = PRESETS[key];
  if (!preset) return Response.json({ error: "Unsupported historical preset" }, { status: 400 });
  try {
    const dataset = await downloadDataset(preset);
    return new Response(dataset.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "X-MIGO-Season": preset.season, "X-MIGO-Competition": preset.competition, "X-MIGO-Source": preset.url } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Historical provider failed" }, { status: 502 });
  }
}
