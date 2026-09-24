/**
 * Multi-tier memory: working (session) · semantic facts · episodic summaries.
 * Raw transcripts expire; we store meanings, not intimate full logs.
 */
import type {
  EpisodicMoment,
  MemoryConfidence,
  SemanticFact,
  StructuredMemory,
} from "@/companion/types";
import { getPersonaConfig } from "@/companion/identity";

const SEM_KEY = "vivi-companion-semantic-v1";
const EPI_KEY = "vivi-companion-episodic-v1";
const RAW_KEY = "vivi-companion-raw-meta-v1";

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadStructuredMemory(): StructuredMemory {
  const cfg = getPersonaConfig().memory;
  let semantic: SemanticFact[] = [];
  let episodic: EpisodicMoment[] = [];
  let rawUntil = Date.now() + cfg.raw_transcript_retention_hours * 3600_000;
  try {
    semantic = JSON.parse(localStorage.getItem(SEM_KEY) || "[]");
    episodic = JSON.parse(localStorage.getItem(EPI_KEY) || "[]");
    const meta = JSON.parse(localStorage.getItem(RAW_KEY) || "{}") as { rawUntil?: number };
    if (meta.rawUntil) rawUntil = meta.rawUntil;
  } catch {
    /* */
  }
  return { semantic, episodic, rawUntil };
}

export function saveStructuredMemory(m: StructuredMemory) {
  const cfg = getPersonaConfig().memory;
  try {
    localStorage.setItem(
      SEM_KEY,
      JSON.stringify(m.semantic.slice(-cfg.max_semantic_facts)),
    );
    localStorage.setItem(
      EPI_KEY,
      JSON.stringify(m.episodic.slice(-cfg.max_episodic)),
    );
    localStorage.setItem(RAW_KEY, JSON.stringify({ rawUntil: m.rawUntil }));
  } catch {
    /* quota */
  }
}

/** Upsert preference / boundary / fact — user editable */
export function upsertFact(
  mem: StructuredMemory,
  key: string,
  value: string,
  source: SemanticFact["source"] = "inferred",
  confidence: MemoryConfidence = "medium",
): StructuredMemory {
  const semantic = [...mem.semantic];
  const i = semantic.findIndex((f) => f.key === key);
  const fact: SemanticFact = {
    id: i >= 0 ? semantic[i].id : uid(),
    key,
    value,
    confidence,
    source,
    updatedAt: Date.now(),
  };
  if (i >= 0) semantic[i] = fact;
  else semantic.push(fact);
  const next = { ...mem, semantic };
  saveStructuredMemory(next);
  return next;
}

export function removeFact(mem: StructuredMemory, id: string): StructuredMemory {
  const next = { ...mem, semantic: mem.semantic.filter((f) => f.id !== id) };
  saveStructuredMemory(next);
  return next;
}

export function addEpisode(
  mem: StructuredMemory,
  summary: string,
  tags: string[],
  valence: EpisodicMoment["valence"],
): StructuredMemory {
  const episodic = [
    ...mem.episodic,
    { id: uid(), summary: summary.slice(0, 220), tags, valence, at: Date.now() },
  ];
  const next = { ...mem, episodic };
  saveStructuredMemory(next);
  return next;
}

/** Compress a player/Vivi exchange into at most one episode + optional facts */
export function distillTurn(input: {
  mem: StructuredMemory;
  playerLine?: string;
  viviLine?: string;
  tags?: string[];
  liked?: boolean;
}): StructuredMemory {
  let mem = input.mem;
  if (input.liked && input.viviLine) {
    mem = addEpisode(
      mem,
      `Shared moment: ${input.viviLine.slice(0, 120)}`,
      input.tags ?? ["chat"],
      "positive",
    );
  }
  // Prefer short preference extraction heuristics (no extra LLM required)
  const line = (input.playerLine || "").toLowerCase();
  if (line.includes("don't like") || line.includes("do not like")) {
    mem = upsertFact(mem, "dislike_signal", input.playerLine!.slice(0, 80), "user", "medium");
  }
  if (line.includes("i like") || line.includes("love when")) {
    mem = upsertFact(mem, "like_signal", input.playerLine!.slice(0, 80), "user", "medium");
  }
  if (line.includes("pause") || line.includes("stop")) {
    mem = upsertFact(mem, "boundary_pause", "user uses pause/stop", "user", "strong");
  }
  return mem;
}

export function purgeExpiredRaw(mem: StructuredMemory): StructuredMemory {
  // Working raw is owned by dialogueMemory; we only track retention window
  if (Date.now() > mem.rawUntil) {
    try {
      localStorage.removeItem("vivi-llm-memory-v1");
    } catch {
      /* */
    }
    const cfg = getPersonaConfig().memory;
    const next = {
      ...mem,
      rawUntil: Date.now() + cfg.raw_transcript_retention_hours * 3600_000,
    };
    saveStructuredMemory(next);
    return next;
  }
  return mem;
}

export function wipeAllMemory(): StructuredMemory {
  const empty: StructuredMemory = {
    semantic: [],
    episodic: [],
    rawUntil: Date.now(),
  };
  saveStructuredMemory(empty);
  try {
    localStorage.removeItem("vivi-llm-memory-v1");
  } catch {
    /* */
  }
  return empty;
}

export function memoryPromptBlock(mem: StructuredMemory): string {
  const facts = mem.semantic
    .slice(-16)
    .map((f) => `${f.key}=${f.value}(${f.confidence})`)
    .join("; ");
  const eps = mem.episodic
    .slice(-6)
    .map((e) => e.summary)
    .join(" | ");
  return `SEMANTIC: ${facts || "none"}\nEPISODIC: ${eps || "none"}`;
}
