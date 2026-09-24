import * as THREE from "three";
import { createApartment, collidePlayer } from "@/components/Apartment";
import { createVivi, type ViviCompanion } from "@/components/Vivi";
import { Input } from "@/game/controls";
import { useGameStore } from "@/stores/gameStore";
import {
  beatAt,
  formatClock,
  GAME_MINUTES_PER_REAL_SECOND,
  isAwakeHour,
  sunFactor,
  isNight,
} from "@/systems/scheduleSystem";
import { expressionFromMood, expressionAfterTouch } from "@/systems/moodSystem";
import { zoneToRegion } from "@/systems/intimacyNegotiation";
import { inferOutcome } from "@/systems/viviPersona";
import {
  pickBestZone,
  pickBestZoneRanked,
  pickInteractable,
  screenRay,
  centerRay,
  interactionLayer,
  applyZoneHit,
  createComboState,
  registerComboHit,
  zoneSummaryLine,
  consentPromptText,
  type ZoneHit,
} from "@/systems/interactionSystem";
import { playSfx, setAmbience, setRadio, unlockAudio } from "@/systems/audioSystem";
import { tickImmersion, getImmersion, playSpatialGiggle } from "@/systems/immersionSystem";
import {
  updateAudioListener,
  setSourcePosition,
} from "@/systems/spatialAudio";
import type { InteractableDef, PlacedItem, ZoneDef } from "@/game/types";
import { emptyActions, mergeActions, type ActionState } from "@/xr/InputActions";
import { createWebXRClient, type WebXRClient } from "@/clients/webxr";
import { getCapabilities } from "@/platform/PlatformCapabilities";
import { applyQuestSceneProfile } from "@/xr/QuestPerformance";
import { saveManager } from "@/save/SaveManager";
import recipes from "@/data/recipes.json";
import items from "@/data/items.json";
import zonesData from "@/data/zones.json";
import dialogues from "@/data/dialogues.json";

const SENS = 0.0022;
const WALK = 2.35;
const _ray = new THREE.Ray();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _head = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _ndc = new THREE.Vector2();

type Recipe = (typeof recipes)[number];

export function createGame(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // Quest performance: slightly lower pixel ratio when on Quest UA
  try {
    if (getCapabilities().platform === "quest") {
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
    }
  } catch { /* */ }
  renderer.xr.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1714);
  scene.fog = new THREE.Fog(0x1a1714, 12, 22);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 40);
  camera.rotation.order = "YXZ";
  const player = new THREE.Vector3(2.85, 1.55, 4.25);
  let yaw = 0;
  let pitch = -0.12;
  let trauma = 0;

  const clock = new THREE.Clock();
  const input = new Input();
  const detachInput = input.attach(host);

    // --- WebXR client (KB: platform-adapters — simulation does not import raw XR) ---
  const xr: WebXRClient = createWebXRClient(renderer, scene, camera);
  void xr.init();
  (window as unknown as { __xr?: unknown }).__xr = {
    start: () => xr.enterImmersive(),
    end: () => xr.exitImmersive(),
    getInfo: () => xr.getSessionInfo(),
    isPresenting: () => xr.isPresenting(),
    getDiagnostics: () =>
      xr.getDiagnostics({
        vrm: vivi?.loaded ? "OK" : "loading",
        audio: "OK",
      }),
    reloadComfort: () => xr.reloadComfort(),
  };

  const apartment = createApartment(scene);
  try {
    applyQuestSceneProfile(scene);
  } catch {
    /* */
  }
  let vivi: ViviCompanion | null = null;
  let using: InteractableDef | null = null;
  let useT = 0;
  let zoneCool = 0;
  let lastViviX = 0;
  let lastViviZ = 0;
  let lastPlayerX = 0;
  let lastPlayerZ = 0;
  let lastViviYaw = 0;

  let lastXrFrame: ReturnType<WebXRClient["tick"]> | null = null;
  let giftCool = 0;
  let photoYaw = 0;
  /** per-zone last trigger (ms) — matches HTML prototype cooldowns */
  const zoneLastTrigger = new Map<string, number>();
  const comboState = createComboState();
  let photoPitch = 0.15;
  let photoDist = 2.2;
  let ghost: THREE.Mesh | null = null;
  let ghostYaw = 0;
  let photoIndex = 0;
  let photoTimer = 0;

  const store = () => useGameStore.getState();

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  store().setLoading(true, 0.05);

  createVivi(scene, (p) => store().setLoading(true, 0.1 + p * 0.85))
    .then((v) => {
      vivi = v;
      v.setOutfit(store().outfit);
      v.target.set(3.35, 0, 3.55);
      v.group.position.set(3.35, 0, 3.55);
      store().setLoading(false, 1);
    })
    .catch((err) => {
      console.error(err);
      store().setLoading(false, 1, "Companion failed to load");
    });

  apartment.syncPlaced(store().placedItems);
  apartment.setPhoto(null, 0);

  ghost = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.28),
    new THREE.MeshBasicMaterial({ color: 0xc8ccd4, transparent: true, opacity: 0.35 }),
  );
  ghost.visible = false;
  scene.add(ghost);

  const floorRay = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function applyCamera() {
    if (xr.isPresenting() && lastXrFrame) {
      // WebXR owns camera pose (KB: renderer owns XR; sim only tracks logical player)
      player.x = lastXrFrame.feet.x;
      player.z = lastXrFrame.feet.z;
      player.y = lastXrFrame.feet.y + lastXrFrame.eyeHeight;
      return;
    }
    if (store().photoMode && vivi) {
      const c = vivi.group.position;
      camera.position.set(
        c.x + Math.sin(photoYaw) * photoDist,
        c.y + 1.15 + photoPitch,
        c.z + Math.cos(photoYaw) * photoDist,
      );
      camera.lookAt(c.x, c.y + 1.25, c.z);
      return;
    }
    const shake = trauma * trauma;
    player.y = 1.55;
    camera.position.set(
      player.x + (Math.random() - 0.5) * shake * 0.08,
      player.y + (Math.random() - 0.5) * shake * 0.05,
      player.z + (Math.random() - 0.5) * shake * 0.08,
    );
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = (Math.random() - 0.5) * shake * 0.02;
    xr.syncFromDesktop(player.x, player.z, yaw);
  }

  function movePlayer(dt: number) {
    if (xr.isPresenting()) return; // locomotion system handles XR
    const a = input.actions();
    _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const sp = (a.sprint ? 1.55 : 1) * WALK;
    player.x += (_fwd.x * a.moveY + _right.x * a.moveX) * sp * dt;
    player.z += (_fwd.z * a.moveY + _right.z * a.moveX) * sp * dt;
    collidePlayer(player, apartment.walls, 0.22);
    player.y = 1.55;
    xr.syncFromDesktop(player.x, player.z, yaw);
  }

  function isWalkable(x: number, z: number): boolean {
    _tmp.set(x, 1.0, z);
    collidePlayer(_tmp, apartment.walls, 0.22);
    // if collision pushed far away, not walkable
    return Math.hypot(_tmp.x - x, _tmp.z - z) < 0.08;
  }

  function desktopActionsToUnified(): ActionState {
    const a = input.actions();
    const u = emptyActions();
    u.moveX = a.moveX;
    u.moveY = a.moveY;
    u.sprint = a.sprint;
    u.interact = a.interactDown;
    u.interactHeld = a.interact;
    if (input.just.KeyP) u.photo = true;
    if (input.just.KeyI) u.inventory = true;
    if (input.just.Escape) u.menu = true;
    return u;
  }

    function currentRay() {
    if (xr.isPresenting() && lastXrFrame?.hasRay) {
      _ray.origin.copy(lastXrFrame.rayOrigin);
      _ray.direction.copy(lastXrFrame.rayDirection);
      return _ray;
    }
    if (input.pointerLocked) centerRay(camera, _ray);
    else screenRay(camera, input.pointerNdcX, input.pointerNdcY, _ray);
    return _ray;
  }

  function interactablesWorld() {
    const list: { def: InteractableDef; world: THREE.Vector3 }[] = [];
    for (const def of apartment.interactables) {
      const p = apartment.proxies.get(def.id);
      const world = p
        ? p.getWorldPosition(_tmp.clone())
        : new THREE.Vector3(def.position[0], def.position[1], def.position[2]);
      list.push({ def, world });
    }
    return list;
  }

  function hoverTick() {
    const s = store();
    if (!s.playing || s.paused || s.dialogueId || s.panel !== "none" || s.photoMode || s.placeMode) {
      apartment.hoverOutline.visible = false;
      s.setHover("", "");
      return;
    }
    const ray = currentRay();

    if (vivi) {
      const zones = (zonesData as ZoneDef[]).map((def) => ({
        def,
        world: vivi!.zoneWorld.get(def.id) ?? _tmp,
      }));
      const layer = interactionLayer(s.level);
      const zh = pickBestZone(ray, zones, {
        level: s.level,
        layer,
        consent: s.consent,
        lastTrigger: zoneLastTrigger,
        energy: s.energy,
        inputMode: xr.isPresenting() ? "controllerRay" : "mouseRay",
        agreement: s.intimacy,
        persona: s.persona,
        trust: s.intimacy.trust,
      });
      if (zh && zh.strength > 0.2) {
        apartment.hoverOutline.visible = true;
        apartment.hoverOutline.position.copy(
          vivi.zoneWorld.get(zh.def.id) ?? vivi.group.position,
        );
        apartment.hoverOutline.scale.setScalar(Math.max(0.2, zh.def.radius * 1.4));
        const gate =
          zh.reason === "consent"
            ? " · consent required"
            : zh.reason === "layer"
              ? ` · needs layer ${zh.def.layer}`
              : zh.reason === "level"
                ? ` · needs level ${zh.def.requiresLevel}`
                : zh.reason === "cooldown"
                  ? " · cooldown"
                  : " · click to touch";
        s.setHover(
          `Vivi · ${zh.def.id}`,
          `Layer ${zh.def.layer ?? 0} · str ${zh.strength.toFixed(2)}${gate}`,
        );
        if (xr.isPresenting()) {
          const wp = vivi.zoneWorld.get(zh.def.id) ?? vivi.group.position;
          xr.showPrompt(`[Trigger] ${zh.def.id}${gate}`, wp, camera);
        } else {
          xr.hidePrompt();
        }
        return;
      }
    }
    xr.hidePrompt();

    const hit = pickInteractable(ray, player, interactablesWorld());
    if (hit) {
      apartment.hoverOutline.visible = true;
      apartment.hoverOutline.position.set(hit.position[0], hit.position[1], hit.position[2]);
      apartment.hoverOutline.scale.setScalar(Math.max(0.35, hit.radius * 0.45));
      s.setHover(hit.name, hit.description);
    } else {
      apartment.hoverOutline.visible = false;
      s.setHover("", "");
    }
  }

  function beginUse(def: InteractableDef) {
    using = def;
    useT = 0;
    playSfx("click");
  }

  function finishUse(def: InteractableDef) {
    const s = store();
    s.markInteract(def.id);
    s.log(`Interact: ${def.id}`);
    s.addStats({
      affection: def.affection,
      comfort: def.comfort,
      energy: def.kind === "sleep" ? 0 : def.energy,
    });
    switch (def.kind) {
      case "talk":
        s.setDialogue(def.dialogue ?? "laptop_hello");
        break;
      case "sit":
      case "look":
      case "read":
      case "watch":
      case "tea":
      case "diary":
        if (def.dialogue) s.setDialogue(def.dialogue);
        break;
      case "sleep":
        s.setDialogue("sleep_1");
        break;
      case "fridge":
        s.setPanel("fridge");
        break;
      case "cook":
        tryCook();
        break;
      case "shop":
        s.setPanel("shop");
        break;
      case "wardrobe":
        s.setPanel("wardrobe");
        if (def.dialogue) s.setDialogue(def.dialogue);
        break;
      case "gallery":
        s.setPanel("gallery");
        if (def.dialogue) s.setDialogue(def.dialogue);
        break;
      case "radio": {
        const on = !s.radioOn;
        s.setRadio(on);
        setRadio(on);
        s.toast(on ? "Radio on" : "Radio off");
        break;
      }
      case "light":
        s.setLamp(!s.lampOn);
        break;
      case "water": {
        const ok = s.waterPlant();
        if (ok) s.setDialogue("plant_1");
        else s.setDialogue("watered_already");
        break;
      }
      case "calendar":
        s.toast(`Day ${s.day} · ${formatClock(s.gameMinutes)}`);
        break;
      case "door":
        player.x = player.x < 6 ? 6.45 : 5.55;
        player.z = 2.65;
        break;
      default:
        if (def.dialogue) s.setDialogue(def.dialogue);
    }
  }

  function tryCook() {
    const s = store();
    const slots = [...s.cookingSlots].sort();
    if (slots.length < 3) {
      s.setDialogue("need_ingredients");
      s.setPanel("fridge");
      return;
    }
    const match = (recipes as Recipe[]).find((r) => {
      const need = [...r.ingredients].sort();
      return need.every((n, i) => n === slots[i]);
    });
    if (!match) {
      s.setDialogue("no_recipe");
      s.setCookingSlots([]);
      return;
    }
    s.setPanel("cook");
    playSfx("cook");
    window.setTimeout(() => {
      const st = store();
      st.cookSuccess(match.id, match.coins);
      st.addStats({ affection: match.affection, comfort: match.comfort });
      st.setDialogue(
        match.id === "omurice"
          ? "cook_omurice"
          : match.id === "hot_cocoa"
            ? "cook_cocoa"
            : "cook_pancakes",
      );
      st.setPanel("none");
      st.toast(`${match.name} ready`);
    }, match.cookTime * 1000);
  }

  function tryTouch() {
    if (!vivi || zoneCool > 0) return false;
    const s = store();
    if (s.paused || s.dialogueId) return false;

    const ray = currentRay();
    const zones = [...vivi.zoneWorld.entries()].map(([id, world]) => ({
      def: vivi!.zones.find((z) => z.id === id)!,
      world,
    })).filter((z) => z.def);

    const layer = interactionLayer(s.level);
    const inputMode = xr.isPresenting() ? "controllerRay" as const : "mouseRay" as const;
    const hit = pickBestZoneRanked(ray, zones, {
      level: s.level,
      layer,
      consent: s.consent,
      lastTrigger: zoneLastTrigger,
      energy: s.energy,
      inputMode,
      agreement: s.intimacy,
      persona: s.persona,
      trust: s.intimacy.trust,
    });
    if (!hit) return false;

    if (hit.reason === "consent" || hit.reason === "region" || hit.reason === "check_in") {
      s.toast(hit.hint ?? consentPromptText(hit.def.id));
      s.log(zoneSummaryLine(hit));
      // Never unlock by force — open negotiation / check-in instead
      if (!s.dialogueId && !s.llmPanelOpen) {
        // Prefer live LLM layer when configured; scripted nodes remain fallback inside LLM
        s.setCompanionReaction("touch_blocked");
        s.openLlmDialogue({
          scene: hit.reason === "check_in" ? "aftercare" : "negotiate",
          zoneId: hit.def.id,
          zoneLayer: hit.def.layer,
          gateReason: hit.reason,
          seedNodeId: hit.reason === "check_in" ? "check_in_prompt" : "negotiate_hub",
        });
      }
      return false;
    }
    if (hit.reason === "pace") {
      s.toast(hit.hint ?? "Too fast for the agreed pace");
      if (!s.dialogueId) s.setDialogue("negotiate_pace");
      return false;
    }
    if (hit.reason === "layer") {
      s.toast(hit.hint ?? `Needs layer ${hit.def.layer}`);
      return false;
    }
    if (hit.reason === "level") {
      s.toast(hit.hint ?? "Level too low");
      return false;
    }
    if (hit.reason === "cooldown") {
      return false;
    }
    if (hit.reason === "energy") {
      s.toast(hit.hint ?? "Too tired");
      return false;
    }
    if (hit.reason !== "ok") {
      if (hit.hint) s.toast(hit.hint);
      return false;
    }

    const cd = hit.def.cooldown ?? 1.2;
    zoneCool = Math.max(zoneCool, cd * 0.35);
    zoneLastTrigger.set(hit.def.id, performance.now());
    trauma = Math.min(1, trauma + 0.35 + hit.strength * 0.2);

    const rewards = applyZoneHit(hit.def, hit.strength);
    const combo = registerComboHit(comboState, hit.def.id);
    const aff = rewards.affection + combo.bonusAffection;

    s.addStats({
      affection: aff,
      comfort: rewards.comfort,
      coins: rewards.coins,
      energy: rewards.energy,
    });
    const face = expressionAfterTouch(
      hit.def.id,
      hit.def.layer ?? 0,
      hit.strength,
      s.consent,
    );
    vivi.setExpression(face.expression || hit.def.expression, face.weight ?? rewards.expressionWeight);
    playSfx("giggle");
    playSpatialGiggle();
    if (face.line && s.showZones) s.toast(face.line);

    let msg = `IV ${hit.def.id} L${hit.def.layer ?? 0} str ${hit.strength.toFixed(2)} +${aff} aff`;
    if (combo.streak >= 2) msg += ` · combo x${combo.streak}`;
    if (combo.bonusAffection) msg += ` (+${combo.bonusAffection} combo)`;
    s.log(msg);
    if (s.showZones) s.toast(msg);

    if ((hit.def.layer ?? 0) >= 1) {
      s.noteSharedIntimacy();
    }
    {
      const region = zoneToRegion(hit.def.id, hit.def.layer ?? 0, hit.def.tags);
      const outcome = inferOutcome({
        strength: hit.strength,
        layer: hit.def.layer ?? 0,
        energy: s.energy,
      });
      s.learnPersonaBeat(region, outcome);
      s.syncAgreementWithPersona();
      s.setCompanionReaction("touch_ok");
      s.syncCompanion();
    }

    // Mutual check-in cadence on close layer
    if ((hit.def.layer ?? 0) >= 2 && s.intimacy.checkIns && Math.random() < 0.35) {
      s.setDialogue("check_in_prompt");
    } else {
      const dlg = rewards.dialogueId;
      if (dlg) s.setDialogue(dlg);
    }

    const hapticMs = hit.def.haptic ?? 40;
    if ("vibrate" in navigator) navigator.vibrate?.(hapticMs);
    if (xr.isPresenting()) {
      const intensity = Math.min(1, 0.35 + hit.strength * 0.55 + (hit.def.layer ?? 0) * 0.1);
      xr.pulseHaptic("right", intensity, hapticMs);
      xr.pulseHaptic("left", intensity * 0.55, hapticMs * 0.7);
    }
    return true;
  }

  function tryGift() {
    if (!vivi || giftCool > 0) return false;
    const d = player.distanceTo(vivi.group.position);
    if (d > 1.6) return false;
    const s = store();
    const gift = s.inventory.find((i) => i.kind === "gift" || i.kind === "dish");
    if (!gift) return false;
    if (!s.removeItem(gift.id, 1)) return false;
    giftCool = 1;
    const shop = (items.shop as { id: string; affection: number; comfort: number }[]).find(
      (x) => x.id === gift.id,
    );
    s.addStats({ affection: shop?.affection ?? 8, comfort: shop?.comfort ?? 4 });
    useGameStore.setState({ giftedCount: s.giftedCount + 1 });
    const node = (dialogues as { nodes: Record<string, unknown> }).nodes[`gift_${gift.id}`]
      ? `gift_${gift.id}`
      : "gift_generic";
    s.setDialogue(node);
    playSfx("gift");
    vivi.setExpression("happy", 0.85);
    return true;
  }

  function placeTick() {
    const s = store();
    if (!s.placeMode || !s.placeItemId || !ghost) {
      if (ghost) ghost.visible = false;
      return;
    }
    floorRay.set(camera.position, _fwd.copy(_ray.direction));
    currentRay();
    floorRay.ray.copy(_ray);
    const ok = floorRay.ray.intersectPlane(plane, _hit);
    if (ok) {
      ghost.visible = true;
      ghost.position.set(_hit.x, 0.12, _hit.z);
      ghost.rotation.y = ghostYaw;
      _hit.y = 0.02;
    }
  }

  function confirmPlace() {
    const s = store();
    if (!s.placeMode || !s.placeItemId || !ghost?.visible) return;
    const item: PlacedItem = {
      uid: `p_${Date.now()}`,
      itemId: s.placeItemId,
      position: [ghost.position.x, 0.02, ghost.position.z],
      rotationY: ghostYaw,
      wall: false,
    };
    s.placeDecor(item);
    apartment.syncPlaced(useGameStore.getState().placedItems);
    playSfx("click");
    if (!inventoryHas(s.placeItemId)) s.setPlaceMode(false);
  }

  function inventoryHas(id: string) {
    return (store().inventory.find((i) => i.id === id)?.qty ?? 0) > 0;
  }

  function capturePhoto() {
    const s = store();
    const src =
      xr.captureFrame(renderer, scene, camera) ??
      (() => {
        renderer.render(scene, camera);
        try {
          return canvas.toDataURL("image/jpeg", 0.62);
        } catch {
          return null;
        }
      })();
    if (!src) {
      s.toast("Couldn't capture photo");
      s.setPhotoMode(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 360;
      const ctx = c.getContext("2d");
      ctx?.drawImage(img, 0, 0, 640, 360);
      const small = c.toDataURL("image/jpeg", 0.55);
      useGameStore.getState().addPhoto(small);
      const tex = new THREE.TextureLoader().load(small);
      tex.colorSpace = THREE.SRGBColorSpace;
      apartment.setPhoto(tex, 0);
    };
    img.src = src;
    playSfx("click");
    s.setPhotoMode(false);
  }

  function onPointerDown(e: PointerEvent) {
    const s = store();
    if (!s.playing || s.paused) return;
    if (s.dialogueId || (s.panel !== "none" && s.panel !== "cook")) return;
    const rect = canvas.getBoundingClientRect();
    input.setNdc(e.clientX, e.clientY, rect);
    if (s.photoMode) {
      capturePhoto();
      return;
    }
    if (s.placeMode) {
      confirmPlace();
      return;
    }
    if (tryTouch()) return;
    if (tryGift()) return;
    const ray = currentRay();
    const hit = pickInteractable(ray, player, interactablesWorld());
    if (hit) beginUse(hit);
    else if (!input.pointerLocked && e.button === 0) {
      canvas.requestPointerLock?.();
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    input.setNdc(e.clientX, e.clientY, rect);
  });

  const onKey = () => {
    /* handled in loop via just */
  };
  window.addEventListener("keydown", onKey);

  function handleHotkeys() {
    const s = store();
    if (!s.playing) return;
    if (input.just.Escape) {
      if (s.dialogueId) s.setDialogue(null);
      else if (s.panel !== "none") s.setPanel("none");
      else if (s.photoMode) s.setPhotoMode(false);
      else if (s.placeMode) s.setPlaceMode(false);
      else s.setPaused(!s.paused);
      if (document.pointerLockElement) document.exitPointerLock();
    }
    if (s.paused || s.dialogueId) return;
    if (input.just.KeyI) s.setPanel(s.panel === "inventory" ? "none" : "inventory");
    if (input.just.KeyM) s.setPanel(s.panel === "shop" ? "none" : "shop");
    if (input.just.KeyB) {
      const decor = s.inventory.find((i) => i.kind === "decor");
      s.setPlaceMode(!s.placeMode, decor?.id ?? null);
      if (!decor) s.toast("No decor in inventory");
    }
    if (input.just.KeyP) {
      s.setPhotoMode(!s.photoMode);
      if (!s.photoMode) return;
      vivi?.setExpression("happy", 0.6);
    }
  }

  function tickMoodExpr(dt: number) {
    if (!vivi) return;
    const s = store();
    const mood = expressionFromMood(s.affection, s.comfort, s.energy);
    // Don't override recent touch
    if (zoneCool <= 0) vivi.setExpression(mood, mood === "happy" ? 0.85 : mood === "relaxed" ? 0.7 : 1);
    void dt;
  }

  let acc = 0;
  const FIXED = 1 / 60;

  function animate() {
    const raw = Math.min(clock.getDelta(), 0.1);
    acc += raw;
    const s = store();
    input.beginFrame();
    handleHotkeys();
    const allowMove = s.playing && !s.paused && !s.photoMode && s.panel === "none" && !s.dialogueId;
    lastXrFrame = xr.tick(raw, {
      collide: (pos, radius) => collidePlayer(pos, apartment.walls, radius),
      isWalkable,
      allowMove,
    });
        if (s.playing && !s.paused) s.tickPersonaAutonomy();

    const presenting = lastXrFrame.presenting;

    // Unified actions: desktop + XR adapter (KB: only ActionState crosses the boundary)
    let unified = desktopActionsToUnified();
    if (presenting) {
      unified = mergeActions(unified, lastXrFrame.actions);
      if (lastXrFrame.uiConsumed) {
        input.consumeLook();
      } else {
        if (s.placeMode) {
          ghostYaw += lastXrFrame.actions.turnX * raw * 1.8;
          if (lastXrFrame.actions.interact) confirmPlace();
          if (lastXrFrame.actions.grab || lastXrFrame.actions.back) s.setPlaceMode(false);
        } else if (s.photoMode) {
          if (lastXrFrame.actions.interact || lastXrFrame.actions.photo) capturePhoto();
          if (lastXrFrame.actions.grab || lastXrFrame.actions.back) s.setPhotoMode(false);
        } else {
          if (unified.photo) {
            s.setPhotoMode(true);
            vivi?.setExpression("happy", 0.6);
          }
          if (unified.inventory) {
            s.setPanel(s.panel === "inventory" ? "none" : "inventory");
          }
          if (unified.menu) {
            s.setPaused(!s.paused);
            s.setPanel(s.paused ? "none" : "pause");
          }
          if (unified.interact && !s.paused && !s.dialogueId && s.panel === "none") {
            if (!tryTouch()) {
              const ray = currentRay();
              const hit = pickInteractable(ray, player, interactablesWorld());
              if (hit) beginUse(hit);
              else tryGift();
            }
          }
        }
      }
    }

    if (s.playing && !s.paused && !s.photoMode && !presenting) {
      const look = input.consumeLook();
      yaw -= look.x * SENS;
      pitch -= look.y * SENS;
      pitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2);
    } else if (s.photoMode && !presenting) {
      const look = input.consumeLook();
      photoYaw -= look.x * SENS * 1.2;
      photoPitch -= look.y * 0.01;
      photoPitch = THREE.MathUtils.clamp(photoPitch, -0.4, 0.8);
      const a = input.actions();
      photoDist = THREE.MathUtils.clamp(photoDist - a.moveY * raw * 1.4, 1.1, 4.2);
    } else {
      input.consumeLook();
    }

    while (acc >= FIXED) {
      if (s.playing && !s.paused && !s.photoMode && s.panel === "none" && !s.dialogueId) {
        if (presenting && lastXrFrame) {
          // locomotion already advanced in xr.tick; sync logical player
          player.x = lastXrFrame.feet.x;
          player.z = lastXrFrame.feet.z;
          player.y = lastXrFrame.feet.y + lastXrFrame.eyeHeight;
          yaw = lastXrFrame.yaw;
        } else {
          movePlayer(FIXED);
        }
      }
      acc -= FIXED;
    }

    if (s.playing && !s.paused) {
      s.tickDecay(raw, isAwakeHour(s.gameMinutes));
      s.setGameMinutes(s.gameMinutes + raw * GAME_MINUTES_PER_REAL_SECOND);
      apartment.setDayNight(sunFactor(s.gameMinutes), isNight(s.gameMinutes), s.lampOn);
      const beat = beatAt(s.gameMinutes);
      if (vivi) {
        vivi.target.set(beat.position[0], 0, beat.position[2]);
        _head.copy(camera.position);
        const lookOverride = s.photoMode
          ? camera.position
          : beat.look
            ? _tmp.set(beat.look[0], beat.look[1], beat.look[2])
            : null;
        // Prefer looking at player if close
        const toPlayer = vivi.group.position.distanceTo(player);
        const look = toPlayer < 3.2 ? _head : lookOverride;
              // Immersion director — proximity, breath, audio, light warmth
      const viviMoving =
        Math.hypot(vivi.group.position.x - lastViviX, vivi.group.position.z - lastViviZ) > 0.002;
      const playerMoving = Math.hypot(player.x - lastPlayerX, player.z - lastPlayerZ) > 0.002;
      const viviTurning = Math.abs(vivi.group.rotation.y - lastViviYaw) > 0.01;
      lastViviX = vivi.group.position.x;
      lastViviZ = vivi.group.position.z;
      lastPlayerX = player.x;
      lastPlayerZ = player.z;
      lastViviYaw = vivi.group.rotation.y;

      // Spatial listener at camera / player head
      camera.getWorldDirection(_fwd);
      updateAudioListener(
        { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        { x: _fwd.x, y: _fwd.y, z: _fwd.z },
      );
      vivi.getHead(_head);
      setSourcePosition("vivi_head", _head.x, _head.y, _head.z);
      setSourcePosition("vivi_cloth", _head.x, _head.y - 0.35, _head.z);
      setSourcePosition("vivi_feet", vivi.group.position.x, 0.05, vivi.group.position.z);
      setSourcePosition("player_feet", player.x, 0.05, player.z);

      const imm = tickImmersion({
        dt: raw,
        playerPos: player,
        viviPos: vivi.group.position,
        companion: s.companion,
        consent: s.consent,
        presenting: lastXrFrame?.presenting ?? false,
        night: isNight(s.gameMinutes),
        viviMoving,
        viviTurning,
        playerMoving,
      });
      // Warm key light from companion warmth
      try {
        let hemi = scene.getObjectByName("hemi") as THREE.HemisphereLight | undefined;
        let key = scene.getObjectByName("key") as THREE.DirectionalLight | undefined;
        if (!hemi || !key) {
          scene.traverse((o) => {
            if (!hemi && o instanceof THREE.HemisphereLight) {
              o.name = "hemi";
              hemi = o;
            }
            if (!key && o instanceof THREE.DirectionalLight) {
              o.name = "key";
              key = o;
            }
          });
        }
        if (hemi) {
          hemi.intensity = 0.45 + imm.warmthLight * 0.35;
          hemi.color.setHSL(0.08, 0.25 + imm.warmthLight * 0.35, 0.85);
        }
        if (key) {
          key.intensity = 0.55 + imm.warmthLight * 0.4;
          key.color.setHSL(0.07, 0.35 + imm.proximity * 0.25, 0.92);
        }
        // Soft fog density rises slightly when close
        if (scene.fog && scene.fog instanceof THREE.FogExp2) {
          scene.fog.density = 0.018 + imm.proximity * 0.012;
        } else if (!scene.fog) {
          scene.fog = new THREE.FogExp2(0x1a1520, 0.02);
        }
      } catch { /* */ }
      if (imm.hapticIdle > 0 && lastXrFrame?.presenting) {
        // rare soft presence haptic — not spammy
        if (Math.random() < imm.hapticIdle * 0.02) {
          xr.pulseHaptic("left", 0.15, 12);
        }
      }
      vivi.update(raw, _head, look, {
        breathHz: imm.breathHz,
        lookSnap: imm.lookSnap,
        proximity: imm.proximity,
      });
      // Shared breath — tiny camera lift when very close (desktop), sells presence
      if (!lastXrFrame?.presenting && imm.proximity > 0.55) {
        const bob = Math.sin(performance.now() * 0.001 * imm.breathHz * Math.PI * 2) * 0.004 * imm.proximity;
        camera.position.y += bob;
      }
        if (s.outfit) vivi.setOutfit(s.outfit);
      }
      if (zoneCool > 0) zoneCool -= raw;
      if (giftCool > 0) giftCool -= raw;
      trauma = Math.max(0, trauma - raw * 2.2);

      if (using) {
        useT += raw;
        s.setUseProgress(useT / using.useTime);
        if (useT >= using.useTime) {
          const d = using;
          using = null;
          s.setUseProgress(0);
          finishUse(d);
        }
      }

      hoverTick();
      placeTick();

      photoTimer += raw;
      if (photoTimer > 6) {
        photoTimer = 0;
        photoIndex = (photoIndex + 1) % 3;
        if (s.photos.length === 0) apartment.setPhoto(null, photoIndex);
      }
    }

    tickMoodExpr(raw);
    applyCamera();
    renderer.render(scene, camera);

    // expose fps-ish
    if (import.meta.env.DEV) {
      (window as unknown as { __drawCalls?: number }).__drawCalls = renderer.info.render.calls;
    }
  }

  renderer.setAnimationLoop(animate);

  // Controls + QA probe
  const probe = {
    getYaw: () => yaw,
    getSpeed: () => {
      const a = input.actions();
      return Math.hypot(a.moveX, a.moveY) * WALK;
    },
    setKeys: (codes: string[]) => input.setKeys(codes),
    setSteer: (v: number) => {
      // FPS: steer unused; map to yaw for the §5c test so A = left (+yaw)
      yaw += v * 0.0001;
    },
  };
  window.__controlsTest = probe;

  window.__game = {
    getState: () => {
      const s = store();
      return {
        day: s.day,
        affection: s.affection,
        comfort: s.comfort,
        energy: s.energy,
        level: s.level,
        coins: s.coins,
        interacted: s.interacted,
        photos: s.photos.length,
        placed: s.placedItems.length,
        clock: formatClock(s.gameMinutes),
        player: player.toArray(),
        vivi: vivi?.group.position.toArray() ?? null,
        loaded: !!vivi?.loaded,
      };
    },
    interact: (id: string) => {
      const def = apartment.interactables.find((x) => x.id === id);
      if (def) finishUse(def);
    },
    touchZone: (id: string) => {
      if (!vivi) return;
      const def = (zonesData as ZoneDef[]).find((z) => z.id === id);
      if (!def) return;
      store().addStats({ affection: def.affection, comfort: def.comfort });
      store().log(`Zone ${def.id} strength 0.6`);
      vivi.setExpression(def.expression, 0.85);
      playSfx("giggle");
    },
    start: () => {
      unlockAudio();
      store().start();
    },
    sleep: () => store().sleepToNextDay(),
    photo: () => capturePhoto(),
    setStats: (d: { affection?: number }) => store().addStats(d),
    setMove: (x: number, y: number) => {
      input.touchMoveX = x;
      input.touchMoveY = y;
    },
  };

  const onVis = () => {
    if (document.visibilityState === "visible") unlockAudio();
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    renderer.setAnimationLoop(null);
    detachInput();
    ro.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("visibilitychange", onVis);
    try { xr.dispose(); } catch { /* */ }
    apartment.dispose();
    vivi?.dispose();
    renderer.dispose();
    delete window.__controlsTest;
    delete window.__game;
    delete (window as unknown as { __xr?: unknown }).__xr;
  };
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
      setSteer?: (v: number) => void;
    };
    __game?: {
      getState: () => unknown;
      interact: (id: string) => void;
      touchZone: (id: string) => void;
      start: () => void;
      sleep: () => void;
      photo: () => void;
      setStats: (d: { affection?: number }) => void;
      setMove?: (x: number, y: number) => void;
    };
    __xr?: {
      start: () => Promise<boolean>;
      end: () => Promise<void>;
      getInfo: () => unknown;
      isPresenting: () => boolean;
      getDiagnostics: () => unknown;
      reloadComfort: () => void;
    };
  }
}
