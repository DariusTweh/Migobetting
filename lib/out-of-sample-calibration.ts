/**
 * Chronological probability calibration. Market-by-market adjustments are
 * promoted only after a train -> validation -> untouched later test sequence.
 * Nothing in this module forecasts a match or reads its final score.
 */
export type CalibrationSample = {
  date: string;
  competition: string;
  market: string;
  probability: number;
  won: boolean;
};
export type ProbabilityCorrection = {
  competition: string;
  market: string;
  intercept: number;
  slope: number;
  model: "logit-affine-v1";
  nTrain: number;
  nValidation: number;
  nTest: number;
  rawBrier: number;
  calibratedBrier: number;
  rawLogLoss: number;
  calibratedLogLoss: number;
  cutoff: string;
  trainedThrough: string;
  forecastVersion: string;
};
export type CalibrationDecision = {
  competition: string;
  market: string;
  sampleSize: number;
  decision: "approved" | "rejected" | "insufficient";
  correction: ProbabilityCorrection | null;
  rawBrier: number | null;
  calibratedBrier: number | null;
  rawLogLoss: number | null;
  calibratedLogLoss: number | null;
  reason: string;
};
export type CalibrationProfile = {
  schema: 1;
  updatedAt: string;
  corrections: ProbabilityCorrection[];
};
export const CALIBRATION_STORAGE_KEY = "migo:oos-calibration:v1";
export const CALIBRATION_EVENT = "migo:calibration";
const clamp = (v: number) => Math.max(0.00001, Math.min(0.99999, v));
const logit = (p: number) => Math.log(clamp(p) / (1 - clamp(p)));
export function correctProbability(p: number, c: Pick<ProbabilityCorrection,"intercept"|"slope">): number {
  if (!Number.isFinite(p) || p < 0 || p > 1) return p;
  return clamp(1 / (1 + Math.exp(-Math.max(-30, Math.min(30, c.intercept + c.slope * logit(p))))));
}
const brier = (rows: CalibrationSample[], c?: Pick<ProbabilityCorrection,"intercept"|"slope">) =>
  rows.reduce((n, r) => n + ((c ? correctProbability(r.probability,c) : r.probability) - Number(r.won)) ** 2,0) / rows.length;
const logLoss = (rows: CalibrationSample[], c?: Pick<ProbabilityCorrection,"intercept"|"slope">) =>
  rows.reduce((n,r)=>{
    const p=clamp(c ? correctProbability(r.probability,c) : r.probability);
    return n-(r.won?Math.log(p):Math.log(1-p));
  },0)/rows.length;

/**
 * Only trained from forecasts originally generated with prior-match data.
 * Keep every match date in one partition, preventing same-day leakage.
 */
export function evaluateCalibration(samples: CalibrationSample[]): CalibrationDecision {
  const clean = samples.filter(s=>Number.isFinite(Date.parse(s.date)) && s.probability>0 &&
    s.probability<1 && Number.isFinite(s.probability)).sort((a,b)=>a.date.localeCompare(b.date));
  const first=clean[0];
  const base={competition:first?.competition??"",market:first?.market??"",sampleSize:clean.length};
  if (!first || clean.some(s=>s.competition!==first.competition||s.market!==first.market))
    return {...base,decision:"insufficient",correction:null,rawBrier:null,calibratedBrier:null,
      rawLogLoss:null,calibratedLogLoss:null,reason:"Pass one competition and one exact market at a time."};
  const days=[...new Set(clean.map(s=>s.date.slice(0,10)))];
  if(clean.length<150 || days.length<45)return {...base,decision:"insufficient",correction:null,
    rawBrier:null,calibratedBrier:null,rawLogLoss:null,calibratedLogLoss:null,
    reason:"At least 150 earlier out-of-sample forecasts spanning 45 distinct match days are required."};
  const valDay=days[Math.floor(days.length*.60)],testDay=days[Math.floor(days.length*.80)];
  const train=clean.filter(s=>s.date.slice(0,10)<valDay);
  const validate=clean.filter(s=>s.date.slice(0,10)>=valDay && s.date.slice(0,10)<testDay);
  const test=clean.filter(s=>s.date.slice(0,10)>=testDay);
  if(train.length<65||validate.length<30||test.length<30)
    return {...base,decision:"insufficient",correction:null,rawBrier:null,
      calibratedBrier:null,rawLogLoss:null,calibratedLogLoss:null,
      reason:"Not enough chronologically separated training, validation, and final-test matches."};
  let best={intercept:0,slope:1};
  let score=Infinity;
  // Restrained log-odds calibration. Fit strictly on training forecasts only.
  for(let i=-6;i<=6;i++)for(const slope of [.8,.9,1,1.1,1.2]){
    const intercept=i*.075;
    const candidate={intercept,slope};
    const loss=brier(train,candidate)+.004*(intercept**2+(slope-1)**2);
    if(loss<score){score=loss;best=candidate;}
  }
  const rawVal=brier(validate),newVal=brier(validate,best);
  const rawTest=brier(test),newTest=brier(test,best);
  const rawLog=logLoss(test),newLog=logLoss(test,best);
  const approved=(rawVal-newVal)>=.001 && (rawTest-newTest)>=.001 &&
    (rawLog-newLog)>=.001 && (best.intercept!==0||best.slope!==1);
  return {...base,decision:approved?"approved":"rejected",
    correction:approved?{
      ...base,intercept:best.intercept,slope:best.slope,model:"logit-affine-v1",
      nTrain:train.length,nValidation:validate.length,nTest:test.length,
      rawBrier:rawTest,calibratedBrier:newTest,rawLogLoss:rawLog,calibratedLogLoss:newLog,
      cutoff:testDay,trainedThrough:clean[clean.length-1].date.slice(0,10),
      forecastVersion:first.competition.startsWith("1H:")?"migo-first-half-cross-league-v2":"migo-opponent-decay-dc-0.4",
    }:null,
    rawBrier:rawTest,calibratedBrier:newTest,rawLogLoss:rawLog,calibratedLogLoss:newLog,
    reason:approved?
      "Improved Brier and log loss on later unseen matches after separate parameter fitting and validation.":
      "No reliable held-out improvement; raw model probability remains active.",
  };
}
export function evaluateCalibrationGroups(samples: CalibrationSample[]): CalibrationDecision[] {
  const groups=new Map<string,CalibrationSample[]>();
  for(const sample of samples){
    const k=JSON.stringify([sample.competition,sample.market]);
    groups.set(k,[...(groups.get(k)??[]),sample]);
  }
  return [...groups.values()].map(evaluateCalibration).sort((a,b)=>
    a.competition.localeCompare(b.competition)||a.market.localeCompare(b.market));
}
export function readCalibrationProfile(): CalibrationProfile | null {
  if(typeof window==="undefined")return null;
  try {
    const data=JSON.parse(window.localStorage.getItem(CALIBRATION_STORAGE_KEY)??"null") as CalibrationProfile|null;
    if(!data||data.schema!==1||!Array.isArray(data.corrections))return null;
    return data;
  }catch{return null;}
}
export function getCorrection(competition:string,market:string,profile:CalibrationProfile|null=readCalibrationProfile(),
  kickoff?:string,modelVersion?:string) {
  const correction=profile?.corrections.find(c=>c.competition===competition&&c.market===market)??null;
  if(!correction)return null;
  // A later backtest revision cannot silently rewrite an already historical prediction.
  if(kickoff && (!Number.isFinite(Date.parse(kickoff)) ||
    kickoff.slice(0,10)<=correction.trainedThrough))return null;
  if(modelVersion && correction.forecastVersion!==modelVersion)return null;
  return correction;
}
export function correctedMarketProbability(competition:string,market:string,p:number,
  profile:CalibrationProfile|null=readCalibrationProfile(),kickoff?:string,modelVersion?:string):number {
  const correction=getCorrection(competition,market,profile,kickoff,modelVersion);
  return correction?correctProbability(p,correction):p;
}
export function saveApprovedCalibrations(decisions:CalibrationDecision[]):CalibrationProfile|null {
  if(typeof window==="undefined")return null;
  const active=readCalibrationProfile()?.corrections??[];
  // Explicitly evaluated markets replace earlier corrections, including rejected ones:
  // a correction that stopped passing holdout validation is revoked.
  const keys=new Set(decisions.map(d=>JSON.stringify([d.competition,d.market])));
  const remaining=active.filter(c=>!keys.has(JSON.stringify([c.competition,c.market])));
  const corrections=[...remaining,...decisions.flatMap(d=>d.correction?[d.correction]:[])];
  const profile:CalibrationProfile={schema:1,updatedAt:new Date().toISOString(),corrections};
  window.localStorage.setItem(CALIBRATION_STORAGE_KEY,JSON.stringify(profile));
  window.dispatchEvent(new Event(CALIBRATION_EVENT));
  return profile;
}
