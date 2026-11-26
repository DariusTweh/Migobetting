export const UEFA_MEN = new Set(["Champions League","UEFA Champions League","Europa League","UEFA Europa League","UEFA Conference League","Conference League"]);
export const EXTRA_DOMESTIC_ESPN = {
 "aut.1":"Austrian Bundesliga","sui.1":"Swiss Super League","den.1":"Danish Superliga","nor.1":"Norwegian Eliteserien","swe.1":"Swedish Allsvenskan",
} as const;
export const DOMESTIC_CSV_IDS=["eng.1","esp.1","ger.1","ita.1","fra.1","nl.1","por.1","bel.1","tur.1","gre.1","sco.1"];
export const DOMESTIC_MEN=new Set(["Premier League","La Liga","Bundesliga","Serie A","Ligue 1","Eredivisie","Primeira Liga","Belgian Pro League","Turkish Super Lig","Greek Super League","Scottish Premiership",...Object.values(EXTRA_DOMESTIC_ESPN)]);
export const isUefaMen=(name:string)=>UEFA_MEN.has(name);
export const eligibleUefaHistory=(name:string)=>UEFA_MEN.has(name)||DOMESTIC_MEN.has(name);
export const ftVersion=(name:string)=>isUefaMen(name)?"migo-uefa-cross-league-ft-v1":"migo-opponent-decay-dc-0.4";
export const htCalibrationVersion=(name:string)=>isUefaMen(name)?"migo-uefa-cross-league-ht-v3":"migo-first-half-cross-league-v2";
