/**
 * Quest 3 WebXR performance profile.
 * KB: life-vibe/performance/quest3-budgets — target 72 FPS (~13.9 ms) as an
 * engineering budget, not a measured device guarantee.
 */
import type * as THREE from "three";
import { getCapabilities } from "@/platform/PlatformCapabilities";

export const QUEST_TARGET_FPS = 72;
export const QUEST_FRAME_BUDGET_MS = 1000 / QUEST_TARGET_FPS;

export type PerformanceTier = "desktop" | "quest";

export function detectPerformanceTier(): PerformanceTier {
  try {
    if (getCapabilities().platform === "quest") return "quest";
  } catch {
    /* */
  }
  return "desktop";
}

export function applyQuestRendererProfile(renderer: THREE.WebGLRenderer): void {
  const tier = detectPerformanceTier();
  try {
    if (typeof renderer.xr.setFoveation === "function") {
      renderer.xr.setFoveation(tier === "quest" ? 1 : 0.5);
    }
  } catch {
    /* foveation optional */
  }
  if (tier !== "quest") return;
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = 0 as THREE.ToneMapping; // NoToneMapping
  renderer.toneMappingExposure = 1;
}

export function applyQuestSceneProfile(scene: THREE.Scene): void {
  if (detectPerformanceTier() !== "quest") return;
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const mat = m as THREE.MeshStandardMaterial;
      if ("castShadow" in mesh) mesh.castShadow = false;
      if ("receiveShadow" in mesh) mesh.receiveShadow = false;
      if ("envMapIntensity" in mat) mat.envMapIntensity = 0;
      if ("shadowSide" in mat) mat.needsUpdate = true;
    }
  });
}
