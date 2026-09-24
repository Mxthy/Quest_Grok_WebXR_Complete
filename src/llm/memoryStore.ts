import type { LlmDialogueTurn } from "@/llm/types";

const MAX_TURNS = 24;
const KEY = "vivi-llm-memory-v1";

export class DialogueMemory {
  private turns: LlmDialogueTurn[] = [];

  constructor(load = true) {
    if (load && typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) this.turns = JSON.parse(raw) as LlmDialogueTurn[];
      } catch {
        this.turns = [];
      }
    }
  }

  push(turn: Omit<LlmDialogueTurn, "at"> & { at?: number }) {
    this.turns.push({ ...turn, at: turn.at ?? Date.now() });
    if (this.turns.length > MAX_TURNS) {
      this.turns = this.turns.slice(-MAX_TURNS);
    }
    this.persist();
  }

  recent(n = 12): LlmDialogueTurn[] {
    return this.turns.slice(-n);
  }

  clear() {
    this.turns = [];
    this.persist();
  }

  /** Compact summary for system prompt (token-cheap) */
  summaryLine(): string {
    const last = this.turns.slice(-6);
    if (!last.length) return "No prior talk this session.";
    return last
      .map((t) => `${t.role}: ${t.text.slice(0, 80)}`)
      .join(" | ");
  }

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.turns.slice(-MAX_TURNS)));
    } catch {
      /* quota */
    }
  }
}

export const dialogueMemory = new DialogueMemory();
