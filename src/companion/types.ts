/** Companion-app state model — explicit variables, not free-form drift. */

export type Presence = "online" | "idle" | "resting" | "away";
export type Warmth = "low" | "medium" | "high";
export type TopicSafety = "allowed" | "caution" | "block";
export type MemoryConfidence = "weak" | "medium" | "strong";
export type VulnerabilityFlag = "normal" | "elevated" | "crisis";
export type ConsentMode = "chat" | "voice" | "roleplay" | "apartment_sim" | "intimacy";

export type CompanionState = {
  presence: Presence;
  /** 0–100, slow-moving */
  trust: number;
  warmth: Warmth;
  topicSafety: TopicSafety;
  memoryConfidence: MemoryConfidence;
  userVulnerability: VulnerabilityFlag;
  consentScope: ConsentMode[];
  /** girlfriend-sim affection bridge 0–100 (maps from game affection) */
  girlfriendAffection: number;
  /** last reaction label for UI */
  lastReaction: string;
  updatedAt: number;
};

export type SemanticFact = {
  id: string;
  key: string;
  value: string;
  confidence: MemoryConfidence;
  source: "user" | "inferred" | "system";
  updatedAt: number;
};

export type EpisodicMoment = {
  id: string;
  summary: string;
  tags: string[];
  valence: "positive" | "neutral" | "mixed" | "negative";
  at: number;
};

export type StructuredMemory = {
  semantic: SemanticFact[];
  episodic: EpisodicMoment[];
  /** raw turns kept only briefly */
  rawUntil: number;
};

export type PrivacySettings = {
  trainOnUserContent: false;
  rawRetentionHours: number;
  userEditableMemory: boolean;
  showMemoryUi: boolean;
};

export type PolicyVerdict =
  | { ok: true }
  | { ok: false; reason: string; rewriteHint?: string };

export const defaultCompanionState = (): CompanionState => ({
  presence: "online",
  trust: 12,
  warmth: "medium",
  topicSafety: "allowed",
  memoryConfidence: "medium",
  userVulnerability: "normal",
  consentScope: ["chat", "apartment_sim"],
  girlfriendAffection: 0,
  lastReaction: "present",
  updatedAt: Date.now(),
});
