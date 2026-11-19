export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) throw new Error("Invalid American odds");
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  if (!Number.isFinite(decimal) || decimal <= 1) throw new Error("Decimal odds must be greater than 1");
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

export function impliedProbability(american: number): number {
  return 1 / americanToDecimal(american);
}

export function combineAmericanOdds(odds: number[]): number {
  if (odds.length === 0) throw new Error("At least one price is required");
  const decimal = odds.reduce((total, price) => total * americanToDecimal(price), 1);
  return decimalToAmerican(decimal);
}

export function formatAmerican(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}
