/**
 * Vivi persona brain — session-seeded disposition + learned preferences.
 * Pseudo-autonomy: she can decline, slow down, or open curiosity on her own terms.
 * Single source of truth so dialogue, gates, and expression stay coherent.
 */

import type { IntimacyPace, IntimacyRegion } from "@/systems/intimacyNegotiation";

export type Disposition = {
  /** 0 = reserved / conservative · 1 = curious / experimental */
  openness: number;
  /** resists escalation without talk */
  needsTalk: number;
  /** recovers trust slower after a bad beat */
  sensitivity: number;
  /** initiates soft closeness herself more often */
  warmth: number;
  /** humor / tease vs earnest */
  playfulness: number;
};

export type RegionMemory = {
  tried: number;
  liked: number; // 0..1 running average of positive outcomes
  lastOutcome: "good" | "mixed" | "bad" | "none";
  /** she may self-open this later if liked stays high */
  selfInterest: number;
};

export type PersonaState = {
  seed: number;
  disposition: Disposition;
  memory: Record<IntimacyRegion, RegionMemory>;
  /** mood of this day/session */
  moodBias: "guarded" | "neutral" | "open" | "affectionate";
  /** last autonomous decision log (debug / HUD) */
  lastThought: string;
  /** she may initiate negotiate / soft invite */
  autonomyCooldownUntil: number;
};

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

const REGIONS: IntimacyRegion[] = [
  "hands",
  "face",
  "shoulders",
  "soft_torso",
  "close",
  "aftercare",
];

function emptyMemory(): Record<IntimacyRegion, RegionMemory> {
  const m = {} as Record<IntimacyRegion, RegionMemory>;
  for (const r of REGIONS) {
    m[r] = { tried: 0, liked: 0.45, lastOutcome: "none", selfInterest: 0.2 };
  }
  // casual always more open
  m.hands.liked = 0.7;
  m.face.liked = 0.65;
  m.shoulders.liked = 0.6;
  m.soft_torso.liked = 0.35;
  m.close.liked = 0.25;
  m.aftercare.liked = 0.8;
  return m;
}

/** New roll each play session / day start — feels like a new person-instance */
export function rollPersona(seed?: number): PersonaState {
  const s = seed ?? (Math.floor(Math.random() * 1e9) ^ Date.now());
  const rnd = mulberry32(s >>> 0);
  const openness = clamp01(0.15 + rnd() * 0.75);
  const needsTalk = clamp01(0.25 + rnd() * 0.7);
  const sensitivity = clamp01(0.2 + rnd() * 0.7);
  const warmth = clamp01(0.3 + rnd() * 0.6);
  const playfulness = clamp01(rnd());

  let moodBias: PersonaState["moodBias"] = "neutral";
  const m = rnd();
  if (m < 0.22) moodBias = "guarded";
  else if (m < 0.45) moodBias = "neutral";
  else if (m < 0.78) moodBias = "open";
  else moodBias = "affectionate";

  // Guarded sessions pull openness down; affectionate pulls up — still random base
  const disposition: Disposition = {
    openness: clamp01(openness + (moodBias === "affectionate" ? 0.12 : moodBias === "guarded" ? -0.18 : 0)),
    needsTalk: clamp01(needsTalk + (moodBias === "guarded" ? 0.15 : 0)),
    sensitivity,
    warmth: clamp01(warmth + (moodBias === "affectionate" ? 0.1 : 0)),
    playfulness,
  };

  const memory = emptyMemory();
  // Seed soft interest from disposition (not fixed script)
  memory.soft_torso.selfInterest = clamp01(0.15 + disposition.openness * 0.5 + rnd() * 0.2);
  memory.close.selfInterest = clamp01(0.05 + disposition.openness * 0.35 + rnd() * 0.15);

  const labels = [
    disposition.openness < 0.35 ? "feeling reserved tonight" : null,
    disposition.openness > 0.65 ? "curious, if we talk it through" : null,
    disposition.needsTalk > 0.6 ? "wants words before touch" : null,
    moodBias === "guarded" ? "a bit guarded" : null,
    moodBias === "affectionate" ? "soft and present" : null,
  ].filter(Boolean);

  return {
    seed: s >>> 0,
    disposition,
    memory,
    moodBias,
    lastThought: labels.slice(0, 2).join(" · ") || "present",
    autonomyCooldownUntil: 0,
  };
}

export type Willingness =
  | { kind: "yes"; hint?: string }
  | { kind: "soft_no"; hint: string; suggest?: IntimacyRegion | "talk" | "aftercare" }
  | { kind: "hard_no"; hint: string }
  | { kind: "redirect"; hint: string; suggest: IntimacyRegion | "talk" };

/**
 * NPC decides — player request is input, not a command.
 * Coherence: uses disposition + memory + current trust + energy.
 */
export function decideWillingness(
  persona: PersonaState,
  region: IntimacyRegion,
  ctx: {
    trust: number;
    consent: boolean;
    pace: IntimacyPace;
    playerRushed?: boolean;
    energy: number;
    affection: number;
  },
): Willingness {
  const d = persona.disposition;
  const mem = persona.memory[region] ?? persona.memory.shoulders;

  // Always allow casual with soft variance
  if (region === "hands" || region === "face" || region === "shoulders") {
    if (ctx.energy < 12) {
      return { kind: "soft_no", hint: "She's tired — keep it light or rest.", suggest: "aftercare" };
    }
    return { kind: "yes" };
  }

  // Aftercare always welcome if trust exists
  if (region === "aftercare") {
    return { kind: "yes", hint: "She wants the landing, not just the peak." };
  }

  // Hard boundary: no consent and high needsTalk → talk first
  if (!ctx.consent && d.needsTalk > 0.4) {
    return {
      kind: "redirect",
      hint: "She needs a real conversation before that kind of closeness.",
      suggest: "talk",
    };
  }

  // Region not in her self-interest yet and low trust
  const opennessNeed = region === "close" ? 0.55 : 0.4;
  const trustNeed = region === "close" ? 3 : 1.5;
  const interest = mem.selfInterest * 0.5 + mem.liked * 0.35 + d.openness * 0.25;

  if (ctx.playerRushed || (ctx.pace === "exploratory" && d.openness < 0.4 && ctx.trust < 4)) {
    return {
      kind: "soft_no",
      hint: "Too fast for how she feels tonight. Slow and ask.",
      suggest: region === "close" ? "soft_torso" : "talk",
    };
  }

  if (region === "close" && mem.lastOutcome === "bad") {
    return {
      kind: "hard_no",
      hint: "She's not going back there yet — last time didn't sit right.",
      suggest: "talk",
    };
  }

  if (interest < opennessNeed && ctx.trust < trustNeed) {
    if (d.openness > 0.55 && ctx.consent) {
      return {
        kind: "soft_no",
        hint: "Maybe later — she's curious, not ready this second.",
        suggest: "soft_torso",
      };
    }
    return {
      kind: "redirect",
      hint: "That isn't where she is right now. Meet her where she is.",
      suggest: d.warmth > 0.5 ? "soft_torso" : "talk",
    };
  }

  // She can say yes even if player is tentative — autonomy
  if (interest > 0.62 && ctx.consent && ctx.trust >= trustNeed * 0.8) {
    return {
      kind: "yes",
      hint: d.playfulness > 0.55 ? "She's into this — stay present." : "She's with you. Don't rush the ending.",
    };
  }

  if (interest > 0.48 && ctx.consent) {
    return { kind: "yes" };
  }

  return {
    kind: "soft_no",
    hint: "Not that — not yet. Talk or stay softer.",
    suggest: "talk",
  };
}

/** Learn from a shared beat — NPC updates her own preference */
export function learnFromBeat(
  persona: PersonaState,
  region: IntimacyRegion,
  outcome: "good" | "mixed" | "bad",
  opts?: { playerRespectedStop?: boolean },
): PersonaState {
  const memory = { ...persona.memory };
  const prev = { ...memory[region] };
  prev.tried += 1;
  const score = outcome === "good" ? 0.85 : outcome === "mixed" ? 0.5 : 0.2;
  // Running average
  prev.liked = clamp01(prev.liked * 0.7 + score * 0.3);
  prev.lastOutcome = outcome;
  // Self-interest drifts toward liked when good; drops on bad (her decision)
  if (outcome === "good") {
    prev.selfInterest = clamp01(prev.selfInterest + 0.08 + persona.disposition.openness * 0.04);
  } else if (outcome === "bad") {
    prev.selfInterest = clamp01(prev.selfInterest - 0.12 * (0.5 + persona.disposition.sensitivity));
  } else {
    prev.selfInterest = clamp01(prev.selfInterest + 0.02);
  }
  memory[region] = prev;

  let lastThought = persona.lastThought;
  if (outcome === "good") lastThought = `liked ${region} — might want that again`;
  if (outcome === "bad") lastThought = `not eager about ${region} right now`;
  if (opts?.playerRespectedStop) lastThought = "you listened — trust ticks up";

  return { ...persona, memory, lastThought };
}

/**
 * Autonomous impulse — she may open a topic or invite soft closeness.
 * Never forces intimate regions open without prior positive memory.
 */
export function autonomyTick(
  persona: PersonaState,
  ctx: { trust: number; consent: boolean; now: number; affection: number },
): { persona: PersonaState; action: null | "invite_soft" | "ask_talk" | "suggest_aftercare" | "open_curiosity" } {
  if (ctx.now < persona.autonomyCooldownUntil) {
    return { persona, action: null };
  }
  const rnd = mulberry32((persona.seed + Math.floor(ctx.now / 1000)) >>> 0);
  const roll = rnd();
  const d = persona.disposition;

  // Cooldown 45–90s between autonomous prompts
  const next = {
    ...persona,
    autonomyCooldownUntil: ctx.now + 45000 + rnd() * 45000,
  };

  if (d.needsTalk > 0.55 && !ctx.consent && roll < 0.2) {
    return {
      persona: { ...next, lastThought: "wants to talk boundaries" },
      action: "ask_talk",
    };
  }
  if (d.warmth > 0.55 && ctx.trust >= 1 && roll < 0.18) {
    return {
      persona: { ...next, lastThought: "feeling warm — soft invite" },
      action: "invite_soft",
    };
  }
  if (
    persona.memory.soft_torso.liked > 0.6 &&
    persona.memory.close.selfInterest > 0.45 &&
    ctx.consent &&
    ctx.trust >= 3 &&
    roll < 0.12
  ) {
    return {
      persona: { ...next, lastThought: "curious about closer — if you ask well" },
      action: "open_curiosity",
    };
  }
  if (ctx.affection > 40 && roll < 0.1) {
    return {
      persona: { ...next, lastThought: "wants aftercare energy" },
      action: "suggest_aftercare",
    };
  }
  return { persona: next, action: null };
}

/** Regions she would self-allow right now (for agreement sync — coherent) */
export function regionsSheAllows(persona: PersonaState, trust: number, consent: boolean): IntimacyRegion[] {
  const open: IntimacyRegion[] = ["hands", "face", "shoulders"];
  const soft = persona.memory.soft_torso;
  const close = persona.memory.close;
  if (consent && (soft.selfInterest > 0.35 || soft.liked > 0.55) && trust >= 1) {
    open.push("soft_torso");
  }
  if (
    consent &&
    close.selfInterest > 0.5 &&
    close.liked > 0.4 &&
    trust >= 3 &&
    close.lastOutcome !== "bad"
  ) {
    open.push("close");
  }
  open.push("aftercare");
  return open;
}

export function dispositionLabel(p: PersonaState): string {
  const o = p.disposition.openness;
  const tone =
    o < 0.33 ? "conservative tonight" : o < 0.66 ? "measured" : "more experimental";
  return `${tone} · ${p.moodBias} · ${p.lastThought}`;
}

/** Infer outcome quality from strength + respect + energy (for learning) */
export function inferOutcome(opts: {
  strength: number;
  layer: number;
  energy: number;
  rushed?: boolean;
  respected?: boolean;
}): "good" | "mixed" | "bad" {
  if (opts.respected) return "good";
  if (opts.rushed) return "bad";
  if (opts.energy < 20) return "mixed";
  if (opts.strength > 0.55 && opts.layer >= 1) return "good";
  if (opts.strength < 0.3) return "mixed";
  return "good";
}
