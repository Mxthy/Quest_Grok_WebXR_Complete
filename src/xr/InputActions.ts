/**
 * Unified action layer — Desktop / Touch / Quest map onto the same actions.
 */

export type InputAction =
  | "move"
  | "turn"
  | "interact"
  | "grab"
  | "teleport"
  | "menu"
  | "back"
  | "photo"
  | "inventory"
  | "sprint";

export type ActionState = {
  /** continuous axes */
  moveX: number;
  moveY: number;
  turnX: number;
  turnY: number;
  /** edge-triggered buttons (true for one frame after press) */
  interact: boolean;
  interactHeld: boolean;
  grab: boolean;
  grabHeld: boolean;
  teleport: boolean;
  teleportHeld: boolean;
  menu: boolean;
  back: boolean;
  photo: boolean;
  inventory: boolean;
  sprint: boolean;
};

export function emptyActions(): ActionState {
  return {
    moveX: 0,
    moveY: 0,
    turnX: 0,
    turnY: 0,
    interact: false,
    interactHeld: false,
    grab: false,
    grabHeld: false,
    teleport: false,
    teleportHeld: false,
    menu: false,
    back: false,
    photo: false,
    inventory: false,
    sprint: false,
  };
}

/** Merge multiple provider snapshots; axes sum+clamp, buttons OR */
export function mergeActions(...parts: ActionState[]): ActionState {
  const out = emptyActions();
  for (const p of parts) {
    out.moveX += p.moveX;
    out.moveY += p.moveY;
    out.turnX += p.turnX;
    out.turnY += p.turnY;
    out.interact = out.interact || p.interact;
    out.interactHeld = out.interactHeld || p.interactHeld;
    out.grab = out.grab || p.grab;
    out.grabHeld = out.grabHeld || p.grabHeld;
    out.teleport = out.teleport || p.teleport;
    out.teleportHeld = out.teleportHeld || p.teleportHeld;
    out.menu = out.menu || p.menu;
    out.back = out.back || p.back;
    out.photo = out.photo || p.photo;
    out.inventory = out.inventory || p.inventory;
    out.sprint = out.sprint || p.sprint;
  }
  out.moveX = Math.max(-1, Math.min(1, out.moveX));
  out.moveY = Math.max(-1, Math.min(1, out.moveY));
  out.turnX = Math.max(-1, Math.min(1, out.turnX));
  out.turnY = Math.max(-1, Math.min(1, out.turnY));
  return out;
}
