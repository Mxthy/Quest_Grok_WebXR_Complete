export type ScheduleBeat = {
  hour: number;
  minute: number;
  label: string;
  anim: "idle" | "walk";
  position: [number, number, number];
  look: [number, number, number] | null;
};

/** 20 real minutes = 24 game hours → 1.2 game minutes per real second. */
export const GAME_MINUTES_PER_REAL_SECOND = 1440 / (20 * 60);

export const SCHEDULE: ScheduleBeat[] = [
  { hour: 8, minute: 0, label: "Waking", anim: "idle", position: [8.55, 0, 2.45], look: [8.55, 1.4, 1.2] },
  { hour: 8, minute: 30, label: "Kitchen", anim: "walk", position: [1.35, 0, 3.2], look: [0.6, 1.2, 3.2] },
  { hour: 10, minute: 0, label: "Couch", anim: "walk", position: [3.35, 0, 3.55], look: [3.0, 1.4, 0.2] },
  { hour: 14, minute: 0, label: "Window", anim: "walk", position: [3.15, 0, 0.85], look: [3.0, 1.5, -2] },
  { hour: 18, minute: 0, label: "Cooking", anim: "walk", position: [1.25, 0, 2.55], look: [0.55, 1.1, 2.4] },
  { hour: 22, minute: 0, label: "Bed", anim: "walk", position: [8.55, 0, 2.45], look: [9.4, 1.0, 2.45] },
];

export function beatAt(gameMinutes: number): ScheduleBeat {
  const m = ((gameMinutes % 1440) + 1440) % 1440;
  let current = SCHEDULE[0]!;
  for (const b of SCHEDULE) {
    const t = b.hour * 60 + b.minute;
    if (m >= t) current = b;
  }
  return current;
}

export function formatClock(gameMinutes: number) {
  const m = Math.floor(((gameMinutes % 1440) + 1440) % 1440);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const hh = ((h + 11) % 12) + 1;
  const ap = h >= 12 ? "PM" : "AM";
  return `${hh}:${mm.toString().padStart(2, "0")} ${ap}`;
}

export function sunFactor(gameMinutes: number) {
  const h = (((gameMinutes % 1440) + 1440) % 1440) / 60;
  // 0 night, 1 noon
  const x = (h - 6) / 12;
  if (h < 5.5 || h > 21) return 0.04;
  if (h < 7) return 0.04 + ((h - 5.5) / 1.5) * 0.5;
  if (h > 19) return Math.max(0.04, 0.7 - ((h - 19) / 2) * 0.66);
  return 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, x)));
}

export function isNight(gameMinutes: number) {
  const h = (((gameMinutes % 1440) + 1440) % 1440) / 60;
  return h < 6.5 || h >= 19.5;
}

export function isAwakeHour(gameMinutes: number) {
  const h = (((gameMinutes % 1440) + 1440) % 1440) / 60;
  return h >= 8 && h < 22.2;
}
