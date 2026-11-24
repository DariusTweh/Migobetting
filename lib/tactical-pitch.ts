import type { MatchTape, MatchSide, SimEvent } from "./match-playback";

export type TacticalMarker = { id: string; side: MatchSide; x: number; y: number; index: number; active: boolean };
export type TacticalFrame = {
  players: TacticalMarker[];
  ball: { x: number; y: number };
  trail: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
  attacking: MatchSide;
  event: SimEvent | null;
  phase: string;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const hash = (input: string) => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return h >>> 0;
};
const formation = [
  [7,50],
  [23,16],[23,38],[23,62],[23,84],
  [45,23],[45,50],[45,77],
  [65,24],[65,50],[65,76],
];
const important = (event: SimEvent) =>
  event.kind === "goal" ? 5 : event.kind === "save" ? 4 : event.kind === "shot" ? 3 :
    event.kind === "corner" ? 2 : 1;

export function tacticalFrame(tape: MatchTape, moment: number): TacticalFrame {
  const minute = clamp(Math.floor(moment), 0, 90);
  const events = minute > 0 ? [...(tape.frames[minute - 1]?.events ?? [])].sort((a, b) =>
    important(b) - important(a)) : [];
  const event = events[0] ?? null;
  const passHome = tape.frames[minute - 1]?.increments.home.passes ?? 0;
  const passAway = tape.frames[minute - 1]?.increments.away.passes ?? 0;
  const attacking: MatchSide = event?.side ??
    (passHome === passAway ? (hash(tape.seed + ":" + Math.floor(minute / 4)) % 2 ? "home" : "away") :
      passHome > passAway ? "home" : "away");
  const off = minute === 0 ? 0 : 1;
  const players = tape.players.map((player, index): TacticalMarker => {
    const teamIndex = index % 11;
    const [rawX, rawY] = formation[teamIndex] ?? formation[10];
    const direction = player.side === "home" ? 1 : -1;
    const salt = hash(tape.seed + "/" + player.id) % 200;
    const wobbleX = Math.sin(minute * .23 + salt) * (teamIndex ? 3.4 : 1.2) * off;
    const wobbleY = Math.sin(minute * .37 + salt * .2) * (teamIndex ? 5.6 : 1.5) * off;
    const press = player.side === attacking ? (teamIndex > 0 ? 5 : 0) : -2;
    let x = (player.side === "home" ? rawX : 100 - rawX) +
      direction * (wobbleX + press) * off;
    let y = rawY + wobbleY;
    const active = player.id === event?.playerId;
    if (active && event) {
      if (["goal","shot","save"].includes(event.kind)) {
        x = player.side === "home" ? 88 : 12;
        y = 50 + Math.sin(minute) * 9;
      } else if (event.kind === "corner") {
        x = player.side === "home" ? 89 : 11;
        y = minute % 2 ? 5 : 95;
      }
    }
    return { id: player.id, side: player.side, index: teamIndex,
      x: clamp(x, 3, 97), y: clamp(y, 5, 95), active };
  });

  const teamMarkers = players.filter((p) => p.side === attacking && p.index >= 5);
  const carrier = event ? players.find((p) => p.id === event.playerId) :
    teamMarkers[hash(tape.seed + "/carrier/" + Math.floor(minute / 2)) % teamMarkers.length];
  const shotAtGoal = event && ["goal", "save", "shot"].includes(event.kind);
  const ball = minute === 0 ? { x: 50, y: 50 } : shotAtGoal ?
    { x: event!.side === "home" ? (event!.kind === "goal" ? 97 : 94) :
        (event!.kind === "goal" ? 3 : 6),
      y: clamp(carrier?.y ?? 50, 12, 88) } :
    { x: carrier?.x ?? 50, y: clamp((carrier?.y ?? 50) + 1.7, 4, 96) };
  const previous = minute > 0 && teamMarkers.length > 1
    ? teamMarkers[(hash(tape.seed + "/pass/" + minute) + 1) % teamMarkers.length]
    : null;
  const trail = previous && minute > 0 ?
    { from: { x: previous.x, y: previous.y }, to: ball } : null;
  const phase = minute === 0 ? "KICKOFF" : event?.kind === "goal" ? "GOAL" :
    event?.kind === "save" ? "SHOT SAVED" : event?.kind === "shot" ? "SHOT" :
    event?.kind === "corner" ? "CORNER" : event?.kind === "yellow" ? "BOOKING" :
    attacking === "home" ? tape.homeName + " attack" : tape.awayName + " attack";
  return { players, ball, trail, attacking, event, phase };
}
