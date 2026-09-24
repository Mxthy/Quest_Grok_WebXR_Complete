import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { OutfitDef, ZoneDef } from "@/game/types";
import zonesData from "@/data/zones.json";
import items from "@/data/items.json";

const BONE_NAMES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
  "leftEye",
  "rightEye",
  "jaw",
] as const;

export type ViviCompanion = {
  group: THREE.Group;
  vrm: VRM | null;
  loaded: boolean;
  height: number;
  target: THREE.Vector3;
  lookAtWorld: THREE.Vector3;
  zoneWorld: Map<string, THREE.Vector3>;
  expression: string;
  moving: boolean;
  update: (dt: number, playerHead: THREE.Vector3, lookOverride: THREE.Vector3 | null) => void;
  setExpression: (name: string, weight?: number) => void;
  setOutfit: (id: string) => void;
  getHead: (out: THREE.Vector3) => THREE.Vector3;
  getBoneWorld: (name: string, out: THREE.Vector3) => THREE.Vector3 | null;
  dispose: () => void;
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

function bone(vrm: VRM, name: string) {
  try {
    return vrm.humanoid.getNormalizedBoneNode(name as never);
  } catch {
    return null;
  }
}

export async function createVivi(
  scene: THREE.Scene,
  onProgress?: (p: number) => void,
): Promise<ViviCompanion> {
  const group = new THREE.Group();
  group.name = "vivi";
  scene.add(group);

  const lookTarget = new THREE.Object3D();
  scene.add(lookTarget);

  let vrm: VRM | null = null;
  const zoneWorld = new Map<string, THREE.Vector3>();
  for (const z of zonesData as ZoneDef[]) zoneWorld.set(z.id, new THREE.Vector3());

  const target = new THREE.Vector3(3.35, 0, 3.55);
  const lookAtWorld = new THREE.Vector3(3.0, 1.5, 0.2);
  const clothMats: THREE.MeshStandardMaterial[] = [];
  const hairMats: THREE.MeshStandardMaterial[] = [];
  let blinkT = 3 + Math.random() * 3;
  let blinking = 0;
  let exprName = "neutral";
  let exprHold = 0;
  let t = 0;
  let heading = Math.PI;
  let loaded = false;
  let fallback: THREE.Group | null = null;

  const applyLookAtLimits = (from: THREE.Vector3, to: THREE.Vector3) => {
    const head = _v.copy(from);
    const dir = _v2.copy(to).sub(head);
    const yaw = Math.atan2(dir.x, dir.z);
    const planar = Math.hypot(dir.x, dir.z);
    const pitch = Math.atan2(dir.y, planar);
    const maxYaw = (60 * Math.PI) / 180;
    const maxPitch = (30 * Math.PI) / 180;
    const cyaw = THREE.MathUtils.clamp(yaw - heading, -maxYaw, maxYaw) + heading;
    const cpitch = THREE.MathUtils.clamp(pitch, -maxPitch, maxPitch);
    const dist = dir.length();
    return new THREE.Vector3(
      head.x + Math.sin(cyaw) * Math.cos(cpitch) * dist,
      head.y + Math.sin(cpitch) * dist,
      head.z + Math.cos(cyaw) * Math.cos(cpitch) * dist,
    );
  };

  try {
    const loader = new GLTFLoader();
    loader.crossOrigin = "anonymous";
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync("/vrm/vivi.vrm", (e) => {
      if (e.total) onProgress?.(e.loaded / e.total);
    });
    vrm = gltf.userData.vrm as VRM;
    if (vrm) {
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      try {
        VRMUtils.combineSkeletons(gltf.scene);
      } catch {
        /* optional */
      }
      if (vrm.meta?.metaVersion === "0") {
        VRMUtils.rotateVRM0(vrm);
      }
      vrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (!mat) continue;
            const n = (mat.name ?? obj.name ?? "").toLowerCase();
            if ("color" in mat) {
              if (/hair|bang|pony/.test(n)) hairMats.push(mat as THREE.MeshStandardMaterial);
              else if (/cloth|dress|shirt|top|body|wear|uniform|skirt/.test(n))
                clothMats.push(mat as THREE.MeshStandardMaterial);
            }
          }
        }
      });
      // Scale to ~1.6m
      vrm.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(vrm.scene);
      const size = box.getSize(new THREE.Vector3());
      const s = size.y > 0.2 ? 1.6 / size.y : 1;
      vrm.scene.scale.setScalar(s);
      // Face -Z initially
      vrm.scene.rotation.y = Math.PI;
      group.add(vrm.scene);
      if (vrm.lookAt) {
        vrm.lookAt.target = lookTarget;
        vrm.lookAt.autoUpdate = true;
      }
      loaded = true;
      onProgress?.(1);
    }
  } catch (err) {
    console.warn("VRM load failed, using stand-in", err);
  }

  if (!vrm) {
    fallback = makeFallbackVivi();
    group.add(fallback);
    loaded = true;
    fallback.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        if (o.name.includes("hair")) hairMats.push(o.material);
        if (o.name.includes("cloth")) clothMats.push(o.material);
      }
    });
  }

  group.position.copy(target);

  const setExpression = (name: string, weight = 1) => {
    exprName = name;
    exprHold = 4.5;
    if (!vrm?.expressionManager) return;
    const em = vrm.expressionManager;
    for (const n of ["happy", "angry", "sad", "relaxed", "surprised", "neutral"]) {
      try {
        em.setValue(n, n === name ? weight : 0);
      } catch {
        /* missing expr */
      }
    }
    if (name === "happy") {
      try {
        em.setValue("happy", 0.85);
      } catch {
        /* */
      }
    }
    if (name === "relaxed") {
      try {
        em.setValue("relaxed", 0.7);
      } catch {
        /* */
      }
    }
    if (name === "surprised") {
      try {
        em.setValue("surprised", 0.5);
      } catch {
        /* */
      }
    }
  };

  const setOutfit = (id: string) => {
    const o = (items.outfits as OutfitDef[]).find((x) => x.id === id);
    if (!o) return;
    const cloth = new THREE.Color(o.cloth);
    const hair = new THREE.Color(o.hair);
    for (const m of clothMats) m.color?.set(cloth);
    for (const m of hairMats) m.color?.set(hair);
    if (clothMats.length === 0 && vrm) {
      let i = 0;
      vrm.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material && "color" in obj.material) {
          if (i === 0) (obj.material as THREE.MeshStandardMaterial).color?.set(cloth);
          i++;
        }
      });
    }
  };

  const getBoneWorld = (name: string, out: THREE.Vector3) => {
    if (vrm) {
      const n = bone(vrm, name);
      if (n) {
        n.getWorldPosition(out);
        return out;
      }
    }
    if (fallback) {
      const n = fallback.getObjectByName(`bone_${name}`);
      if (n) {
        n.getWorldPosition(out);
        return out;
      }
    }
    group.getWorldPosition(out);
    if (name === "head") out.y += 1.45;
    if (name === "chest") out.y += 1.15;
    if (name === "hips") out.y += 0.85;
    return out;
  };

  const getHead = (out: THREE.Vector3) => getBoneWorld("head", out) ?? out;

  const updateZones = () => {
    for (const z of zonesData as ZoneDef[]) {
      const w = zoneWorld.get(z.id)!;
      getBoneWorld(z.bone, w);
      w.x += z.offset[0];
      w.y += z.offset[1];
      w.z += z.offset[2];
    }
  };

  const update = (
    dt: number,
    playerHead: THREE.Vector3,
    lookOverride: THREE.Vector3 | null,
    immersion?: { breathHz?: number; lookSnap?: number; proximity?: number },
  ) => {
    t += dt;
    const pos = group.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const speed = 0.8;
    let moving = false;
    if (dist > 0.05) {
      moving = true;
      const step = Math.min(dist, speed * dt);
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      heading = Math.atan2(dx, dz);
    }
    // VRM 1 faces +Z; we want heading 0 = -Z world. rotation.y = heading + PI? 
    // If heading is atan2(dx, dz): moving toward -Z (dz negative) heading = PI.
    // We want the character to face movement. VRM +Z local.
    // rotation.y = heading (if +Z is forward in our heading convention).
    // atan2(dx, dz): toward -Z (0,-1) => atan2(0,-1) = PI. Rotate Y by PI faces -Z. Good.
    const wantY = heading;
    const cur = group.rotation.y;
    let dy = wantY - cur;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    group.rotation.y += dy * Math.min(1, 6 * dt);

    // Breath + sway (rate from immersion director when present)
    const bHz = immersion?.breathHz ?? 0.35;
    const prox = immersion?.proximity ?? 0;
    if (vrm) {
      const spine = bone(vrm, "spine");
      const hips = bone(vrm, "hips");
      const chest = bone(vrm, "chest");
      if (spine) {
        const amp = 0.012 + prox * 0.01;
        const breath = 1 + Math.sin(t * Math.PI * 2 * bHz) * amp;
        spine.scale.y = breath;
      }
      if (hips) {
        hips.rotation.x = Math.sin(t * Math.PI * 2 * bHz * 0.45) * (0.01 + prox * 0.008);
      }
      if (moving) {
        const lu = bone(vrm, "leftUpperLeg");
        const ru = bone(vrm, "rightUpperLeg");
        const la = bone(vrm, "leftUpperArm");
        const ra = bone(vrm, "rightUpperArm");
        const swing = Math.sin(t * 8) * 0.42;
        if (lu) lu.rotation.x = swing;
        if (ru) ru.rotation.x = -swing;
        if (la) la.rotation.z = -0.15 + swing * 0.3;
        if (ra) ra.rotation.z = 0.15 - swing * 0.3;
      }
      if (chest) {
        chest.rotation.y = Math.sin(t * 0.7) * 0.03;
      }
    } else if (fallback) {
      fallback.scale.y = 1 + Math.sin(t * Math.PI * 2 * 0.8) * 0.015;
      fallback.rotation.x = Math.sin(t * Math.PI * 2 * 0.3) * 0.01;
    }

    // Blink
    blinkT -= dt;
    if (blinkT <= 0 && blinking <= 0) {
      blinking = 0.15;
      blinkT = 3 + Math.random() * 3;
    }
    if (blinking > 0) {
      blinking -= dt;
      const w = blinking > 0.075 ? (0.15 - blinking) / 0.075 : blinking / 0.075;
      try {
        vrm?.expressionManager?.setValue("blink", THREE.MathUtils.clamp(w, 0, 1));
      } catch {
        /* */
      }
    } else {
      try {
        vrm?.expressionManager?.setValue("blink", 0);
      } catch {
        /* */
      }
    }

    if (exprHold > 0) exprHold -= dt;

    // Look-at — snappier when immersion says she's engaged
    const lookK = immersion?.lookSnap ?? 5;
    const desired = lookOverride ?? playerHead;
    lookAtWorld.lerp(desired, 1 - Math.exp(-lookK * dt));
    getHead(_v);
    const limited = applyLookAtLimits(_v, lookAtWorld);
    lookTarget.position.lerp(limited, 1 - Math.exp(-lookK * dt));

    vrm?.update(dt);

    // Feet IK — keep on floor
    if (vrm) {
      const hips = bone(vrm, "hips");
      for (const f of ["leftFoot", "rightFoot"] as const) {
        const n = bone(vrm, f);
        if (!n || !hips) continue;
        n.getWorldPosition(_v);
        if (_v.y < 0.02) {
          hips.position.y += (0.02 - _v.y) * 0.4;
        }
      }
    }

    updateZones();
    void _q;
    void _q2;
    void _m;
  };

  const dispose = () => {
    scene.remove(group);
    scene.remove(lookTarget);
    vrm?.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  };

  setOutfit("cream");
  updateZones();

  return {
    group,
    vrm,
    loaded,
    height: 1.6,
    target,
    lookAtWorld,
    zoneWorld,
    get expression() {
      return exprName;
    },
    set expression(v) {
      setExpression(v);
    },
    get moving() {
      return false;
    },
    update,
    setExpression,
    setOutfit,
    getHead,
    getBoneWorld,
    dispose,
  };
}

function makeFallbackVivi() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0d0c0, roughness: 0.65 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.8 });
  cloth.name = "cloth";
  const hair = new THREE.MeshStandardMaterial({ color: 0x3d2b24, roughness: 0.7 });
  hair.name = "hair";
  const add = (mesh: THREE.Mesh, name: string, x: number, y: number, z: number) => {
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), cloth), "bone_hips", 0, 0.85, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.38, 10), cloth), "bone_spine", 0, 1.05, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.28, 10), cloth), "cloth_chest", 0, 1.28, 0);
  const chest = add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin), "bone_chest", 0, 1.22, 0.04);
  void chest;
  add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), skin), "bone_head", 0, 1.52, 0);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), hair), "hair_head", 0, 1.56, -0.01);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), new THREE.MeshStandardMaterial({ color: 0x1c1916 })), "eyeL", -0.035, 1.54, 0.09);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), new THREE.MeshStandardMaterial({ color: 0x1c1916 })), "eyeR", 0.035, 1.54, 0.09);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.32, 8), skin), "bone_leftUpperArm", -0.22, 1.22, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.32, 8), skin), "bone_rightUpperArm", 0.22, 1.22, 0);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), skin), "bone_leftHand", -0.22, 1.0, 0.04);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), skin), "bone_rightHand", 0.22, 1.0, 0.04);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.42, 8), cloth), "bone_leftUpperLeg", -0.07, 0.55, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.42, 8), cloth), "bone_rightUpperLeg", 0.07, 0.55, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.16), cloth), "bone_leftFoot", -0.07, 0.03, 0.04);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.16), cloth), "bone_rightFoot", 0.07, 0.03, 0.04);
  return g;
}
