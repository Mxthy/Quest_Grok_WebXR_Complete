/**
 * Player dolly — locomotion is applied here, never to the XR camera directly.
 *
 *   PlayerRig (Group / dolly)
 *     ├── XR Camera          (local pose from WebXRManager)
 *     ├── Left/Right target ray
 *     ├── Left/Right grip
 *     └── collision capsule (logical)
 *
 * KB: three.js WebXR — parent camera + controllers to the dolly so snap/teleport
 * move the whole tracking space.
 */
import * as THREE from "three";

export type RigPose = {
  position: THREE.Vector3;
  yaw: number;
};

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _headWorld = new THREE.Vector3();
const _before = new THREE.Vector3();
const _after = new THREE.Vector3();

export class XRPlayerRig {
  readonly group: THREE.Group;
  readonly position: THREE.Vector3;
  yaw = 0;
  height = 1.6;
  radius = 0.22;
  private camera: THREE.PerspectiveCamera;
  private _fwd = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _tmp = new THREE.Vector3();
  private cameraAttached = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = "XRPlayerRig";
    this.position = new THREE.Vector3(2.85, 0, 4.25);
    this.group.position.copy(this.position);
  }

  /** Parent XR camera + controllers so locomotion moves the tracking space. */
  attachForSession(
    camera: THREE.PerspectiveCamera,
    extras: THREE.Object3D[],
  ) {
    this.camera = camera;
    if (camera.parent !== this.group) {
      this.group.add(camera);
    }
    this.cameraAttached = true;
    for (const obj of extras) {
      if (obj.parent !== this.group) this.group.add(obj);
    }
    this.applyYaw();
  }

  detachFromSession(scene: THREE.Scene) {
    if (this.cameraAttached && this.camera.parent === this.group) {
      this.group.remove(this.camera);
    }
    this.cameraAttached = false;
    scene.add(this.camera);
  }

  setPosition(x: number, z: number, y = 0) {
    this.position.set(x, y, z);
    this.group.position.set(x, y, z);
  }

  setYaw(yaw: number) {
    this.yaw = yaw;
    this.applyYaw();
  }

  private applyYaw() {
    this.group.rotation.set(0, this.yaw, 0);
  }

  rotateYaw(delta: number) {
    this.yaw += delta;
    while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    this.applyYaw();
  }

  /**
   * Snap/smooth turn around the headset so the view doesn't orbit the dolly origin.
   */
  rotateAroundHead(delta: number) {
    this.camera.getWorldPosition(_before);
    this.rotateYaw(delta);
    this.group.updateMatrixWorld(true);
    this.camera.getWorldPosition(_after);
    this.group.position.x += _before.x - _after.x;
    this.group.position.z += _before.z - _after.z;
    this.position.x = this.group.position.x;
    this.position.z = this.group.position.z;
  }

  getHeadForward(out: THREE.Vector3, presenting: boolean): THREE.Vector3 {
    if (presenting) {
      this.camera.getWorldDirection(out);
      out.y = 0;
      if (out.lengthSq() < 1e-6) {
        out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      } else {
        out.normalize();
      }
    } else {
      out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }
    return out;
  }

  getHeadRight(out: THREE.Vector3, presenting: boolean): THREE.Vector3 {
    this.getHeadForward(this._fwd, presenting);
    out.crossVectors(this._fwd, Y_AXIS).normalize();
    return out;
  }

  proposeMove(
    moveX: number,
    moveY: number,
    speed: number,
    dt: number,
    presenting: boolean,
  ): THREE.Vector3 {
    this.getHeadForward(this._fwd, presenting);
    this.getHeadRight(this._right, presenting);
    const dist = speed * dt;
    this._tmp.copy(this.position);
    this._tmp.addScaledVector(this._fwd, moveY * dist);
    this._tmp.addScaledVector(this._right, moveX * dist);
    return this._tmp;
  }

  commitPosition(x: number, z: number) {
    this.position.x = x;
    this.position.z = z;
    this.group.position.x = x;
    this.group.position.z = z;
  }

  /**
   * Place logical feet at a world XZ, keeping the headset's current offset
   * relative to the dolly so the user doesn't slide sideways.
   */
  teleportFeet(x: number, z: number) {
    this.camera.getWorldPosition(_headWorld);
    const ox = _headWorld.x - this.group.position.x;
    const oz = _headWorld.z - this.group.position.z;
    this.commitPosition(x - ox, z - oz);
  }

  applyDesktopCamera(pitch: number, heightOffset = 0) {
    this.camera.position.set(
      this.position.x,
      this.position.y + this.height + heightOffset,
      this.position.z,
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = pitch;
    this.camera.rotation.z = 0;
  }

  getEyePosition(out: THREE.Vector3, heightOffset = 0): THREE.Vector3 {
    return out.set(
      this.position.x,
      this.position.y + this.height + heightOffset,
      this.position.z,
    );
  }

  getHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.camera.getWorldPosition(out);
  }

  getPose(): RigPose {
    return { position: this.position.clone(), yaw: this.yaw };
  }
}
