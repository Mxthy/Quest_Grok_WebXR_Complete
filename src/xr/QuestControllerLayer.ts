/**
 * Quest controller input → unified ActionState.
 * Controllers are parented to the player dolly (not the scene root).
 */
import * as THREE from "three";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { emptyActions, type ActionState } from "@/xr/InputActions";

export type ControllerHand = "left" | "right";

export type ControllerSnapshot = {
  connected: boolean;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  rayOrigin: THREE.Vector3;
  rayDirection: THREE.Vector3;
  trigger: number;
  triggerPressed: boolean;
  squeeze: number;
  squeezePressed: boolean;
  thumbstick: { x: number; y: number };
  buttonA: boolean;
  buttonB: boolean;
  targetRay: THREE.Object3D | null;
  grip: THREE.Object3D | null;
};

const _dir = new THREE.Vector3(0, 0, -1);

function emptySnap(): ControllerSnapshot {
  return {
    connected: false,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    rayOrigin: new THREE.Vector3(),
    rayDirection: new THREE.Vector3(0, 0, -1),
    trigger: 0,
    triggerPressed: false,
    squeeze: 0,
    squeezePressed: false,
    thumbstick: { x: 0, y: 0 },
    buttonA: false,
    buttonB: false,
    targetRay: null,
    grip: null,
  };
}

export class QuestControllerLayer {
  left = emptySnap();
  right = emptySnap();
  private renderer: THREE.WebGLRenderer;
  private parent: THREE.Object3D;
  private prevTrigger = { left: false, right: false };
  private prevSqueeze = { left: false, right: false };
  private prevA = false;
  private prevB = false;
  private prevY = false;
  private prevX = false;
  readonly controllers: THREE.XRTargetRaySpace[] = [];
  readonly grips: THREE.XRGripSpace[] = [];
  private lines: THREE.Line[] = [];
  private tips: THREE.Mesh[] = [];

  constructor(renderer: THREE.WebGLRenderer, parent: THREE.Object3D) {
    this.renderer = renderer;
    this.parent = parent;
    this.setupControllers();
  }

  getDollyChildren(): THREE.Object3D[] {
    return [...this.controllers, ...this.grips];
  }

  private setupControllers() {
    let factory: XRControllerModelFactory | null = null;
    try {
      factory = new XRControllerModelFactory();
    } catch {
      factory = null;
    }

    for (let i = 0; i < 2; i++) {
      const ctrl = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      this.parent.add(ctrl);
      this.parent.add(grip);
      this.controllers.push(ctrl);
      this.grips.push(grip);

      if (factory) {
        try {
          grip.add(factory.createControllerModel(grip));
        } catch {
          /* model optional */
        }
      }

      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1.4),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: 0xa8c0ff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      ctrl.add(line);
      this.lines.push(line);

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.01, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      tip.position.z = -1.4;
      tip.visible = false;
      ctrl.add(tip);
      this.tips.push(tip);
    }
  }

  setRayVisible(visible: boolean) {
    for (const l of this.lines) l.visible = visible;
    for (const t of this.tips) t.visible = visible;
  }

  private readGamepad(src: XRInputSource | undefined, hand: ControllerHand): void {
    const snap = hand === "left" ? this.left : this.right;
    if (!src?.gamepad) {
      snap.trigger = 0;
      snap.triggerPressed = false;
      snap.squeeze = 0;
      snap.squeezePressed = false;
      snap.thumbstick = { x: 0, y: 0 };
      snap.buttonA = false;
      snap.buttonB = false;
      return;
    }
    const gp = src.gamepad;
    const buttons = gp.buttons ?? [];
    snap.trigger = buttons[0]?.value ?? 0;
    snap.triggerPressed = buttons[0]?.pressed ?? snap.trigger > 0.75;
    snap.squeeze = buttons[1]?.value ?? 0;
    snap.squeezePressed = buttons[1]?.pressed ?? snap.squeeze > 0.75;
    const axes = gp.axes ?? [];
    const ax = axes.length >= 4 ? axes[2]! : (axes[0] ?? 0);
    const ay = axes.length >= 4 ? axes[3]! : (axes[1] ?? 0);
    snap.thumbstick = {
      x: deadzone(ax),
      y: deadzone(-ay),
    };
    snap.buttonA = buttons[4]?.pressed ?? false;
    snap.buttonB = buttons[5]?.pressed ?? false;
  }

  update(): void {
    const session = this.renderer.xr.getSession();
    const sources = session?.inputSources ? Array.from(session.inputSources) : [];
    const presenting = this.renderer.xr.isPresenting;

    for (let i = 0; i < 2; i++) {
      const ctrl = this.controllers[i]!;
      const grip = this.grips[i]!;
      let src: XRInputSource | undefined;
      const wanted: ControllerHand = i === 0 ? "left" : "right";
      for (const s of sources) {
        if (s.handedness === wanted) {
          src = s;
          break;
        }
      }
      if (!src) {
        for (const s of sources) {
          if (s.handedness === "none" || s.handedness === "left" || s.handedness === "right") {
            if (!sources.find((x) => x.handedness === wanted) && sources[i] === s) src = s;
          }
        }
      }
      if (!src && sources[i]) src = sources[i];

      const hand: ControllerHand = src?.handedness === "right" || src?.handedness === "left"
        ? src.handedness
        : wanted;
      const snap = hand === "left" ? this.left : this.right;

      snap.targetRay = ctrl;
      snap.grip = grip;
      snap.connected = !!src && !src.hand;

      ctrl.updateMatrixWorld(true);
      ctrl.getWorldPosition(snap.position);
      ctrl.getWorldQuaternion(snap.quaternion);
      snap.rayOrigin.copy(snap.position);
      _dir.set(0, 0, -1).applyQuaternion(snap.quaternion).normalize();
      snap.rayDirection.copy(_dir);

      this.readGamepad(src, hand);
      this.lines[i]!.visible = presenting;
      this.tips[i]!.visible = presenting;
    }
  }

  toActions(): ActionState {
    const a = emptyActions();
    const L = this.left;
    const R = this.right;

    a.moveX = L.thumbstick.x;
    a.moveY = L.thumbstick.y;
    a.turnX = R.thumbstick.x;
    a.turnY = R.thumbstick.y;
    a.teleportHeld = R.thumbstick.y > 0.65;
    a.teleport = a.teleportHeld;

    const trigNow = L.triggerPressed || R.triggerPressed;
    const trigEdge =
      (L.triggerPressed && !this.prevTrigger.left) ||
      (R.triggerPressed && !this.prevTrigger.right);
    a.interactHeld = trigNow;
    a.interact = trigEdge;

    const sqNow = L.squeezePressed || R.squeezePressed;
    const sqEdge =
      (L.squeezePressed && !this.prevSqueeze.left) ||
      (R.squeezePressed && !this.prevSqueeze.right);
    a.grabHeld = sqNow;
    a.grab = sqEdge;

    a.photo = R.buttonA && !this.prevA;
    a.menu = R.buttonB && !this.prevB;
    a.inventory = L.buttonB && !this.prevY;
    a.back = L.buttonA && !this.prevX;

    this.prevTrigger.left = L.triggerPressed;
    this.prevTrigger.right = R.triggerPressed;
    this.prevSqueeze.left = L.squeezePressed;
    this.prevSqueeze.right = R.squeezePressed;
    this.prevA = R.buttonA;
    this.prevB = R.buttonB;
    this.prevY = L.buttonB;
    this.prevX = L.buttonA;

    return a;
  }

  getPrimaryRay(outOrigin: THREE.Vector3, outDir: THREE.Vector3): boolean {
    const primary = this.right.connected ? this.right : this.left.connected ? this.left : null;
    if (!primary) return false;
    outOrigin.copy(primary.rayOrigin);
    outDir.copy(primary.rayDirection);
    return true;
  }

  pulse(hand: ControllerHand, intensity = 0.6, durationMs = 40): void {
    try {
      const session = this.renderer.xr.getSession();
      if (!session) return;
      for (const src of session.inputSources) {
        if (src.handedness !== hand) continue;
        const gp = src.gamepad as Gamepad & {
          hapticActuators?: { pulse: (i: number, d: number) => Promise<boolean> }[];
        };
        const act = gp?.hapticActuators?.[0];
        if (act?.pulse) void act.pulse(Math.min(1, intensity), durationMs);
        const vib = src.gamepad?.vibrationActuator;
        if (vib?.playEffect) {
          void vib.playEffect("dual-rumble", {
            startDelay: 0,
            duration: durationMs,
            weakMagnitude: intensity,
            strongMagnitude: intensity,
          });
        }
      }
    } catch {
      /* haptic optional */
    }
  }

  dispose() {
    for (const c of this.controllers) this.parent.remove(c);
    for (const g of this.grips) this.parent.remove(g);
  }
}

function deadzone(v: number, z = 0.15): number {
  if (Math.abs(v) < z) return 0;
  const s = Math.sign(v);
  return s * ((Math.abs(v) - z) / (1 - z));
}
