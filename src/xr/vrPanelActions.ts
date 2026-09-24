/**
 * Gameplay actions invoked by VR world-space UI — same store methods as the DOM HUD.
 */
import { useGameStore } from "@/stores/gameStore";
import { continueDialogue, chooseDialogue } from "@/systems/dialogueActions";
import { updateComfort, type VRComfortConfig } from "@/xr/VRComfortSettings";
import items from "@/data/items.json";

export function vrClosePanel() {
  const s = useGameStore.getState();
  s.setPanel("none");
  s.setPaused(false);
}

export function vrSelectDialogue(choiceId: string) {
  if (choiceId === "__continue") continueDialogue();
  else chooseDialogue(choiceId);
}

export function vrInventoryUse(itemId: string) {
  const s = useGameStore.getState();
  const it = s.inventory.find((i) => i.id === itemId);
  if (!it) return;
  if (it.kind === "decor") {
    s.setPanel("none");
    s.setPlaceMode(true, it.id);
  }
}

export function vrShopBuy(itemId: string) {
  const s = useGameStore.getState();
  const it = items.shop.find((i) => i.id === itemId);
  if (!it) return;
  if (s.coins < it.price) {
    s.toast("Not enough coins");
    return;
  }
  s.addStats({ coins: -it.price });
  s.addItem(it.id, "gift");
  s.toast(`Bought ${it.name}`);
}

export function vrFridgeTake(id: string) {
  useGameStore.getState().takeIngredient(id);
}

export function vrFridgeClear() {
  useGameStore.getState().setCookingSlots([]);
}

export function vrSetOutfit(id: string) {
  const s = useGameStore.getState();
  s.setOutfit(id);
  s.toast(id);
}

export function vrOpenPhoto() {
  const s = useGameStore.getState();
  s.setPanel("none");
  s.setPhotoMode(true);
}

export function vrToggleComfort(partial: Partial<VRComfortConfig>) {
  updateComfort(partial);
}

export function vrResume() {
  const s = useGameStore.getState();
  s.setPaused(false);
  s.setPanel("none");
}

export function vrResetSave() {
  useGameStore.getState().resetSave();
}
