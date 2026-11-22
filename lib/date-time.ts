export const APP_TIME_ZONE = "America/Los_Angeles";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

export function localDateKey(value: string | Date): string {
  const parts = partsFormatter.formatToParts(typeof value === "string" ? new Date(value) : value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function offsetDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export const todayKey = (now = new Date()) => localDateKey(now);

export function formatKickoffTime(kickoff: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(kickoff));
}

export function formatDayLabel(key: string, style: "long" | "short" = "long"): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE, weekday: style === "long" ? "long" : "short",
    month: style === "long" ? "long" : "short", day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 20)));
}

export function formatMatchDateTime(kickoff: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(kickoff));
}
