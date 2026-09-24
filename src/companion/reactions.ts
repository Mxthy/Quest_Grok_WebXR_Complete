/**
 * Girlfriend-affection + interactive reaction layer.
 * Maps events → expression / haptic / companion state updates coherently.
 */
import type { CompanionState } from "@/companion/types";
import { applyReaction } from "@/companion/stateMachine";

export type ReactionResult = {
  state: CompanionState;
  expression: string;
  weight: number;
  toast?: string;
  hapticMs?: number;
};

export function reactToInteraction(
  state: CompanionState,
  kind:
    | "touch_ok"
    | "touch_blocked"
    | "gift"
    | "chat"
    | "pause_respected"
    | "rushed"
    | "morning"
    | "night",
): ReactionResult {
  const next = applyReaction(state, kind as Parameters<typeof applyReaction>[1]);
  switch (kind) {
    case "touch_ok":
      return {
        state: next,
        expression: next.warmth === "high" ? "happy" : "relaxed",
        weight: 0.7 + next.girlfriendAffection / 200,
        toast: next.lastReaction,
        hapticMs: 40 + Math.round(next.girlfriendAffection * 0.3),
      };
    case "touch_blocked":
      return {
        state: next,
        expression: "neutral",
        weight: 0.5,
        toast: "Boundary held",
        hapticMs: 20,
      };
    case "pause_respected":
      return {
        state: next,
        expression: "happy",
        weight: 0.8,
        toast: "She noticed you listened",
        hapticMs: 35,
      };
    case "rushed":
      return {
        state: next,
        expression: "sad",
        weight: 0.6,
        toast: "Too fast for her",
        hapticMs: 15,
      };
    case "gift":
      return {
        state: next,
        expression: "surprised",
        weight: 0.75,
        toast: next.lastReaction,
        hapticMs: 50,
      };
    default:
      return { state: next, expression: "neutral", weight: 0.5 };
  }
}

/** Girlfriend affection label for UI */
export function affectionStage(gf: number): string {
  if (gf < 15) return "New";
  if (gf < 35) return "Warming up";
  if (gf < 55) return "Close";
  if (gf < 75) return "Girlfriend energy";
  return "Deep bond";
}
