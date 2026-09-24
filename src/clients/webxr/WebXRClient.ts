/**
 * WebXR client adapter (KB: life-vibe/architecture/platform-adapters,
 * life-vibe/webxr/iwsdk, life-vibe/threejs/webgl2-xr).
 *
 * Simulation must NOT import WebXR session or controller APIs.
 */
import * as THREE from "three";
import { XRSessionManager, type XRSessionInfo } from "@/xr/XRSessionManager";
import { XRPlayerRig } from "@/xr/XRPlayerRig";
import { QuestControllerLayer } from "@/xr/QuestControllerLayer";
import { LocomotionSystem } from "@/xr/Locomotion";
import { XRDiagnostics, type XRDiagSnapshot } from "@/xr/XRDiagnostics";
import { VRWorldUI } from "@/xr/VRWorldUI";
import { VRHudSystem } from "@/xr/VRHudSystem";
import { ComfortVignette } from "@/xr/ComfortVignette";
import { HandTrackingProvider } from "@/xr/XRInputProvider";
import {
  applyQuestRendererProfile,
  QUEST_TARGET_FPS,
  QUEST_FRAME_BUDGET_MS,
} from "@/xr/QuestPerformance";
import { loadComfort, type VRComfortConfig } from "@/xr/VRComfortSettings";
import { emptyActions, mergeActions, type ActionState } from "@/xr/InputActions";
import { getCapabilities, probeImmersiveVR } from "@/platform/PlatformCapabilities";
import { useGameStore } from "@/stores/gameStore";

export { QUEST_TARGET_FPS, QUEST_FRAME_BUDGET_MS };

export type WebXRFrameResult = {
  presenting: boolean;
  actions: ActionState;
  hasRay: boolean;
  rayOrigin: THREE.Vector3;
  rayDirection: THREE.Vector3;
  feet: THREE.Vector3;
  yaw: number;
  eyeHeight: number;
  uiConsumed: boolean;
  locomotion: { moved: boolean; turned: boolean; teleported: boolean };
};

export type WebXRClient = {
  init(): Promise<boolean>;
  enterImmersive(): Promise<boolean>;
  exitImmersive(): Promise<void>;
  isPresenting(): boolean;
  getSessionInfo(): XRSessionInfo;
  tick(
    dt: number,
    opts: {
      collide: (pos: THREE.Vector3, radius: number) => void;
      isWalkable: (x: number, z: number) => boolean;
      allowMove: boolean;
    },
  ): WebXRFrameResult;
  showPrompt(text: string, worldPos: THREE.Vector3, camera: THREE.Camera): void;
  hidePrompt(): void;
  pulseHaptic(hand: "left" | "right", intensity?: number, ms?: number): void;
  getDiagnostics(extra?: Partial<XRDiagSnapshot>): XRDiagSnapshot;
  getComfort(): VRComfortConfig;
  reloadComfort(): void;
  syncFromDesktop(x: number, z: number, yaw: number): void;
  getRigPosition(): THREE.Vector3;
  captureFrame(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): string | null;
  getTurnAxis(): number;
  dispose(): void;
};

export function createWebXRClient(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): WebXRClient {
  renderer.xr.enabled = true;
  applyQuestRendererProfile(renderer);

  const session = new XRSessionManager(renderer);
  const rig = new XRPlayerRig(camera);
  rig.setPosition(2.85, 4.25, 0);
  scene.add(rig.group);

  const controllers = new QuestControllerLayer(renderer, rig.group);
  const hands = new HandTrackingProvider(renderer, rig.group);
  const locomotion = new LocomotionSystem(scene);
  const diag = new XRDiagnostics();
  const worldUI = new VRWorldUI(scene);
  const hud = new VRHudSystem(scene);
  const vignette = new ComfortVignette(camera);
  let comfort = loadComfort();
  let wasPresenting = false;

  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3(0, 0, -1);
  const feet = new THREE.Vector3();
  let lastTurnX = 0;
  let lastLoco = { moved: false, turned: false, teleported: false };

  session.subscribe((info) => {
    const presenting = info.state === "presenting";
    try {
      useGameStore.getState().setXrPresenting?.(presenting);
    } catch {
      /* store may not be ready */
    }
    if (presenting && !wasPresenting) {
      rig.attachForSession(camera, [
        ...controllers.getDollyChildren(),
        ...[],
      ]);
      comfort = loadComfort();
    }
    if (!presenting && wasPresenting) {
      rig.detachFromSession(scene);
    }
    wasPresenting = presenting;
  });

  return {
    async init() {
      await probeImmersiveVR();
      return session.init();
    },

    enterImmersive: () => session.start(),
    exitImmersive: () => session.end(),
    isPresenting: () => session.isPresenting(),
    getSessionInfo: () => session.getInfo(),

    tick(dt, opts) {
      diag.tick(dt);
      const presenting = session.isPresenting();
      let actions = emptyActions();
      let uiConsumed = false;
      lastLoco = { moved: false, turned: false, teleported: false };

      if (presenting) {
        if (camera.parent !== rig.group) {
          rig.attachForSession(camera, controllers.getDollyChildren());
        }
        controllers.update();
        hands.update();
        const ctrl = controllers.toActions();
        const hand = hands.toActions();
        actions = mergeActions(ctrl, hand);

        const hasCtrlRay = controllers.getPrimaryRay(rayOrigin, rayDirection);
        if (!hasCtrlRay) hands.getPrimaryRay(rayOrigin, rayDirection);

        hud.setDiagnostics(
          diag.snapshot({
            xrSession: session.getInfo().state,
            referenceSpace: session.getInfo().referenceSpaceType,
            leftController: controllers.left.connected ? "OK" : "—",
            rightController: controllers.right.connected ? "OK" : "—",
            presenting: true,
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
          }),
        );
        uiConsumed = hud.update(
          true,
          camera,
          rayOrigin,
          rayDirection,
          actions.interact,
          actions.back,
        );

        const allowMove = opts.allowMove && !uiConsumed;
        if (allowMove) {
          lastLoco = locomotion.update(
            dt,
            actions,
            rig,
            comfort,
            true,
            controllers,
            opts.collide,
            opts.isWalkable,
          );
        }
        vignette.setMoving(
          lastLoco.moved || lastLoco.turned || lastLoco.teleported,
          comfort.vignette,
        );
        vignette.update(dt);
        lastTurnX = actions.turnX;
        feet.copy(rig.position);
        return {
          presenting: true,
          actions,
          hasRay: hasCtrlRay || hands.getPrimaryRay(new THREE.Vector3(), new THREE.Vector3()),
          rayOrigin: rayOrigin.clone(),
          rayDirection: rayDirection.clone(),
          feet: feet.clone(),
          yaw: rig.yaw,
          eyeHeight: rig.height + comfort.heightOffset,
          uiConsumed,
          locomotion: lastLoco,
        };
      }

      vignette.setMoving(false, false);
      vignette.update(dt);
      hud.update(false, camera, rayOrigin, rayDirection, false, false);
      feet.copy(rig.position);
      return {
        presenting: false,
        actions: emptyActions(),
        hasRay: false,
        rayOrigin: rayOrigin.clone(),
        rayDirection: rayDirection.clone(),
        feet: feet.clone(),
        yaw: rig.yaw,
        eyeHeight: rig.height + comfort.heightOffset,
        uiConsumed: false,
        locomotion: lastLoco,
      };
    },

    showPrompt(text, worldPos, cam) {
      if (session.isPresenting()) worldUI.show(text, worldPos, cam);
      else worldUI.hide();
    },
    hidePrompt() {
      worldUI.hide();
    },
    pulseHaptic(hand, intensity = 0.6, ms = 40) {
      try {
        controllers.pulse(hand, intensity, ms);
      } catch {
        /* haptic optional */
      }
    },
    getDiagnostics(extra) {
      const info = session.getInfo();
      return diag.snapshot({
        xrSession: info.state,
        referenceSpace: info.referenceSpaceType,
        leftController: controllers.left.connected ? "OK" : "—",
        rightController: controllers.right.connected ? "OK" : "—",
        trigger:
          controllers.left.triggerPressed || controllers.right.triggerPressed ? "ON" : "off",
        grip:
          controllers.left.squeezePressed || controllers.right.squeezePressed ? "ON" : "off",
        thumbstick: `L ${controllers.left.thumbstick.x.toFixed(1)},${controllers.left.thumbstick.y.toFixed(1)}`,
        presenting: session.isPresenting(),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        ...extra,
      });
    },
    getComfort: () => comfort,
    reloadComfort: () => {
      comfort = loadComfort();
    },
    syncFromDesktop(x, z, yaw) {
      if (!session.isPresenting()) {
        rig.commitPosition(x, z);
        rig.setYaw(yaw);
      }
    },
    getRigPosition: () => rig.position.clone(),
    captureFrame(r, sc, cam) {
      try {
        r.render(sc, cam);
        return r.domElement.toDataURL("image/jpeg", 0.62);
      } catch {
        try {
          return r.domElement.toDataURL("image/jpeg", 0.5);
        } catch {
          return null;
        }
      }
    },
    getTurnAxis: () => lastTurnX,
    dispose() {
      try {
        session.dispose();
      } catch {
        /* */
      }
      try {
        controllers.dispose();
      } catch {
        /* */
      }
      try {
        hands.dispose();
      } catch {
        /* */
      }
      try {
        locomotion.dispose();
      } catch {
        /* */
      }
      try {
        worldUI.dispose();
      } catch {
        /* */
      }
      try {
        hud.dispose();
      } catch {
        /* */
      }
      try {
        vignette.dispose();
      } catch {
        /* */
      }
      scene.remove(rig.group);
    },
  };
}
