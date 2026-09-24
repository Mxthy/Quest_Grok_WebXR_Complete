/**
 * Controllable LLM dialogue layer.
 * - Builds context from gates, persona, intimacy, memory
 * - REST chat completions (OpenAI-compatible)
 * - Falls back to scripted dialogue nodes when offline / error
 * - Optional TTS for low-friction audio replies
 */
import {
  DEFAULT_LLM_CONFIG,
  type LlmClientConfig,
  type LlmReply,
  type LlmChoice,
} from "@/llm/types";
import { chatCompletion, isLlmConfigured } from "@/llm/restClient";
import type { GameSnapshotForLlm } from "@/llm/contextBuilder";
import { dialogueMemory } from "@/llm/memoryStore";
import { speakText, stopSpeaking, speakViaRest } from "@/llm/tts";
import dialogues from "@/data/dialogues.json";
import type { DialogueNode } from "@/game/types";
import { prePolicy, postPolicy } from "@/companion/privacy/policy";
import { distillTurn } from "@/companion/memory/structuredMemory";
import { useGameStore } from "@/stores/gameStore";

const nodes = (dialogues as { nodes: Record<string, DialogueNode> }).nodes;

export type DialogueLLMStatus = "idle" | "streaming" | "ready" | "fallback" | "error";

export class DialogueLLM {
  config: LlmClientConfig;
  status: DialogueLLMStatus = "idle";
  lastError: string | null = null;
  private abort: AbortController | null = null;
  /** live partial text while streaming */
  partialText = "";

  constructor(config?: Partial<LlmClientConfig>) {
    this.config = { ...DEFAULT_LLM_CONFIG(), ...config };
  }

  updateConfig(partial: Partial<LlmClientConfig>) {
    this.config = { ...this.config, ...partial };
  }

  cancel() {
    this.abort?.abort();
    this.abort = null;
    stopSpeaking();
    this.status = "idle";
  }

  /**
   * Primary entry: generate Vivi line from live game snapshot.
   */
  async generate(
    snap: GameSnapshotForLlm,
    onPartial?: (text: string) => void,
  ): Promise<LlmReply> {
    this.cancel();
    this.abort = new AbortController();
    this.partialText = "";
    this.lastError = null;

    if (!isLlmConfigured(this.config)) {
      this.status = "fallback";
      return this.fallback(snap);
    }

    this.status = "streaming";
    try {
      const companion = snap.companion ?? useGameStore.getState().companion;
      const pre = prePolicy(companion, snap.playerInput);
      if (!pre.ok) {
        this.status = "ready";
        const text = pre.rewriteHint || "Let's slow down and stay safe.";
        return {
          speaker: "Vivi",
          text,
          expression: "relaxed",
          choices: [{ id: "ok", label: "Okay", effect: "none" }],
          speak: true,
        };
      }
      const reply = await chatCompletion(this.config, snap, {
        signal: this.abort.signal,
        onToken: (partial) => {
          this.partialText = partial;
          onPartial?.(partial);
        },
      });
      this.status = "ready";
      reply.text = postPolicy(reply.text, companion);
      dialogueMemory.push({ role: "vivi", text: reply.text, about: snap.zoneId });
      if (snap.playerInput) {
        dialogueMemory.push({ role: "player", text: snap.playerInput });
      }
      // Distill to structured memory (not raw forever)
      try {
        const st = useGameStore.getState();
        const mem = distillTurn({
          mem: st.structuredMemory,
          playerLine: snap.playerInput,
          viviLine: reply.text,
          tags: [snap.scene || "chat"],
          liked: true,
        });
        useGameStore.setState({ structuredMemory: mem });
        st.syncCompanion();
      } catch { /* */ }
      void this.maybeSpeak(reply.text, reply.speak !== false);
      return reply;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.status = "fallback";
      return this.fallback(snap);
    }
  }

  /** Player chose a label — store memory + optional follow-up generate */
  notePlayerChoice(label: string, about?: string) {
    dialogueMemory.push({ role: "player", text: label, about });
  }

  clearMemory() {
    dialogueMemory.clear();
  }

  private async maybeSpeak(text: string, enabled: boolean) {
    if (!enabled || !this.config.tts) return;
    const ttsUrl = (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_TTS_API_URL;
    const ttsKey = (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_TTS_API_KEY;
    if (ttsUrl) {
      const ok = await speakViaRest(text, ttsUrl, ttsKey);
      if (ok) return;
    }
    speakText(text, { lang: this.config.ttsLang, rate: 1.06 });
  }

  /** Scripted fallback keeps game playable offline */
  fallback(snap: GameSnapshotForLlm): LlmReply {
    const id = snap.seedNodeId || snap.gateReason || "touch_casual";
    const map: Record<string, string> = {
      consent: "consent_ask",
      region: "negotiate_hub",
      pace: "negotiate_pace",
      check_in: "check_in_prompt",
    };
    const nodeId = map[id] || (nodes[id] ? id : "touch_soft");
    const node = nodes[nodeId] || nodes.touch_soft || nodes.consent_ask;
    if (!node) {
      return {
        speaker: "Vivi",
        text: "Hey — still here. Talk to me.",
        expression: "happy",
        choices: [{ id: "ok", label: "Okay", effect: "none" }],
        speak: true,
      };
    }
    const choices: LlmChoice[] =
      node.choices?.map((c) => ({
        id: c.id,
        label: c.label,
        effect: "none" as const,
      })) ?? [{ id: "ok", label: "Continue", effect: "none" }];
    const reply: LlmReply = {
      speaker: "Vivi",
      text: node.text,
      expression: node.expression,
      choices,
      speak: true,
    };
    dialogueMemory.push({ role: "vivi", text: reply.text, about: snap.zoneId });
    void this.maybeSpeak(reply.text, true);
    return reply;
  }
}

/** Singleton interface for the app */
export const dialogueLLM = new DialogueLLM();
