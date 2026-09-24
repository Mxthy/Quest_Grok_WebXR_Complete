/**
 * Simulation / emotion state machine — drives output *before* LLM generation.
 */
import type {
  CompanionState,
  ConsentMode,
  Presence,
  Warmth,
  TopicSafety,
  VulnerabilityFlag,
} from "@/companion/types";
import { defaultCompanionState } from "@/companion/types";

export function mapAffectionToGirlfriend(affection: number): number {
  return Math.max(0, Math.min(100, Math.round((affection / 300) * 100)));
}

export function warmthFromStats(comfort: number, gf: number): Warmth {
  if (gf > 55 && comfort > 50) return "high";
  if (gf < 20 || comfort < 30) return "low";
  return "medium";
}

export function presenceFromEnergy(energy: number, hour: number): Presence {
  if (energy < 18) return "resting";
  if (hour >= 23 || hour < 6) return energy < 40 ? "resting" : "idle";
  if (energy < 35) return "idle";
  return "online";
}

/** Sync companion state from apartment sim + intimacy trust */
export function syncCompanionFromGame(input: {
  prev: CompanionState;
  affection: number;
  comfort: number;
  energy: number;
  gameMinutes: number;
  intimacyTrust: number;
  consent: boolean;
  consentModes?: ConsentMode[];
}): CompanionState {
  const hour = Math.floor(input.gameMinutes / 60) % 24;
  const gf = mapAffectionToGirlfriend(input.affection);
  // Trust: slow blend of intimacy trust (0–10) and girlfriend affection
  const targetTrust = Math.round(
    Math.min(100, input.intimacyTrust * 8 + gf * 0.35),
  );
  const trust = Math.round(input.prev.trust * 0.85 + targetTrust * 0.15);

  const scope = new Set<ConsentMode>(input.prev.consentScope);
  if (input.consent) {
    scope.add("chat");
    scope.add("intimacy");
    scope.add("roleplay");
  }
  if (input.consentModes) input.consentModes.forEach((m) => scope.add(m));

  return {
    ...input.prev,
    presence: presenceFromEnergy(input.energy, hour),
    trust,
    warmth: warmthFromStats(input.comfort, gf),
    girlfriendAffection: gf,
    consentScope: [...scope],
    topicSafety: input.prev.userVulnerability === "crisis" ? "block" : input.prev.topicSafety,
    updatedAt: Date.now(),
  };
}

export function setVulnerability(
  state: CompanionState,
  flag: VulnerabilityFlag,
): CompanionState {
  return {
    ...state,
    userVulnerability: flag,
    topicSafety: flag === "crisis" ? "block" : flag === "elevated" ? "caution" : state.topicSafety,
    updatedAt: Date.now(),
  };
}

export function reactionForEvent(
  state: CompanionState,
  event: "touch_ok" | "touch_blocked" | "gift" | "chat" | "pause_respected" | "rushed",
): string {
  if (event === "pause_respected") return "soft_trust";
  if (event === "rushed") return "withdraw";
  if (event === "touch_blocked") return "boundary";
  if (event === "gift") return state.warmth === "high" ? "delighted" : "pleased";
  if (event === "touch_ok") {
    if (state.warmth === "high") return "melt";
    if (state.warmth === "low") return "careful_accept";
    return "warm_accept";
  }
  return "listening";
}

export function applyReaction(
  state: CompanionState,
  event: Parameters<typeof reactionForEvent>[1],
): CompanionState {
  const lastReaction = reactionForEvent(state, event);
  let trust = state.trust;
  if (event === "pause_respected") trust = Math.min(100, trust + 2);
  if (event === "rushed") trust = Math.max(0, trust - 3);
  if (event === "touch_ok") trust = Math.min(100, trust + 0.5);
  return { ...state, lastReaction, trust, updatedAt: Date.now() };
}

export { defaultCompanionState };
