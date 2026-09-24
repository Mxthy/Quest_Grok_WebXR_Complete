/**
 * Abstract XR input providers — Controller vs HandTracking.
 * Engine only consumes ActionState + rays.
 *
 * KB: xr-interaction/hand-tracking — optional feature, pinch hysteresis,
 * controller fallback when joints are lost. Uses Three.js hand joint Object3Ds
 * (r160 WebXRManager does not expose getFrame).
 */
import * as THREE from "three";
import { XRHandModelFactory } from "three/addons/webxr/XRHandModelFactory.js";
import { emptyActions, type ActionState } from "@/xr/InputActions";

export interface XRInputProvider {
  readonly id: string;
  update(): void;
  toActions(): ActionState;
  getPrimaryRay(origin: THREE.Vector3, dir: THREE.Vector3): boolean;
  pulse?(hand: "left" | "right", intensity?: number, ms?: number): void;
  dispose(): void;
}

const PINCH_ON = 0.028;
const PINCH_OFF = 0.042;
const _idx = new THREE.Vector3();
const _th = new THREE.Vector3();

type HandSide = "left" | "right";
type JointMap = Record<string, THREE.Object3D>;

export class HandTrackingProvider implements XRInputProvider {
  readonly id = "hand-tracking";
  private parent: THREE.Object3D;
  private hands: THREE.XRHandSpace[] = [];
  private pinch = { left: false, right: false };
  private prevPinch = { left: false, right: false };
  private grasp = { left: false, right: false };
  private prevGrasp = { left: false, right: false };
  private rayOrigin = { left: new THREE.Vector3(), right: new THREE.Vector3() };
  private rayDir = { left: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(0, 0, -1) };
  private connected = { left: false, right: false };
  private enabled = false;

  constructor(renderer: THREE.WebGLRenderer, parent: THREE.Object3D) {
    this.parent = parent;
    let factory: XRHandModelFactory | null = null;
    try {
      factory = new XRHandModelFactory();
    } catch {
      factory = null;
    }
    for (let i = 0; i < 2; i++) {
      const hand = renderer.xr.getHand(i);
      parent.add(hand);
      this.hands.push(hand);
      if (factory) {
        try {
          hand.add(factory.createHandModel(hand, "boxes"));
        } catch {
          /* visual optional */
        }
      }
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  private jointsOf(hand: THREE.XRHandSpace): JointMap {
    return ((hand as THREE.XRHandSpace & { joints?: JointMap }).joints ?? {}) as JointMap;
  }

  update(): void {
    this.enabled = false;
    this.connected.left = false;
    this.connected.right = false;

    this.hands.forEach((hand, i) => {
      const joints = this.jointsOf(hand);
      const index = joints["index-finger-tip"];
      const thumb = joints["thumb-tip"];
      const wrist = joints["wrist"];
      if (!index || !thumb) return;
      index.updateMatrixWorld(true);
      thumb.updateMatrixWorld(true);
      index.getWorldPosition(_idx);
      thumb.getWorldPosition(_th);
      if (_idx.lengthSq() < 1e-8 && _th.lengthSq() < 1e-8) return;

      this.enabled = true;
      const side: HandSide = i === 1 ? "right" : "left";
      this.connected[side] = true;
      const pinchDist = _idx.distanceTo(_th);
      if (this.pinch[side]) {
        if (pinchDist > PINCH_OFF) this.pinch[side] = false;
      } else if (pinchDist < PINCH_ON) {
        this.pinch[side] = true;
      }

      const mid = joints["middle-finger-tip"];
      if (mid) {
        mid.updateMatrixWorld(true);
        const md = mid.getWorldPosition(new THREE.Vector3()).distanceTo(_th);
        this.grasp[side] = md < 0.045;
      }

      if (wrist) {
        wrist.updateMatrixWorld(true);
        wrist.getWorldPosition(this.rayOrigin[side]);
        const q = new THREE.Quaternion();
        wrist.getWorldQuaternion(q);
        this.rayDir[side].set(0, 0, -1).applyQuaternion(q).normalize();
      }
    });
  }

  toActions(): ActionState {
    const a = emptyActions();
    if (!this.enabled) return a;
    const pinchNow = this.pinch.left || this.pinch.right;
    const pinchEdge =
      (this.pinch.left && !this.prevPinch.left) || (this.pinch.right && !this.prevPinch.right);
    a.interactHeld = pinchNow;
    a.interact = pinchEdge;
    const gNow = this.grasp.left || this.grasp.right;
    const gEdge =
      (this.grasp.left && !this.prevGrasp.left) || (this.grasp.right && !this.prevGrasp.right);
    a.grabHeld = gNow;
    a.grab = gEdge;
    this.prevPinch.left = this.pinch.left;
    this.prevPinch.right = this.pinch.right;
    this.prevGrasp.left = this.grasp.left;
    this.prevGrasp.right = this.grasp.right;
    return a;
  }

  getPrimaryRay(origin: THREE.Vector3, dir: THREE.Vector3): boolean {
    if (this.connected.right) {
      origin.copy(this.rayOrigin.right);
      dir.copy(this.rayDir.right);
      return true;
    }
    if (this.connected.left) {
      origin.copy(this.rayOrigin.left);
      dir.copy(this.rayDir.left);
      return true;
    }
    return false;
  }

  dispose(): void {
    for (const h of this.hands) this.parent.remove(h);
  }
}
