/**
 * Bone-zone interaction engine.
 * Layers: 0 = open · 1 = needs consent · 2 = consent + level unlock
 * Gameplay consumes ActionState; this module stays XR-agnostic.
 */
import * as THREE from "three";
import type { InteractableDef, ZoneDef } from "@/game/types";
import {
  agreementAllowsZone,
  zoneToRegion,
  type IntimacyAgreement,
} from "@/systems/intimacyNegotiation";
import {
  decideWillingness,
  type PersonaState,
} from "@/systems/viviPersona";

const _hit = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

/* -------------------------------------------------------------------------- */
/*  Math helpers                                                              */
/* -------------------------------------------------------------------------- */

export function rayPointDistance(ray: THREE.Ray, point: THREE.Vector3) {
  ray.closestPointToPoint(point, _hit);
  return _hit.distanceTo(point);
}

export function zoneStrength(ray: THREE.Ray, worldPos: THREE.Vector3, radius: number) {
  const d = rayPointDistance(ray, worldPos);
  return 1 - d / radius;
}

/** Soft falloff: near center → 1, edge → ~0.2 */
export function strengthCurve(raw: number): number {
  const t = Math.max(0, Math.min(1, raw));
  return 0.2 + 0.8 * t * t;
}

/* -------------------------------------------------------------------------- */
/*  Layer / consent / level rules                                             */
/* -------------------------------------------------------------------------- */

/** Player level → highest unlocked interaction layer (0–2). */
export function interactionLayer(level: number): number {
  if (level >= 2) return 2;
  if (level >= 1) return 1;
  return 0;
}

export type GateReason =
  | "ok"
  | "cooldown"
  | "layer"
  | "consent"
  | "level"
  | "energy"
  | "input"
  | "distance"
  | "region"
  | "pace"
  | "check_in";

export type ZonePickContext = {
  level: number;
  /** unlocked layer = interactionLayer(level) */
  layer: number;
  consent: boolean;
  lastTrigger: Map<string, number>;
  now?: number;
  /** player energy 0–100 */
  energy?: number;
  /** how the ray/proximity was produced */
  inputMode?: "controllerRay" | "mouseRay" | "proximity" | "touch";
  /** optional max distance for proximity checks (meters) */
  proximityMax?: number;
  playerPos?: THREE.Vector3;
  /** Mutual agreement — regions & pace (not force) */
  agreement?: IntimacyAgreement;
  persona?: PersonaState;
  trust?: number;
  rushed?: boolean;
};

export type ZoneHit = {
  def: ZoneDef;
  strength: number;
  dist: number;
  reason: GateReason;
  /** human-readable gate hint */
  hint?: string;
};

export function evaluateZoneAccess(
  def: ZoneDef,
  ctx: ZonePickContext,
  now: number,
): { reason: GateReason; hint?: string } {
  const layer = def.layer ?? 0;
  const cdMs = (def.cooldown ?? 1.2) * 1000;
  const last = ctx.lastTrigger.get(def.id) ?? 0;

  if (now - last < cdMs) {
    const left = ((cdMs - (now - last)) / 1000).toFixed(1);
    return { reason: "cooldown", hint: `Cooldown ${left}s` };
  }

  if (layer > (ctx.layer ?? 0)) {
    return {
      reason: "layer",
      hint: `Needs intimacy layer ${layer} (level ${layer}+)`,
    };
  }

  const needsConsent = def.requiresConsent ?? layer >= 1;
  if (needsConsent && !ctx.consent) {
    return {
      reason: "consent",
      hint: "Ask her first — closer touch needs a yes from both of you.",
    };
  }

  // Mutual agreement: open regions & pace (cannot force closed regions)
  if (ctx.agreement) {
    const gate = agreementAllowsZone(
      ctx.agreement,
      def.id,
      layer,
      def.tags,
    );
    if (!gate.ok) {
      const reasonMap = {
        no_consent: "consent" as const,
        region_closed: "region" as const,
        pace: "pace" as const,
        trust: "pace" as const,
        check_in: "check_in" as const,
      };
      return { reason: reasonMap[gate.reason], hint: gate.hint };
    }
  }

  // NPC intuition — she can decline even if gates otherwise pass
  if (ctx.persona && ctx.agreement) {
    const region = zoneToRegion(def.id, layer, def.tags);
    const will = decideWillingness(ctx.persona, region, {
      trust: ctx.trust ?? ctx.agreement.trust,
      consent: ctx.consent,
      pace: ctx.agreement.pace,
      playerRushed: ctx.rushed,
      energy: ctx.energy ?? 50,
      affection: ctx.level * 30,
    });
    if (will.kind === "hard_no") {
      return { reason: "region", hint: will.hint };
    }
    if (will.kind === "soft_no" || will.kind === "redirect") {
      return { reason: "pace", hint: will.hint };
    }
  }

  if (def.requiresLevel != null && ctx.level < def.requiresLevel) {
    return {
      reason: "level",
      hint: `Needs level ${def.requiresLevel}`,
    };
  }

  const cost = def.energyCost ?? energyCostForLayer(layer);
  if (ctx.energy != null && ctx.energy < cost) {
    return { reason: "energy", hint: `Need ${cost} energy` };
  }

  if (ctx.inputMode && def.allowedInput?.length) {
    const mode = ctx.inputMode;
    const ok =
      def.allowedInput.includes(mode) ||
      (mode === "touch" && def.allowedInput.includes("proximity"));
    if (!ok) {
      return {
        reason: "input",
        hint: `Use ${def.allowedInput.join(" / ")}`,
      };
    }
  }

  return { reason: "ok" };
}

export function energyCostForLayer(layer: number): number {
  if (layer >= 2) return 8;
  if (layer >= 1) return 4;
  return 2;
}

/* -------------------------------------------------------------------------- */
/*  Picking                                                                   */
/* -------------------------------------------------------------------------- */

export function pickBestZone(
  ray: THREE.Ray,
  zones: { def: ZoneDef; world: THREE.Vector3 }[],
  ctx?: ZonePickContext,
): ZoneHit | null {
  const now = ctx?.now ?? performance.now();
  let best: ZoneHit | null = null;
  let bestBlocked: ZoneHit | null = null;

  for (const z of zones) {
    const radius = z.def.radius;
    let d: number;
    let strength: number;

    if (ctx?.inputMode === "proximity" && ctx.playerPos) {
      d = ctx.playerPos.distanceTo(z.world);
      const max = ctx.proximityMax ?? radius * 2.2;
      if (d >= max) continue;
      strength = 1 - d / max;
    } else {
      d = rayPointDistance(ray, z.world);
      if (d >= radius) continue;
      strength = 1 - d / radius;
    }

    if (strength <= 0.12) continue;

    let reason: GateReason = "ok";
    let hint: string | undefined;
    if (ctx) {
      const gate = evaluateZoneAccess(z.def, ctx, now);
      reason = gate.reason;
      hint = gate.hint;
    }

    const hit: ZoneHit = {
      def: z.def,
      strength: strengthCurve(strength),
      dist: d,
      reason,
      hint,
    };

    if (reason === "ok") {
      if (!best || hit.strength > best.strength) best = hit;
    } else if (!bestBlocked || hit.strength > bestBlocked.strength) {
      bestBlocked = hit;
    }
  }

  // Prefer an allowed hit; else surface the strongest blocked one for UI feedback
  return best ?? bestBlocked;
}

/**
 * Prefer layer-appropriate zones: if several ok hits, bias toward the highest
 * unlocked layer that still has strength (encourages progression).
 */
export function pickBestZoneRanked(
  ray: THREE.Ray,
  zones: { def: ZoneDef; world: THREE.Vector3 }[],
  ctx: ZonePickContext,
): ZoneHit | null {
  const now = ctx.now ?? performance.now();
  const candidates: ZoneHit[] = [];

  for (const z of zones) {
    const d = rayPointDistance(ray, z.world);
    if (d >= z.def.radius) continue;
    const raw = 1 - d / z.def.radius;
    if (raw <= 0.12) continue;
    const gate = evaluateZoneAccess(z.def, ctx, now);
    candidates.push({
      def: z.def,
      strength: strengthCurve(raw),
      dist: d,
      reason: gate.reason,
      hint: gate.hint,
    });
  }

  const ok = candidates.filter((c) => c.reason === "ok");
  if (ok.length) {
    ok.sort((a, b) => {
      const la = a.def.layer ?? 0;
      const lb = b.def.layer ?? 0;
      if (lb !== la) return lb - la; // higher layer first among unlocked
      return b.strength - a.strength;
    });
    return ok[0];
  }

  candidates.sort((a, b) => b.strength - a.strength);
  return candidates[0] ?? null;
}

export function pickInteractable(
  ray: THREE.Ray,
  player: THREE.Vector3,
  list: { def: InteractableDef; world: THREE.Vector3 }[],
): InteractableDef | null {
  let best: { def: InteractableDef; d: number } | null = null;
  for (const it of list) {
    const distPlayer = player.distanceTo(it.world);
    if (distPlayer > it.def.radius + 0.35) continue;
    const d = rayPointDistance(ray, it.world);
    if (d < 0.55 && (!best || d < best.d)) best = { def: it.def, d };
  }
  return best?.def ?? null;
}

export function screenRay(
  camera: THREE.Camera,
  ndcX: number,
  ndcY: number,
  target: THREE.Ray,
) {
  _origin.setFromMatrixPosition(camera.matrixWorld);
  _dir.set(ndcX, ndcY, 0.5).unproject(camera).sub(_origin).normalize();
  target.origin.copy(_origin);
  target.direction.copy(_dir);
  return target;
}

export function centerRay(camera: THREE.Camera, target: THREE.Ray) {
  return screenRay(camera, 0, 0, target);
}

/* -------------------------------------------------------------------------- */
/*  Rewards / effects                                                         */
/* -------------------------------------------------------------------------- */

export type ZoneReward = {
  affection: number;
  comfort: number;
  coins: number;
  energy: number; // negative = cost
  expressionWeight: number;
  dialogueId?: string;
  layerBonus: boolean;
};

const LAYER_AFF_MULT = [1, 1.15, 1.35] as const;
const LAYER_COIN_BASE = [1, 2, 4] as const;

export function applyZoneHit(def: ZoneDef, strength: number): ZoneReward {
  const s = Math.max(0.2, Math.min(1, strength));
  const layer = Math.min(2, Math.max(0, def.layer ?? 0));
  const mult = LAYER_AFF_MULT[layer];
  const baseCoins = def.coins ?? LAYER_COIN_BASE[layer];
  const cost = def.energyCost ?? energyCostForLayer(layer);

  return {
    affection: Math.max(1, Math.round(def.affection * s * mult)),
    comfort: Math.round(def.comfort * s * 10) / 10,
    coins: Math.max(0, Math.round(baseCoins * s)),
    energy: -cost,
    expressionWeight: Math.min(1, 0.45 + s * 0.55),
    dialogueId: def.dialogueId ?? defaultDialogueForZone(def),
    layerBonus: layer >= 1 && s > 0.7,
  };
}

export function defaultDialogueForZone(def: ZoneDef): string | undefined {
  if (def.dialogueId) return def.dialogueId;
  if (def.id === "chest" || def.id === "upperChest") return "touch_chest";
  if (def.id === "head") return "touch_head";
  if (def.id.includes("Hand") || def.id.includes("hand")) return "touch_hand";
  if ((def.layer ?? 0) >= 2) return "touch_intimate";
  if ((def.layer ?? 0) >= 1) return "touch_soft";
  return "touch_casual";
}

/* -------------------------------------------------------------------------- */
/*  Combo / streak (session-local)                                            */
/* -------------------------------------------------------------------------- */

export type ComboState = {
  lastZoneId: string | null;
  lastAt: number;
  streak: number;
  uniqueZones: Set<string>;
};

export function createComboState(): ComboState {
  return { lastZoneId: null, lastAt: 0, streak: 0, uniqueZones: new Set() };
}

export function registerComboHit(
  combo: ComboState,
  zoneId: string,
  now = performance.now(),
): { streak: number; uniqueCount: number; bonusAffection: number } {
  const windowMs = 4500;
  if (now - combo.lastAt > windowMs) {
    combo.streak = 0;
    combo.uniqueZones.clear();
  }
  if (zoneId !== combo.lastZoneId) {
    combo.streak += 1;
  }
  combo.uniqueZones.add(zoneId);
  combo.lastZoneId = zoneId;
  combo.lastAt = now;

  const bonusAffection =
    combo.streak >= 3 ? Math.min(5, combo.streak - 1) : 0;

  return {
    streak: combo.streak,
    uniqueCount: combo.uniqueZones.size,
    bonusAffection,
  };
}

/* -------------------------------------------------------------------------- */
/*  Consent / unlock messaging                                                */
/* -------------------------------------------------------------------------- */

export function layerUnlockMessage(level: number): string | null {
  if (level === 1) return "Layer 1 unlocked — soft touch zones with consent";
  if (level === 2) return "Layer 2 unlocked — intimate zones available";
  return null;
}

export function consentPromptText(zoneId?: string): string {
  if (zoneId) {
    return `May I? (${zoneId}) — grant consent to continue.`;
  }
  return "Vivi is waiting for your consent before closer touch.";
}

/** Zones available at current layer + consent (for debug / HUD). */
export function listAccessibleZones(
  defs: ZoneDef[],
  ctx: Pick<ZonePickContext, "level" | "layer" | "consent">,
): ZoneDef[] {
  const now = performance.now();
  const fake: ZonePickContext = {
    ...ctx,
    lastTrigger: new Map(),
    now,
  };
  return defs.filter((d) => evaluateZoneAccess(d, fake, now).reason === "ok");
}

export function zoneSummaryLine(hit: ZoneHit): string {
  const L = hit.def.layer ?? 0;
  const base = `${hit.def.id} L${L} · str ${hit.strength.toFixed(2)}`;
  if (hit.reason === "ok") return base;
  return `${base} · ${hit.hint ?? hit.reason}`;
}
