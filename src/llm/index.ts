/**
 * Public LLM dialogue layer API.
 *
 * Usage:
 *   import { dialogueLLM, buildGameSnapFromStore } from "@/llm";
 *   const reply = await dialogueLLM.generate(snap, setPartial);
 */
export { dialogueLLM, DialogueLLM } from "@/llm/DialogueLLM";
export type { DialogueLLMStatus } from "@/llm/DialogueLLM";
export { buildLlmContext, contextToMessages } from "@/llm/contextBuilder";
export type { GameSnapshotForLlm } from "@/llm/contextBuilder";
export { dialogueMemory } from "@/llm/memoryStore";
export { DEFAULT_LLM_CONFIG } from "@/llm/types";
export type { LlmReply, LlmChoice, LlmClientConfig, LlmRequestContext } from "@/llm/types";
export { speakText, stopSpeaking } from "@/llm/tts";

import type { GameSnapshotForLlm } from "@/llm/contextBuilder";
import { useGameStore } from "@/stores/gameStore";
import type { LlmSituation } from "@/llm/types";

/** Snapshot helper — call from UI / engine without circular imports issues */
export function buildGameSnapFromStore(extra?: {
  scene?: LlmSituation["scene"];
  focusName?: string;
  zoneId?: string;
  zoneLayer?: number;
  gateReason?: string;
  playerInput?: string;
  seedNodeId?: string;
}): GameSnapshotForLlm {
  const s = useGameStore.getState();
  return {
    affection: s.affection,
    comfort: s.comfort,
    energy: s.energy,
    level: s.level,
    day: s.day,
    gameMinutes: s.gameMinutes,
    consent: s.consent,
    intimacy: s.intimacy,
    persona: s.persona,
    recentLog: s.lastLog,
    focusName: extra?.focusName ?? s.hoverName,
    zoneId: extra?.zoneId,
    zoneLayer: extra?.zoneLayer,
    gateReason: extra?.gateReason,
    scene: extra?.scene,
    playerInput: extra?.playerInput,
    seedNodeId: extra?.seedNodeId,
    companion: s.companion,
    structuredMemory: s.structuredMemory,
  };
}
