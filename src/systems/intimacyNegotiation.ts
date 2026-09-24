/**
 * Mutual intimacy negotiation — shared moments by agreement, not force.
 * Player cannot "push through" gates; Vivi's agreed regions + pace limit access.
 */

export type IntimacyPace = "slow" | "medium" | "exploratory";

/** What both have explicitly opened in the current session / ongoing agreement */
export type IntimacyRegion =
  | "hands"
  | "face"
  | "shoulders"
  | "soft_torso" // chest / waist / back with soft intent
  | "close" // hips / intimate layer when mutually opened
  | "aftercare";

export type IntimacyAgreement = {
  /** Explicit yes for closer touch this session */
  consent: boolean;
  pace: IntimacyPace;
  /** Regions opened by dialogue / check-in — empty means only casual (hands/face/shoulders) */
  openRegions: IntimacyRegion[];
  /** Mutual check-in required before escalating layer */
  checkIns: boolean;
  /** Always honored — maps to stopping interaction + dialogue */
  safeword: string;
  /** Trust builds when player respects no / slow / pause */
  trust: number;
  /** Last successful mutual beat (for aftercare prompts) */
  lastSharedAt: number;
  /** How the evening was framed together */
  eveningFrame: "unset" | "soft" | "close" | "open";
};

export const DEFAULT_AGREEMENT = (): IntimacyAgreement => ({
  consent: false,
  pace: "slow",
  openRegions: ["hands", "face", "shoulders"],
  checkIns: true,
  safeword: "pause",
  trust: 0,
  lastSharedAt: 0,
  eveningFrame: "unset",
});

/** Map zone id / tags → region */
export function zoneToRegion(zoneId: string, layer: number, tags?: string[]): IntimacyRegion {
  const id = zoneId.toLowerCase();
  if (tags?.includes("hands") || id.includes("hand")) return "hands";
  if (id === "head" || id.includes("face")) return "face";
  if (id.includes("shoulder") || id.includes("lowerleg")) return "shoulders";
  if (layer >= 2 || tags?.includes("intimate") || id.includes("thigh")) return "close";
  if (layer >= 1 || tags?.includes("soft")) return "soft_torso";
  return "shoulders";
}

export type AgreementGate =
  | { ok: true }
  | { ok: false; reason: "no_consent" | "region_closed" | "pace" | "trust" | "check_in"; hint: string };

/**
 * Can this zone be used *right now* under the mutual agreement?
 * Layer/level still apply separately in interactionSystem.
 */
export function agreementAllowsZone(
  agreement: IntimacyAgreement,
  zoneId: string,
  layer: number,
  tags?: string[],
): AgreementGate {
  const region = zoneToRegion(zoneId, layer, tags);

  // Casual regions always ok if not exhausted
  if (region === "hands" || region === "face" || region === "shoulders") {
    return { ok: true };
  }

  if (!agreement.consent) {
    return {
      ok: false,
      reason: "no_consent",
      hint: "Ask her first — closer touch needs a yes from both of you.",
    };
  }

  if (!agreement.openRegions.includes(region)) {
    return {
      ok: false,
      reason: "region_closed",
      hint:
        region === "close"
          ? "That closeness isn't on the table yet. Negotiate it together."
          : "She hasn't opened that area. Talk it through first.",
    };
  }

  if (region === "close" && agreement.pace === "slow" && agreement.trust < 2) {
    return {
      ok: false,
      reason: "pace",
      hint: "Pace is slow — build trust with softer touch first.",
    };
  }

  if (agreement.checkIns && region === "close" && agreement.trust < 1) {
    return {
      ok: false,
      reason: "check_in",
      hint: "Check in with her before going there.",
    };
  }

  return { ok: true };
}

export function openRegion(
  agreement: IntimacyAgreement,
  region: IntimacyRegion,
): IntimacyAgreement {
  const openRegions = agreement.openRegions.includes(region)
    ? agreement.openRegions
    : [...agreement.openRegions, region];
  return { ...agreement, openRegions, consent: true };
}

export function setPace(agreement: IntimacyAgreement, pace: IntimacyPace): IntimacyAgreement {
  return { ...agreement, pace };
}

export function grantConsent(agreement: IntimacyAgreement): IntimacyAgreement {
  // Default open soft torso when saying yes; close still needs explicit open
  let open = [...agreement.openRegions];
  if (!open.includes("soft_torso")) open.push("soft_torso");
  return { ...agreement, consent: true, openRegions: open };
}

export function revokeConsent(agreement: IntimacyAgreement): IntimacyAgreement {
  return {
    ...agreement,
    consent: false,
    openRegions: ["hands", "face", "shoulders"],
    eveningFrame: "unset",
  };
}

/** Player respected stop / slow → trust up */
export function respectBoundary(agreement: IntimacyAgreement, amount = 1): IntimacyAgreement {
  return {
    ...agreement,
    trust: Math.min(10, agreement.trust + amount),
    lastSharedAt: performance.now(),
  };
}

/** Rushed or ignored gate (attempt) — soft trust hit, never unlocks by force */
export function ignoreBoundaryAttempt(agreement: IntimacyAgreement): IntimacyAgreement {
  return {
    ...agreement,
    trust: Math.max(0, agreement.trust - 1),
  };
}

export function markSharedMoment(agreement: IntimacyAgreement): IntimacyAgreement {
  return {
    ...agreement,
    trust: Math.min(10, agreement.trust + 0.5),
    lastSharedAt: performance.now(),
  };
}

export function paceLabel(pace: IntimacyPace): string {
  if (pace === "slow") return "Slow — check in often";
  if (pace === "medium") return "Medium — still mutual";
  return "Exploratory — still needs yes per step";
}

export function agreementSummary(a: IntimacyAgreement): string {
  const regions = a.openRegions.join(", ") || "casual only";
  return `Consent ${a.consent ? "yes" : "no"} · ${paceLabel(a.pace)} · open: ${regions} · trust ${a.trust.toFixed(0)}`;
}
