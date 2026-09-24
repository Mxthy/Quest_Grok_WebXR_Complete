import { moveStick } from "@/game/inputBridge";

const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
  "KeyE",
  "KeyI",
  "KeyB",
  "KeyP",
  "KeyM",
  "Escape",
  "KeyC",
]);

export type Actions = {
  moveX: number;
  moveY: number;
  sprint: boolean;
  interact: boolean;
  interactDown: boolean;
};

export class Input {
  keys = new Set<string>();
  injected = new Set<string>();
  lookDx = 0;
  lookDy = 0;
  pointerLocked = false;
  dragging = false;
  ndcX = 0;
  ndcY = 0;
  pointerNdcX = 0;
  pointerNdcY = 0;
  just: Record<string, boolean> = {};
  touchMoveX = 0;
  touchMoveY = 0;
  lookStickX = 0;
  lookStickY = 0;
  private prevJust: Record<string, boolean> = {};

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === "Tab") return;
    this.keys.add(e.code);
    if (GAME_CODES.has(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.dragging = false;
  };

  attach(target: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onBlur);
    target.addEventListener("mousemove", this.onMouseMove);
    target.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    document.addEventListener("pointerlockchange", this.onLock);
    return () => this.detach(target);
  }

  detach(target: HTMLElement) {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onBlur);
    target.removeEventListener("mousemove", this.onMouseMove);
    target.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    document.removeEventListener("pointerlockchange", this.onLock);
  }

  private onLock = () => {
    this.pointerLocked = document.pointerLockElement != null;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.pointerLocked || this.dragging) {
      this.lookDx += e.movementX;
      this.lookDy += e.movementY;
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.button === 2 || e.button === 0) this.dragging = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  private onPointerUp = () => {
    this.dragging = false;
  };

  setNdc(clientX: number, clientY: number, rect: DOMRect) {
    this.pointerNdcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  held(code: string) {
    return this.keys.has(code) || this.injected.has(code);
  }

  consumeLook() {
    const x = this.lookDx + this.lookStickX * 18;
    const y = this.lookDy + this.lookStickY * 14;
    this.lookDx = 0;
    this.lookDy = 0;
    return { x, y };
  }

  beginFrame() {
    const codes = ["KeyE", "KeyI", "KeyB", "KeyP", "Escape", "KeyM", "KeyC"];
    this.just = {};
    for (const c of codes) {
      const down = this.held(c);
      this.just[c] = down && !this.prevJust[c];
      this.prevJust[c] = down;
    }
  }

  actions(): Actions {
    let x = 0;
    let y = 0;
    if (this.held("KeyD") || this.held("ArrowRight")) x += 1;
    if (this.held("KeyA") || this.held("ArrowLeft")) x -= 1;
    if (this.held("KeyW") || this.held("ArrowUp")) y += 1;
    if (this.held("KeyS") || this.held("ArrowDown")) y -= 1;
    x += this.touchMoveX + moveStick.x;
    y += this.touchMoveY + moveStick.y;
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    return {
      moveX: x,
      moveY: y,
      sprint: this.held("ShiftLeft") || this.held("ShiftRight"),
      interact: this.held("KeyE") || this.held("Space"),
      interactDown: !!this.just.KeyE,
    };
  }

  setKeys(codes: string[]) {
    this.injected = new Set(codes);
  }
}
