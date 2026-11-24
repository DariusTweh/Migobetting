import type { Fixture } from "./types";
import { localDateKey, todayKey } from "./date-time";

/**
 * A Daily Double / all-day Banger is a calendar-day slate, NOT a rolling
 * 72-hour horizon. Dates are America/Los_Angeles, including DST transitions.
 */
export function isUpcomingPacificToday(kickoff: string, now = Date.now()): boolean {
  const kickoffMs = Date.parse(kickoff);
  return Number.isFinite(kickoffMs) && kickoffMs > now &&
    localDateKey(new Date(kickoffMs)) === todayKey(new Date(now));
}

export function todayUpcomingFixtures(fixtures: Fixture[], now = Date.now()): Fixture[] {
  return fixtures.filter(fixture =>
    fixture.status === "scheduled" && isUpcomingPacificToday(fixture.kickoff, now));
}

export function isCurrentDayCard(legs: ReadonlyArray<{kickoff: string}>, now = Date.now()): boolean {
  return legs.length > 0 && legs.every(leg => isUpcomingPacificToday(leg.kickoff, now));
}
