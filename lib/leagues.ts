import type { LeagueId } from "./types";

export const LEAGUES: Array<{ id: LeagueId; name: string; short: string }> = [
  { id: "eng.1", name: "Premier League", short: "EPL" },
  { id: "esp.1", name: "La Liga", short: "LAL" },
  { id: "ger.1", name: "Bundesliga", short: "BUN" },
  { id: "ita.1", name: "Serie A", short: "SA" },
  { id: "fra.1", name: "Ligue 1", short: "L1" },
  { id: "uefa.champions", name: "Champions League", short: "UCL" },
];

export const isLeagueId = (value: string): value is LeagueId => LEAGUES.some((league) => league.id === value);
