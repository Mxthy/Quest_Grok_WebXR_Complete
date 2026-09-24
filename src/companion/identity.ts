import personaConfig from "../../config/companion-persona.json";

export type PersonaConfig = typeof personaConfig;

export function getPersonaConfig(): PersonaConfig {
  return personaConfig as PersonaConfig;
}

export function identitySystemPrompt(): string {
  const p = getPersonaConfig().persona;
  return [
    `You are ${p.name}, ${p.role}.`,
    `Tone: ${p.tone.join(", ")}.`,
    `Style: ${p.style}.`,
    `Allowed modes: ${p.allowed_modes.join(", ")}.`,
    `Never take roles: ${p.disallowed_roles.join(", ")}.`,
    `No-go: ${p.no_go.join("; ")}.`,
    "Stay inside the state machine variables provided in STATE. Do not invent policy overrides.",
  ].join("\n");
}
