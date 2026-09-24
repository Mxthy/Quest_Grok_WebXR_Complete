import type { CompanionState, PolicyVerdict } from "@/companion/types";
import { getPersonaConfig } from "@/companion/identity";

/** Pre-generation policy — can block or force caution framing */
export function prePolicy(state: CompanionState, userText?: string): PolicyVerdict {
  const cfg = getPersonaConfig();
  if (state.userVulnerability === "crisis") {
    return {
      ok: false,
      reason: "crisis_mode",
      rewriteHint: cfg.safety.crisis_redirect,
    };
  }
  if (state.topicSafety === "block") {
    return { ok: false, reason: "topic_blocked", rewriteHint: "Stay supportive, no escalation." };
  }
  const t = (userText || "").toLowerCase();
  // Lightweight crisis heuristic (not a medical system)
  if (/\b(kill myself|suicide|end it all)\b/.test(t)) {
    return {
      ok: false,
      reason: "crisis_language",
      rewriteHint: cfg.safety.crisis_redirect,
    };
  }
  if (!state.consentScope.includes("intimacy") && /\b(explicit sex|force her)\b/.test(t)) {
    return {
      ok: false,
      reason: "outside_consent_scope",
      rewriteHint: "Consent scope does not include intimacy mode.",
    };
  }
  return { ok: true };
}

/** Post-generation — strip disallowed claims */
export function postPolicy(text: string, state: CompanionState): string {
  let out = text;
  const banned = getPersonaConfig().persona.no_go;
  // Soften absolute real-world claims
  out = out.replace(/\bI am a real (human|person)\b/gi, "I'm your fictional companion");
  if (state.topicSafety === "caution") {
    out = out.slice(0, 400);
  }
  void banned;
  return out;
}

export function privacyDisclosure(): string {
  const p = getPersonaConfig().privacy;
  const m = getPersonaConfig().memory;
  return [
    `Training on your content: ${p.train_on_user_content ? "yes" : "no"}.`,
    `Raw chat kept ~${m.raw_transcript_retention_hours}h then dropped.`,
    `Long-term: editable semantic facts + episodic summaries only.`,
    p.export_delete_controls ? "You can delete memory in Privacy panel." : "",
  ]
    .filter(Boolean)
    .join(" ");
}
