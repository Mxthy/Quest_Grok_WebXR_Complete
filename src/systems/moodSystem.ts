import type { GameSave } from "@/stores/gameStore";
import { levelFromAffection } from "@/game/types";
import items from "@/data/items.json";

const LEVEL_OUTFITS = ["cream", "sage", "blush", "navy", "sun"] as const;
const LEVEL_DECOR = [
  "floor_lamp",
  "wool_rug",
  "wall_poster",
  "fairy_lights",
  "paper_mobile",
  "hanging_frame",
] as const;

/** Baseline face from stats — adult sim still reads energy & comfort. */
export function expressionFromMood(affection: number, comfort: number, energy: number): string {
  if (energy < 18) return "sad";
  if (affection > 90 && comfort > 60) return "happy";
  if (affection > 70) return "happy";
  if (comfort > 75) return "relaxed";
  if (energy < 32) return "sad";
  if (affection > 35) return "happy";
  return "neutral";
}

/**
 * Short-lived expression after a zone hit.
 * Layers map to different emotional temperature without bypassing consent.
 */
export function expressionAfterTouch(
  zoneId: string,
  layer: number,
  strength: number,
  consent: boolean,
): { expression: string; weight: number; line?: string } {
  const s = Math.max(0.2, Math.min(1, strength));
  const weight = Math.min(1, 0.4 + s * 0.55);

  if (layer >= 2 && consent) {
    return {
      expression: s > 0.65 ? "surprised" : "happy",
      weight,
      line: s > 0.7 ? "Don't look away." : "Easy…",
    };
  }
  if (layer >= 1 && consent) {
    if (zoneId.includes("chest") || zoneId.includes("Chest")) {
      return { expression: "surprised", weight, line: "Mm—" };
    }
    if (zoneId.includes("neck")) {
      return { expression: "relaxed", weight, line: "That spot…" };
    }
    return { expression: "happy", weight, line: "Stay." };
  }
  // Layer 0 — playful / casual
  if (zoneId.includes("Hand") || zoneId.includes("hand")) {
    return { expression: "happy", weight: weight * 0.9, line: "Hi." };
  }
  if (zoneId === "head") {
    return { expression: "relaxed", weight, line: "Unfair." };
  }
  return { expression: "happy", weight: weight * 0.85 };
}

export function applyLevelUnlocks(save: GameSave, newLevel: number) {
  const unlockedOutfits = new Set(save.unlockedOutfits);
  const unlockedDecor = new Set(save.unlockedDecor);
  const unlockedDialogues = new Set(save.unlockedDialogues);
  for (let lv = 1; lv <= newLevel; lv++) {
    const outfit = LEVEL_OUTFITS[lv];
    if (outfit) unlockedOutfits.add(outfit);
    const decor = LEVEL_DECOR[lv];
    if (decor) unlockedDecor.add(decor);
    unlockedDialogues.add(`level${lv}_a`);
    unlockedDialogues.add(`level${lv}_b`);
    if (lv >= 2) unlockedDialogues.add("bed_invite");
    if (lv >= 1) unlockedDialogues.add("evening_wine");
  }
  return {
    unlockedOutfits: [...unlockedOutfits],
    unlockedDecor: [...unlockedDecor],
    unlockedDialogues: [...unlockedDialogues],
    level: newLevel,
  };
}

export function nextLevelNeed(affection: number) {
  const lv = levelFromAffection(affection);
  const thresholds = [20, 50, 100, 180, 300];
  const next = thresholds[lv] ?? 300;
  const prev = lv === 0 ? 0 : (thresholds[lv - 1] ?? 0);
  return { level: lv, prev, next, t: (affection - prev) / Math.max(1, next - prev) };
}

/** Relationship beat labels for HUD / logs (adult framing, not clinical). */
export function intimacyLabel(level: number, consent: boolean): string {
  if (level <= 0) return consent ? "Warming up" : "Getting to know you";
  if (level === 1) return consent ? "Soft intimacy" : "Trust building";
  if (level === 2) return consent ? "Close" : "Almost there";
  return consent ? "Deep" : "Intense — still careful";
}

export const outfitById = Object.fromEntries(items.outfits.map((o) => [o.id, o]));
