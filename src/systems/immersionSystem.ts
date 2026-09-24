/**
 * Immersion director — turns companion + proximity into continuous sensory feedback.
 * One place for: breath rate, look intensity, ambient duck, light temperature, haptic.
 */
import type { CompanionState } from "@/companion/types";
import type { Warmth } from "@/companion/types";
import { setAmbience, playProximityTone, setImmersionMix } from "@/systems/audioSystem";
import {
  tickCloth,
  tickClosePulse,
  tickFootsteps,
  playSpatialGiggle,
} from "@/systems/spatialAudio";

export type ImmersionFrame = {
  /** 0 far … 1 intimate distance */
  proximity: number;
  /** meters to Vivi */
  distance: number;
  breathHz: number;
  lookSnap: number;
  ambientVol: number;
  /** 0 cool night … 1 warm close */
  warmthLight: number;
  expressionBias: number;
  hapticIdle: number;
  vignette: number;
};

const _state: ImmersionFrame = {
  proximity: 0,
  distance: 99,
  breathHz: 0.35,
  lookSnap: 5,
  ambientVol: 0.22,
  warmthLight: 0.4,
  expressionBias: 0.5,
  hapticIdle: 0,
  vignette: 0,
};

export function getImmersion(): ImmersionFrame {
  // Micro-SFX driven by same frame (positions set by engine)
  tickCloth({
    dt: input.dt,
    proximity: prox,
    moving: input.viviMoving,
    turning: input.viviTurning,
  });
  tickClosePulse({ dt: input.dt, proximity: prox, consent: input.consent });
  if (input.viviMoving) {
    tickFootsteps({ dt: input.dt, moving: true, isPlayer: false, surface: "soft" });
  }
  if (input.playerMoving) {
    tickFootsteps({ dt: input.dt, moving: true, isPlayer: true, surface: "wood" });
  }

  return _state;
}

export { playSpatialGiggle };


function warmth01(w: Warmth): number {
  if (w === "high") return 1;
  if (w === "low") return 0.25;
  return 0.55;
}

/**
 * Call once per frame from the engine.
 */
export function tickImmersion(input: {
  dt: number;
  playerPos: { x: number; z: number };
  viviPos: { x: number; z: number };
  companion: CompanionState;
  consent: boolean;
  presenting: boolean;
  night: boolean;
  viviMoving?: boolean;
  viviTurning?: boolean;
  playerMoving?: boolean;
}): ImmersionFrame {
  const dx = input.playerPos.x - input.viviPos.x;
  const dz = input.playerPos.z - input.viviPos.z;
  const dist = Math.hypot(dx, dz);
  // Soft falloff: strong under 1.2m, gone by ~3.2m
  const prox = Math.max(0, Math.min(1, 1 - (dist - 0.55) / 2.6));

  const gf = input.companion.girlfriendAffection / 100;
  const trust = input.companion.trust / 100;
  const w = warmth01(input.companion.warmth);

  // Breath: calmer when close & high trust; slightly faster if guarded
  let breathHz = 0.28 + (1 - trust) * 0.12;
  if (prox > 0.55 && trust > 0.4) breathHz = 0.22 + prox * 0.06;
  if (input.companion.presence === "resting") breathHz = 0.18;

  // Look: snappier when she's engaged / high warmth
  const lookSnap = 3.2 + w * 3.5 + prox * 2.5;

  // Ambient city ducks when close conversation energy rises
  const ambientVol = Math.max(
    0.04,
    0.24 - prox * 0.14 - (input.consent ? 0.03 : 0) - (input.night ? 0.04 : 0),
  );

  const warmthLight = Math.min(
    1,
    (input.night ? 0.25 : 0.45) + w * 0.25 + prox * 0.2 * gf + (input.consent ? 0.08 : 0),
  );

  const expressionBias = 0.35 + gf * 0.35 + prox * 0.2;
  const vignette = prox * 0.22 * (input.consent ? 1.15 : 0.7);
  const hapticIdle = input.presenting && prox > 0.7 ? 0.08 + prox * 0.12 : 0;

  _state.proximity = prox;
  _state.distance = dist;
  _state.breathHz = breathHz;
  _state.lookSnap = lookSnap;
  _state.ambientVol = ambientVol;
  _state.warmthLight = warmthLight;
  _state.expressionBias = expressionBias;
  _state.hapticIdle = hapticIdle;
  _state.vignette = vignette;

  // Audio mix (cheap continuous)
  setAmbience(true, ambientVol);
  setImmersionMix(prox, w, input.night);
  if (prox > 0.65 && input.dt > 0) {
    playProximityTone(prox, input.dt);
  }

  // Micro-SFX driven by same frame (positions set by engine)
  tickCloth({
    dt: input.dt,
    proximity: prox,
    moving: input.viviMoving,
    turning: input.viviTurning,
  });
  tickClosePulse({ dt: input.dt, proximity: prox, consent: input.consent });
  if (input.viviMoving) {
    tickFootsteps({ dt: input.dt, moving: true, isPlayer: false, surface: "soft" });
  }
  if (input.playerMoving) {
    tickFootsteps({ dt: input.dt, moving: true, isPlayer: true, surface: "wood" });
  }

  return _state;
}

export { playSpatialGiggle };


/** CSS/DOM vignette strength for overlay */
export function immersionVignetteStyle(v: number): string {
  const a = Math.min(0.55, v * 0.85);
  return `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${a.toFixed(3)}) 100%)`;
}
