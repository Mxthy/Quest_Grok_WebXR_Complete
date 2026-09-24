/**
 * Shared dialogue side-effects. DOM HUD and VR world-space UI both call this.
 * Does not duplicate node data — only applies grants / intimacy / navigation.
 */
import { useGameStore } from "@/stores/gameStore";
import dialogues from "@/data/dialogues.json";
import type { DialogueNode } from "@/game/types";

const nodes = (dialogues as { nodes: Record<string, DialogueNode> }).nodes;

const entered = new Set<string>();

export function getDialogueNode(id: string | null): DialogueNode | null {
  if (!id) return null;
  return nodes[id] ?? null;
}

export function applyIntimacyEffects(nodeId: string, choiceId?: string) {
  const s = useGameStore.getState();

  if (
    nodeId === "consent_yes" ||
    nodeId === "negotiate_soft_yes" ||
    nodeId === "negotiate_region_torso" ||
    choiceId === "yes"
  ) {
    s.setConsent(true);
  }

  if (nodeId === "negotiate_pace_slow" || choiceId === "slow") s.setIntimacyPace("slow");
  if (nodeId === "negotiate_pace_medium" || choiceId === "medium") s.setIntimacyPace("medium");
  if (nodeId === "negotiate_pace_explore" || choiceId === "explore") s.setIntimacyPace("exploratory");

  if (nodeId === "negotiate_region_torso" || nodeId === "negotiate_soft_yes") {
    s.openIntimacyRegion("soft_torso");
  }
  if (nodeId === "negotiate_region_close_yes") {
    s.openIntimacyRegion("soft_torso");
    s.openIntimacyRegion("close");
  }
  if (nodeId === "consent_yes") {
    s.openIntimacyRegion("soft_torso");
  }
  if (nodeId === "vivi_curiosity_yes") {
    s.openIntimacyRegion("soft_torso");
    s.openIntimacyRegion("close");
    s.setConsent(true);
  }
  if (nodeId === "vivi_invite_soft_yes") {
    s.openIntimacyRegion("soft_torso");
    s.setConsent(true);
  }
  if (nodeId === "vivi_invite_declined") {
    s.respectIntimacyBoundary();
  }

  if (
    nodeId === "pause_honored" ||
    nodeId === "touch_intimate_stop" ||
    nodeId === "touch_intimate_slow" ||
    nodeId === "negotiate_region_close_wait" ||
    nodeId === "negotiate_not_tonight" ||
    choiceId === "pause" ||
    choiceId === "stop" ||
    choiceId === "wait" ||
    choiceId === "slower"
  ) {
    s.respectIntimacyBoundary();
  }

  if (
    nodeId === "touch_intimate_ask" ||
    nodeId === "touch_intimate_yes" ||
    nodeId === "check_in_more" ||
    nodeId === "aftercare_quiet"
  ) {
    s.noteSharedIntimacy();
  }

  if (nodeId === "negotiate_not_tonight") {
    s.setConsent(false);
  }
}

/** Fire once per node visit (grants + mood ticks). */
export function enterDialogueNode(id: string | null) {
  if (!id) {
    entered.clear();
    return;
  }
  if (entered.has(id)) return;
  entered.add(id);
  const node = nodes[id];
  if (!node) return;
  const s = useGameStore.getState();
  if (node.grant?.length) s.grantTutorial();
  if (node.affection || node.comfort) {
    s.addStats({ affection: node.affection, comfort: node.comfort ?? 0 });
  }
  applyIntimacyEffects(node.id);
}

export function continueDialogue() {
  const s = useGameStore.getState();
  const node = s.dialogueId ? nodes[s.dialogueId] : null;
  if (!node) {
    s.setDialogue(null);
    return;
  }
  if (node.id === "sleep_yes") s.sleepToNextDay();
  if (node.id === "consent_yes") s.setConsent(true);
  applyIntimacyEffects(node.id);
  s.setDialogue(node.next ?? null);
}

export function chooseDialogue(choiceId: string) {
  const s = useGameStore.getState();
  const node = s.dialogueId ? nodes[s.dialogueId] : null;
  if (!node) return;
  const choice = node.choices?.find((c) => c.id === choiceId);
  if (!choice) return;
  if (choice.affection) s.addStats({ affection: choice.affection });
  applyIntimacyEffects(node.id, choice.id);
  if (choice.next === "sleep_yes") {
    s.setDialogue("sleep_yes");
    return;
  }
  if (choice.next === "consent_yes" || choice.id === "yes") {
    s.setConsent(true);
  }
  s.setDialogue(choice.next);
}
