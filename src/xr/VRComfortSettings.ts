/**
 * Comfort settings for Quest locomotion — persisted in localStorage.
 * Defaults favour comfort: teleport + snap turn + vignette (KB locomotion-comfort).
 */

export type LocomotionMode = "smooth" | "teleport" | "both";
export type TurnMode = "snap" | "smooth";

export type VRComfortConfig = {
  locomotion: LocomotionMode;
  turn: TurnMode;
  moveSpeed: number;
  snapAngleDeg: number;
  smoothTurnSpeed: number;
  vignette: boolean;
  heightOffset: number;
  seated: boolean;
  teleportEnabled: boolean;
  smoothEnabled: boolean;
};

const KEY = "vivi-vr-comfort-v1";

export const DEFAULT_COMFORT: VRComfortConfig = {
  locomotion: "teleport",
  turn: "snap",
  moveSpeed: 1.6,
  snapAngleDeg: 30,
  smoothTurnSpeed: 1.6,
  vignette: true,
  heightOffset: 0,
  seated: false,
  teleportEnabled: true,
  smoothEnabled: false,
};

export function loadComfort(): VRComfortConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_COMFORT };
    const parsed = JSON.parse(raw) as Partial<VRComfortConfig>;
    const next = { ...DEFAULT_COMFORT, ...parsed };
    if (next.smoothEnabled && next.teleportEnabled) next.locomotion = "both";
    else if (next.smoothEnabled) next.locomotion = "smooth";
    else next.locomotion = "teleport";
    return next;
  } catch {
    return { ...DEFAULT_COMFORT };
  }
}

export function saveComfort(cfg: VRComfortConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* quota / private mode */
  }
}

export function updateComfort(partial: Partial<VRComfortConfig>): VRComfortConfig {
  const next = { ...loadComfort(), ...partial };
  if (partial.smoothEnabled !== undefined || partial.teleportEnabled !== undefined) {
    if (next.smoothEnabled && next.teleportEnabled) next.locomotion = "both";
    else if (next.smoothEnabled) next.locomotion = "smooth";
    else {
      next.locomotion = "teleport";
      next.teleportEnabled = true;
    }
  }
  saveComfort(next);
  return next;
}
