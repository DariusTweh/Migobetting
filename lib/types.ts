export type LeagueId = "eng.1" | "esp.1" | "ger.1" | "ita.1" | "fra.1" | "uefa.champions" | "uefa.wchampions" | "usa.1";

export type Team = {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logo?: string;
  record?: string;
  score?: number;
};

export type ProviderOdds = {
  provider: string;
  home?: number;
  draw?: number;
  away?: number;
  overUnder?: number;
};

export type Fixture = {
  id: string;
  leagueId: LeagueId;
  league: string;
  leagueLogo?: string;
  kickoff: string;
  status: "scheduled" | "live" | "final" | "postponed" | "canceled";
  statusLabel: string;
  home: Team;
  away: Team;
  odds?: ProviderOdds;
  source: "ESPN";
  sourceUpdatedAt: string;
};

export type MarketProbability = { key: string; label: string; probability: number; fairAmerican: number };

export type Forecast = {
  fixtureId: string;
  modelVersion: string;
  dataQuality: "good" | "limited" | "insufficient";
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  markets: MarketProbability[];
  scorelines: Array<{ score: string; probability: number }>;
  evidence: string[];
  risks: string[];
  qualified: boolean;
};

export type PaperBet = {
  id: string;
  fixtureId: string;
  fixtureLabel: string;
  market: string;
  americanOdds: number;
  stake: number;
  lockedAt: string;
  kickoff: string;
  status: "open" | "won" | "lost" | "void";
  payout?: number;
};

export type LineupPlayer = {
  id: string;
  name: string;
  position: string;
  jersey?: string;
  starts: number;
  observedMatches: number;
  startingProbability: number;
  confidence: "high" | "medium" | "low";
  goals?: number;
  assists?: number;
  lastObservedAt: string;
};

export type TeamLineup = {
  teamId: string;
  teamName: string;
  status: "PROJECTED" | "CONFIRMED" | "UNKNOWN";
  formation?: string;
  players: LineupPlayer[];
  missingPlayers: Array<{ name: string; reason: string; source: string }>;
  observedMatches: number;
  source: string;
  sourceTimestamp: string;
};

export type LineupIntelligence = {
  fixtureId: string;
  cutoffPolicyMinutes: 90;
  checkedAt: string;
  minutesToKickoff: number;
  home: TeamLineup;
  away: TeamLineup;
  impact: {
    applied: false;
    homeExpectedGoalsDelta: 0;
    awayExpectedGoalsDelta: 0;
    reason: string;
  };
  evidence: Array<{ claim: string; source: string; timestamp: string }>;
  warnings: string[];
};
