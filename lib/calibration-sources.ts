import type { BacktestPrediction } from "./history";
import type { FirstHalfValidationSample } from "./first-half-validation";
import type { CalibrationSample } from "./out-of-sample-calibration";

/** Realized outcomes for independent full-time probabilities. Double chance is derived from the calibrated 1X2 simplex, never independently distorted. */
export function fullTimeCalibrationSamples(predictions: BacktestPrediction[]):CalibrationSample[] {
  return predictions.flatMap(p=>{
    const goals=p.actualHomeGoals+p.actualAwayGoals;
    const outcomes=[
      ["home",p.probabilities.home,p.actualOutcome==="home"],
      ["draw",p.probabilities.draw,p.actualOutcome==="draw"],
      ["away",p.probabilities.away,p.actualOutcome==="away"],
      ["over-1.5",p.probabilities.over15,goals>=2],
      ["over-2.5",p.probabilities.over25,goals>=3],
      ["under-3.5",p.probabilities.under35,goals<=3],
      ["btts",p.probabilities.btts,p.actualHomeGoals>0&&p.actualAwayGoals>0],
    ] as Array<[string,number,boolean]>;
    return outcomes.map(([market,probability,won])=>({
      date:p.date,competition:"FT:"+p.competition,market,probability,won,
    }));
  });
}
/** Each half-time sample carries its competition from the associated report. */
export function firstHalfSamplesForCompetition(samples:FirstHalfValidationSample[], competition:string):CalibrationSample[] {
  return samples.map(s=>({
    date:s.date,competition:"1H:"+competition,market:s.market,
    probability:s.probability,won:s.observed,
  }));
}
