import { describe, expect, it } from "vitest";
import { isUpcomingPacificToday, todayUpcomingFixtures, isCurrentDayCard } from "../lib/daily-slate";
import type { Fixture } from "../lib/types";

const fixture = (id:string,kickoff:string,status:Fixture["status"]="scheduled"):Fixture=>({
  id,league:"Champions League",leagueId:"uefa.champions",kickoff,status,statusLabel:status,
  source:"ESPN",sourceUpdatedAt:"2026-11-24T12:00:00Z",
  home:{id:"h"+id,name:"Home",shortName:"Home",abbreviation:"H"},
  away:{id:"a"+id,name:"Away",shortName:"Away",abbreviation:"A"},
});

describe("strict daily betting slate uses Pacific calendar dates, not a rolling 72-hour window",()=>{
  it("includes only kickoff times remaining on the same LA calendar date",()=>{
    const now=Date.parse("2026-11-24T23:30:00Z"); // Nov 24, 3:30 PM PST
    expect(isUpcomingPacificToday("2026-11-25T05:00:00Z",now)).toBe(true); // Nov 24 9PM PST
    expect(isUpcomingPacificToday("2026-11-25T08:00:00Z",now)).toBe(false); // Nov 25 midnight PST
    expect(isUpcomingPacificToday("2026-11-24T20:00:00Z",now)).toBe(false); // kickoff passed
    const schedule=[
      fixture("today","2026-11-25T05:00:00Z"),
      fixture("tomorrow","2026-11-25T08:00:00Z"),
      fixture("started","2026-11-24T20:00:00Z"),
      fixture("live","2026-11-25T06:30:00Z","live"),
      fixture("canceled","2026-11-25T06:30:00Z","canceled"),
    ];
    expect(todayUpcomingFixtures(schedule,now).map(m=>m.id)).toEqual(["today"]);
    expect(isCurrentDayCard([{kickoff:schedule[0].kickoff}],now)).toBe(true);
    expect(isCurrentDayCard([{kickoff:schedule[0].kickoff},{kickoff:schedule[1].kickoff}],now)).toBe(false);
  });
  it("handles the spring-forward DST transition without counting LA tomorrow",()=>{
    const now=Date.parse("2026-03-08T09:00:00Z"); // Mar 8, 1 AM PST
    expect(isUpcomingPacificToday("2026-03-08T10:30:00Z",now)).toBe(true); // Mar 8 3:30 AM PDT
    expect(isUpcomingPacificToday("2026-03-09T06:59:00Z",now)).toBe(true); // Mar 8 11:59 PM PDT
    expect(isUpcomingPacificToday("2026-03-09T07:00:00Z",now)).toBe(false); // Mar 9 midnight PDT
  });
  it("never counts invalid kickoff strings or an empty card",()=>{
    expect(isUpcomingPacificToday("not-a-date",Date.now())).toBe(false);
    expect(isCurrentDayCard([],Date.now())).toBe(false);
  });
});
