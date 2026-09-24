import type {
  LlmRequestContext,
  LlmPersonaSnapshot,
  LlmIntimacySnapshot,
  LlmPlayerStance,
  LlmSituation,
} from "@/llm/types";
import type { IntimacyAgreement } from "@/systems/intimacyNegotiation";
import type { PersonaState } from "@/systems/viviPersona";
import { dialogueMemory } from "@/llm/memoryStore";
import { interactionLayer } from "@/systems/interactionSystem";
import type { CompanionState } from "@/companion/types";
import { memoryPromptBlock } from "@/companion/memory/structuredMemory";
import type { StructuredMemory } from "@/companion/types";
import { identitySystemPrompt } from "@/companion/identity";

export type GameSnapshotForLlm = {
  affection: number;
  comfort: number;
  energy: number;
  level: number;
  day: number;
  gameMinutes: number;
  consent: boolean;
  intimacy: IntimacyAgreement;
  persona: PersonaState;
  recentLog?: string;
  focusName?: string;
  zoneId?: string;
  zoneLayer?: number;
  gateReason?: string;
  scene?: LlmSituation["scene"];
  playerInput?: string;
  seedNodeId?: string;
  companion?: CompanionState;
  structuredMemory?: StructuredMemory;
};

function clockLabel(gameMinutes: number): string {
  const h = Math.floor(gameMinutes / 60) % 24;
  if (h < 6) return "late night";
  if (h < 11) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

export function buildPersonaSnap(p: PersonaState): LlmPersonaSnapshot {
  const regionLikes: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.memory)) {
    regionLikes[k] = Math.round(v.liked * 100) / 100;
  }
  return {
    openness: p.disposition.openness,
    needsTalk: p.disposition.needsTalk,
    warmth: p.disposition.warmth,
    playfulness: p.disposition.playfulness,
    moodBias: p.moodBias,
    lastThought: p.lastThought,
    regionLikes,
  };
}

export function buildIntimacySnap(i: IntimacyAgreement, consent: boolean): LlmIntimacySnapshot {
  return {
    consent,
    pace: i.pace,
    openRegions: [...i.openRegions],
    trust: i.trust,
    checkIns: i.checkIns,
  };
}

export function buildPlayerSnap(s: GameSnapshotForLlm): LlmPlayerStance {
  return {
    affection: s.affection,
    comfort: s.comfort,
    energy: s.energy,
    level: s.level,
    layer: interactionLayer(s.level),
    recentActions: s.recentLog ? [s.recentLog] : [],
  };
}

export function buildLlmContext(s: GameSnapshotForLlm): LlmRequestContext {
  const situation: LlmSituation = {
    scene: s.scene ?? (s.zoneId ? "touch" : "apartment"),
    focus: s.focusName,
    zoneId: s.zoneId,
    zoneLayer: s.zoneLayer,
    gateReason: s.gateReason,
    timeOfDay: clockLabel(s.gameMinutes),
    day: s.day,
  };
  return {
    situation,
    persona: buildPersonaSnap(s.persona),
    intimacy: buildIntimacySnap(s.intimacy, s.consent),
    player: buildPlayerSnap(s),
    memory: dialogueMemory.recent(12),
    playerInput: s.playerInput,
    seedNodeId: s.seedNodeId,
    companion: s.companion
      ? {
          presence: s.companion.presence,
          trust: s.companion.trust,
          warmth: s.companion.warmth,
          topicSafety: s.companion.topicSafety,
          vulnerability: s.companion.userVulnerability,
          consentScope: s.companion.consentScope,
          girlfriendAffection: s.companion.girlfriendAffection,
          lastReaction: s.companion.lastReaction,
        }
      : undefined,
    structuredMemoryBlock: s.structuredMemory
      ? memoryPromptBlock(s.structuredMemory)
      : undefined,
  };
}

/** Compact system + user messages for chat API (token-efficient). */
export function contextToMessages(
  ctx: LlmRequestContext,
  voiceStyle: string,
): { role: "system" | "user" | "assistant"; content: string }[] {
  const system = [
    identitySystemPrompt(),
    voiceStyle,
    "You are Vivi, adult roommate companion. Reply ONLY as JSON:",
    '{"text":"...","expression":"happy|relaxed|surprised|neutral|sad","choices":[{"id":"a","label":"...","effect":"none"}],"effects":[]}',
    "effects may include: consent_yes, consent_no, pace_slow, open_soft, open_close, pause, aftercare, none.",
    "Respect gates: if consent false or region closed, do not escalate; invite talk or soft only.",
    "Stay coherent with persona openness and regionLikes. Never invent non-consent.",
    "Max 3 short sentences in text. Max 3 choices.",
  ].join("\n");

  const stateBlock = JSON.stringify(
    {
      situation: ctx.situation,
      persona: ctx.persona,
      intimacy: ctx.intimacy,
      player: ctx.player,
      companion: ctx.companion,
      seed: ctx.seedNodeId,
    },
    null,
    0,
  );

  const mem = ctx.memory
    .map((t) => `${t.role}: ${t.text}`)
    .join("\n");

  const user = [
    `STATE:${stateBlock}`,
    ctx.structuredMemoryBlock ? `LONG_MEMORY:\n${ctx.structuredMemoryBlock}` : "",
    mem ? `WORKING_MEMORY:\n${mem}` : "WORKING_MEMORY: (empty)",
    ctx.playerInput ? `PLAYER: ${ctx.playerInput}` : "PLAYER: (awaits your line)",
    "Respond as Vivi JSON now.",
  ].filter(Boolean).join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
