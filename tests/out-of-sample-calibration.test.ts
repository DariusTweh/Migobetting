import { afterEach, describe, expect, it, vi } from "vitest";
import {
  correctProbability,evaluateCalibration,evaluateCalibrationGroups,
  readCalibrationProfile,saveApprovedCalibrations,getCorrection,
  type CalibrationSample,
} from "../lib/out-of-sample-calibration";
import { calibrateFirstHalfForecast } from "../lib/half-time-calibration";
import { calibrateFullTimeForecast } from "../lib/full-time-calibration";
import { forecastFixture } from "../lib/model";
import type { FirstHalfForecast } from "../lib/first-half-model";
import type { Fixture } from "../lib/types";

afterEach(()=>vi.unstubAllGlobals());
const sample=(i:number,p:number,won:boolean,market="over-1.5"):CalibrationSample=>({
  date:new Date(Date.UTC(2024,0,1+i*2,12)).toISOString(),
  competition:"FT:Premier League",market,probability:p,won,
});
const data=Array.from({length:200},(_,i)=>sample(i,.82,i%5<3));
const fixture:Fixture={
  id:"prem-1",leagueId:"eng.1",league:"Premier League",kickoff:"2027-08-01T15:00:00Z",
  status:"scheduled",statusLabel:"Scheduled",source:"ESPN",sourceUpdatedAt:"2026-11-24T07:00:00Z",
  home:{id:"a",name:"Arsenal",shortName:"Arsenal",abbreviation:"ARS",record:"20-5-5"},
  away:{id:"b",name:"Chelsea",shortName:"Chelsea",abbreviation:"CHE",record:"14-7-9"},
};

describe("out-of-sample chronological calibration gates",()=>{
  it("approves a correction only after training, validation and later test all improve",()=>{
    const result=evaluateCalibration(data);
    expect(result.decision).toBe("approved");
    expect(result.correction?.nTrain).toBeGreaterThan(65);
    expect(result.correction?.nValidation).toBeGreaterThan(30);
    expect(result.correction?.nTest).toBeGreaterThan(30);
    expect(result.calibratedBrier!).toBeLessThan(result.rawBrier!);
    expect(result.calibratedLogLoss!).toBeLessThan(result.rawLogLoss!);
    expect(result.correction?.trainedThrough).toBe("2025-02-02");
    expect(correctProbability(.82,result.correction!)).toBeLessThan(.82);
  });
  it("rejects a correction if the held-out regime no longer improves",()=>{
    const shifted=Array.from({length:200},(_,i)=>sample(i,.75,i<155?i%5<3:i%4<3));
    const result=evaluateCalibration(shifted);
    expect(result.decision).not.toBe("approved");
    expect(result.correction).toBeNull();
  });
  it("does not fit insufficient samples or mixed markets",()=>{
    expect(evaluateCalibration(data.slice(0,80)).decision).toBe("insufficient");
    expect(evaluateCalibration([data[0],{...data[1],market:"away"}]).decision).toBe("insufficient");
    expect(evaluateCalibrationGroups([...data,...data.map(m=>({...m,market:"btts"}))])).toHaveLength(2);
  });
  it("persists approved corrections, revokes failed ones and never applies them to older fixtures",()=>{
    const storage=new Map<string,string>();
    vi.stubGlobal("window",{
      localStorage:{
        getItem:(key:string)=>storage.get(key)??null,
        setItem:(key:string,value:string)=>{storage.set(key,value);},
      },dispatchEvent:vi.fn(),
    });
    const passing=evaluateCalibration(data);
    const profile=saveApprovedCalibrations([passing]);
    expect(profile?.corrections).toHaveLength(1);
    expect(readCalibrationProfile()?.corrections).toHaveLength(1);
    expect(getCorrection("FT:Premier League","over-1.5",profile!,"2027-08-01T15:00:00Z",
      "migo-opponent-decay-dc-0.4")).not.toBeNull();
    expect(getCorrection("FT:Premier League","over-1.5",profile!,"2024-12-01T15:00:00Z",
      "migo-opponent-decay-dc-0.4")).toBeNull();
    expect(getCorrection("FT:Premier League","over-1.5",profile!,"2027-08-01T15:00:00Z",
      "different-algorithm")).toBeNull();
    saveApprovedCalibrations([{...passing,decision:"rejected",correction:null}]);
    expect(readCalibrationProfile()?.corrections).toHaveLength(0);
  });
  it("keeps coherent full-time goal totals and derives double chance from 1X2",()=>{
    const raw=forecastFixture(fixture,{
      expectedHomeGoals:1.8,expectedAwayGoals:1.2,
      version:"migo-opponent-decay-dc-0.4",quality:"good",
      evidence:[],risks:[],
    });
    const row=evaluateCalibration(data).correction!;
    const profile={
      schema:1 as const,updatedAt:"2026-12-01T00:00:00Z",
      corrections:[
        {...row,market:"over-1.5"},
        {...row,market:"over-2.5"},
        {...row,market:"under-3.5"},
        {...row,market:"btts"},
      ],
    };
    const adjusted=calibrateFullTimeForecast(raw,fixture.league,fixture.kickoff,profile);
    const probability=(key:string)=>adjusted.markets.find(m=>m.key===key)!.probability;
    expect(adjusted.modelVersion).toContain("oos-calibrated");
    expect(probability("over-1.5")).toBeGreaterThanOrEqual(probability("over-2.5"));
    expect(probability("under-3.5")).toBeGreaterThanOrEqual(1-probability("over-2.5"));
    expect(probability("btts")).toBeLessThanOrEqual(probability("over-1.5"));
    expect(probability("home-draw")).toBeCloseTo(adjusted.homeWin+adjusted.draw);
    expect(calibrateFullTimeForecast(raw,fixture.league,"2024-03-01T00:00:00Z",profile)).toBe(raw);
  });
  it("keeps 1H markets logically ordered and raw scorelines unchanged",()=>{
    const ft=evaluateCalibration(data).correction!;
    const raw:FirstHalfForecast={
      modelVersion:"migo-first-half-cross-league-v2",quality:"good",
      historicalMatches:300,effectiveMatches:120,homeTeamMatches:40,awayTeamMatches:35,
      expectedHomeGoals:.7,expectedAwayGoals:.45,
      markets:[
        {key:"first-half-over-0.5",label:"Over 0.5",probability:.82},
        {key:"first-half-over-1.5",label:"Over 1.5",probability:.48},
        {key:"home-first-half-goal",label:"Home scores",probability:.51},
        {key:"away-first-half-goal",label:"Away scores",probability:.38},
        {key:"half-time-draw",label:"HT draw",probability:.36},
      ],
      halfTimeScores:[{score:"0-0",probability:.28}],
      notes:[],trainingCompetitions:[{name:"Premier League",matches:300}],
      homeSignals:{matches:40,homeMatches:20,awayMatches:20,attackIndex:1,defensiveVulnerability:1,
        recentFirstHalfScored:.7,recentFirstHalfAllowed:.4,recentFirstHalfOver05:6,recentSample:10},
      awaySignals:{matches:35,homeMatches:17,awayMatches:18,attackIndex:1,defensiveVulnerability:1,
        recentFirstHalfScored:.5,recentFirstHalfAllowed:.6,recentFirstHalfOver05:7,recentSample:10},
    };
    const profile={schema:1 as const,updatedAt:"2026-12-01T00:00:00Z",
      corrections:[{...ft,competition:"1H:Premier League",
        market:"first-half-over-0.5",forecastVersion:"migo-first-half-cross-league-v2"}]};
    const adjusted=calibrateFirstHalfForecast(raw,"Premier League",fixture.kickoff,profile);
    expect(adjusted.markets[0].probability).toBeLessThan(raw.markets[0].probability);
    expect(adjusted.markets[0].probability).toBeGreaterThanOrEqual(adjusted.markets[1].probability);
    expect(adjusted.halfTimeScores).toEqual(raw.halfTimeScores);
  });
});
