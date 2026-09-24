/**
 * Smooth locomotion, snap turn, teleport — operates on XRPlayerRig.
 * KB: teleport default, snap 30–45°, vignette while moving.
 */
import * as THREE from "three";
import type { XRPlayerRig } from "@/xr/XRPlayerRig";
import type { ActionState } from "@/xr/InputActions";
import type { VRComfortConfig } from "@/xr/VRComfortSettings";
import type { QuestControllerLayer } from "@/xr/QuestControllerLayer";

export type FloorProbe = (x: number, z: number) => boolean;

export type LocomotionResult = {
  moved: boolean;
  turned: boolean;
  teleported: boolean;
};

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hit = new THREE.Vector3();

export class LocomotionSystem {
  private snapCool = 0;
  private teleportArmed = false;
  private teleportTarget: THREE.Vector3 | null = null;
  private marker: THREE.Mesh;
  private rayLine: THREE.Line;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.28, 28),
      new THREE.MeshBasicMaterial({
        color: 0x6ee7a8,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    scene.add(this.marker);

    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ]);
    this.rayLine = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0x6ee7a8, transparent: true, opacity: 0.55 }),
    );
    this.rayLine.visible = false;
    scene.add(this.rayLine);
  }

  update(
    dt: number,
    actions: ActionState,
    rig: XRPlayerRig,
    comfort: VRComfortConfig,
    presenting: boolean,
    controllers: QuestControllerLayer | null,
    collide: (pos: THREE.Vector3, radius: number) => void,
    isWalkable: FloorProbe,
  ): LocomotionResult {
    const result: LocomotionResult = { moved: false, turned: false, teleported: false };
    if (!presenting) {
      this.marker.visible = false;
      this.rayLine.visible = false;
      return result;
    }
    if (this.snapCool > 0) this.snapCool -= dt;

    if (comfort.turn === "snap") {
      if (Math.abs(actions.turnX) > 0.55 && this.snapCool <= 0) {
        const ang = (comfort.snapAngleDeg * Math.PI) / 180;
        rig.rotateAroundHead(-Math.sign(actions.turnX) * ang);
        this.snapCool = 0.28;
        result.turned = true;
      }
    } else if (Math.abs(actions.turnX) > 0.12) {
      rig.rotateAroundHead(-actions.turnX * comfort.smoothTurnSpeed * dt);
      result.turned = true;
    }

    const smoothOn =
      comfort.smoothEnabled && (comfort.locomotion === "smooth" || comfort.locomotion === "both");
    if (smoothOn && (Math.abs(actions.moveX) > 0.05 || Math.abs(actions.moveY) > 0.05)) {
      const proposed = rig.proposeMove(
        actions.moveX,
        actions.moveY,
        comfort.moveSpeed,
        dt,
        true,
      );
      collide(proposed, rig.radius);
      if (isWalkable(proposed.x, proposed.z)) {
        rig.commitPosition(proposed.x, proposed.z);
        result.moved = true;
      }
    }

    const teleportOn =
      comfort.teleportEnabled &&
      (comfort.locomotion === "teleport" || comfort.locomotion === "both");
    if (teleportOn) {
      const aiming = actions.teleportHeld;
      if (aiming && controllers) {
        const ok = controllers.getPrimaryRay(_origin, _dir);
        if (ok) {
          const t = _dir.y < -0.04 ? -(_origin.y - 0.02) / _dir.y : -1;
          if (t > 0.25 && t < 10) {
            _hit.copy(_origin).addScaledVector(_dir, t);
            const valid = isWalkable(_hit.x, _hit.z);
            this.teleportTarget = valid ? _hit.clone() : null;
            this.marker.visible = true;
            this.marker.position.set(_hit.x, 0.03, _hit.z);
            (this.marker.material as THREE.MeshBasicMaterial).color.setHex(
              valid ? 0x6ee7a8 : 0xf87171,
            );
            this.rayLine.visible = true;
            const pos = this.rayLine.geometry.attributes.position as THREE.BufferAttribute;
            pos.setXYZ(0, _origin.x, _origin.y, _origin.z);
            pos.setXYZ(1, _hit.x, 0.03, _hit.z);
            pos.needsUpdate = true;
            this.teleportArmed = valid;
          } else {
            this.hideTeleport();
          }
        }
      } else {
        if (this.teleportArmed && this.teleportTarget && !aiming) {
          const p = this.teleportTarget;
          const probe = new THREE.Vector3(p.x, 0, p.z);
          collide(probe, rig.radius);
          if (isWalkable(probe.x, probe.z)) {
            rig.teleportFeet(probe.x, probe.z);
            result.teleported = true;
          }
        }
        this.hideTeleport();
      }
    } else {
      this.hideTeleport();
    }

    return result;
  }

  private hideTeleport() {
    this.teleportArmed = false;
    this.teleportTarget = null;
    this.marker.visible = false;
    this.rayLine.visible = false;
  }

  dispose() {
    this.scene.remove(this.marker);
    this.scene.remove(this.rayLine);
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
    this.rayLine.geometry.dispose();
    (this.rayLine.material as THREE.Material).dispose();
  }
}
