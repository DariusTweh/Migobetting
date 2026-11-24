import type { Forecast } from "./types";
import { decimalToAmerican } from "./odds";
import {
  readCalibrationProfile,getCorrection,correctProbability,
  type CalibrationProfile,
} from "./out-of-sample-calibration";

const pBounds=(p:number)=>Math.max(.00001,Math.min(.99999,p));
function fairPrice(p:number){return decimalToAmerican(1/pBounds(p));}

/** Full-time market overlays only. Scoreline simulation remains coherent and raw. */
export function calibrateFullTimeForecast(
  forecast:Forecast,competition:string,kickoff:string,
  profile:CalibrationProfile|null=readCalibrationProfile(),
):Forecast {
  if(!profile || forecast.dataQuality==="insufficient" ||
    !forecast.modelVersion.startsWith("migo-opponent-decay-dc-0.4"))return forecast;
  const prefix="FT:"+competition;
  const correction=(key:string)=>getCorrection(prefix,key,profile,kickoff,"migo-opponent-decay-dc-0.4");
  const adjusted=(key:string,raw:number)=>correction(key)?
    correctProbability(raw,correction(key)!):raw;
  const homeC=correction("home"),drawC=correction("draw"),awayC=correction("away");
  const triple=homeC&&drawC&&awayC;
  let home=forecast.homeWin,draw=forecast.draw,away=forecast.awayWin;
  if(triple){
    const h=correctProbability(home,homeC),d=correctProbability(draw,drawC),
      a=correctProbability(away,awayC);
    const total=h+d+a;
    home=h/total;draw=d/total;away=a/total;
  }
  const raw=new Map(forecast.markets.map(m=>[m.key,m.probability]));
  const rawOver15=raw.get("over-1.5")??0,rawOver25=raw.get("over-2.5")??0,
    rawUnder35=raw.get("under-3.5")??0,rawBTTS=raw.get("btts")??0;
  const over15=adjusted("over-1.5",rawOver15);
  const over25=Math.min(over15,adjusted("over-2.5",rawOver25));
  const under35=Math.max(1-over25,adjusted("under-3.5",rawUnder35));
  const btts=Math.min(over15,adjusted("btts",rawBTTS));
  const values:Record<string,number>={
    home,draw,away,"home-draw":home+draw,"away-draw":away+draw,
    "over-1.5":over15,"over-2.5":over25,"under-3.5":under35,btts,
  };
  const changed=forecast.markets.some(m=>Math.abs((values[m.key]??m.probability)-m.probability)>1e-7);
  if(!changed)return forecast;
  const markets=forecast.markets.map(m=>{
    const probability=pBounds(values[m.key]??m.probability);
    return {...m,probability,fairAmerican:fairPrice(probability)};
  }).sort((a,b)=>b.probability-a.probability);
  return {
    ...forecast,homeWin:home,draw,awayWin:away,markets,
    modelVersion:forecast.modelVersion+"+oos-calibrated",
    evidence:[...forecast.evidence,"Out-of-sample validated corrections applied to eligible full-time markets."],
    risks:[...forecast.risks,
      "Displayed calibrated market probabilities may not reproduce the unadjusted goal-by-goal Monte Carlo score distribution.",
      "Different fixtures' outcomes remain correlated; calibrated single markets do not prove parlay profitability."],
    qualified:forecast.qualified&&markets.some(m=>m.probability>=.68),
  };
}
