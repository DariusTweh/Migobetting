import { htCalibrationVersion } from "./uefa-competitions";
import type { FirstHalfForecast } from "./first-half-model";
import {
  readCalibrationProfile,correctedMarketProbability,
  type CalibrationProfile,
} from "./out-of-sample-calibration";

/** Overlay validated probabilities without modifying the raw 1H score distribution. */
export function calibrateFirstHalfForecast(
  forecast:FirstHalfForecast,competition:string,kickoff:string,
  profile:CalibrationProfile|null=readCalibrationProfile(),
):FirstHalfForecast {
  if(!profile)return forecast;
  const original=new Map(forecast.markets.map(m=>[m.key,m.probability]));
  const probabilities=new Map(forecast.markets.map(m=>[
    m.key,correctedMarketProbability("1H:"+competition,m.key,m.probability,
      profile,kickoff,htCalibrationVersion(competition)),
  ]));
  const over05=probabilities.get("first-half-over-0.5")!;
  const over15=Math.min(over05,probabilities.get("first-half-over-1.5")!);
  probabilities.set("first-half-over-1.5",over15);
  // A team scoring before half-time implies at least one goal in the half.
  probabilities.set("home-first-half-goal",Math.min(over05,probabilities.get("home-first-half-goal")!));
  probabilities.set("away-first-half-goal",Math.min(over05,probabilities.get("away-first-half-goal")!));
  const changed=[...probabilities].some(([k,v])=>Math.abs(v-(original.get(k)??v))>1e-7);
  if(!changed)return forecast;
  return {
    ...forecast,
    markets:forecast.markets.map(m=>({...m,probability:probabilities.get(m.key)??m.probability})),
    notes:[...forecast.notes,
      "Displayed first-half market percentages include independently verified out-of-sample corrections. " +
      "Raw half-time scorelines and expected goal rates are unchanged."],
  };
}
