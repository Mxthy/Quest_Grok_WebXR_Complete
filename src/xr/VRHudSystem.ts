/**
 * World-space VR HUD. Canvas textures, ray-selectable buttons, same store as DOM HUD.
 * Panels sit 1.8–2.4 m in front of the player (comfort / readability).
 */
import * as THREE from "three";
import { useGameStore } from "@/stores/gameStore";
import { getDialogueNode, enterDialogueNode } from "@/systems/dialogueActions";
import {
  vrClosePanel,
  vrSelectDialogue,
  vrInventoryUse,
  vrShopBuy,
  vrFridgeTake,
  vrFridgeClear,
  vrSetOutfit,
  vrOpenPhoto,
  vrToggleComfort,
  vrResume,
  vrResetSave,
} from "@/xr/vrPanelActions";
import { loadComfort } from "@/xr/VRComfortSettings";
import type { XRDiagSnapshot } from "@/xr/XRDiagnostics";
import items from "@/data/items.json";
import recipes from "@/data/recipes.json";
import { formatClock } from "@/systems/scheduleSystem";

type Btn = { id: string; x: number; y: number; w: number; h: number; label: string };

const PW = 1024;
const PH = 768;

export class VRHudSystem {
  readonly group: THREE.Group;
  private panel: THREE.Mesh;
  private status: THREE.Mesh;
  private panelMat: THREE.MeshBasicMaterial;
  private statusMat: THREE.MeshBasicMaterial;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private statusCanvas: HTMLCanvasElement;
  private statusCtx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private statusTex: THREE.CanvasTexture;
  private buttons: Btn[] = [];
  private lastKey = "";
  private hoverId: string | null = null;
  private raycaster = new THREE.Raycaster();
  private lastDialogue: string | null = null;
  private locked = false;
  private diag: XRDiagSnapshot | null = null;
  showDiag = false;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = "VRHudSystem";

    this.canvas = document.createElement("canvas");
    this.canvas.width = PW;
    this.canvas.height = PH;
    this.ctx = this.canvas.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.panelMat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.02), this.panelMat);
    this.panel.name = "VRPanel";
    this.panel.visible = false;
    this.group.add(this.panel);

    this.statusCanvas = document.createElement("canvas");
    this.statusCanvas.width = 768;
    this.statusCanvas.height = 160;
    this.statusCtx = this.statusCanvas.getContext("2d")!;
    this.statusTex = new THREE.CanvasTexture(this.statusCanvas);
    this.statusTex.colorSpace = THREE.SRGBColorSpace;
    this.statusMat = new THREE.MeshBasicMaterial({
      map: this.statusTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.status = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.15), this.statusMat);
    this.status.position.set(0, -0.55, 0);
    this.group.add(this.status);

    this.group.visible = false;
    scene.add(this.group);
  }

  setDiagnostics(d: XRDiagSnapshot | null) {
    this.diag = d;
  }

  update(
    presenting: boolean,
    camera: THREE.Camera,
    rayOrigin: THREE.Vector3,
    rayDir: THREE.Vector3,
    interact: boolean,
    back: boolean,
  ) {
    if (!presenting) {
      this.group.visible = false;
      this.locked = false;
      return false;
    }
    this.group.visible = true;
    const s = useGameStore.getState();
    if (s.dialogueId !== this.lastDialogue) {
      this.lastDialogue = s.dialogueId;
      enterDialogueNode(s.dialogueId);
      this.locked = false;
    }

    const needsPanel =
      !!s.dialogueId ||
      s.panel !== "none" ||
      s.photoMode ||
      s.paused ||
      this.showDiag;

    if (needsPanel && !this.locked) {
      this.placeInFront(camera, 2.05);
      this.locked = true;
    }
    if (!needsPanel) this.locked = false;

    this.panel.visible = needsPanel;
    this.redraw();

    this.raycaster.set(rayOrigin, rayDir);
    this.hoverId = null;
    let consumed = false;
    if (needsPanel) {
      const hits = this.raycaster.intersectObject(this.panel, false);
      const uv = hits[0]?.uv;
      if (uv) {
        const px = uv.x * PW;
        const py = (1 - uv.y) * PH;
        const btn = this.buttons.find(
          (b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h,
        );
        this.hoverId = btn?.id ?? null;
        if (btn && interact) {
          this.dispatch(btn.id);
          consumed = true;
        }
      }
    }
    if (back && needsPanel) {
      if (s.dialogueId) useGameStore.getState().setDialogue(null);
      else vrClosePanel();
      consumed = true;
    }
    return consumed;
  }

  private placeInFront(camera: THREE.Camera, dist: number) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const pos = new THREE.Vector3();
    camera.getWorldPosition(pos);
    pos.addScaledVector(dir, dist);
    pos.y = Math.max(1.15, Math.min(1.7, pos.y - 0.05));
    this.group.position.copy(pos);
    const look = pos.clone().add(dir);
    this.group.lookAt(look.x, pos.y, look.z);
  }

  private dispatch(id: string) {
    if (id.startsWith("dlg:")) vrSelectDialogue(id.slice(4));
    else if (id.startsWith("inv:")) vrInventoryUse(id.slice(4));
    else if (id.startsWith("shop:")) vrShopBuy(id.slice(4));
    else if (id.startsWith("fridge:")) vrFridgeTake(id.slice(7));
    else if (id.startsWith("fit:")) vrSetOutfit(id.slice(4));
    else if (id === "close") vrClosePanel();
    else if (id === "continue") vrSelectDialogue("__continue");
    else if (id === "fridge-clear") vrFridgeClear();
    else if (id === "photo") vrOpenPhoto();
    else if (id === "resume") vrResume();
    else if (id === "reset") vrResetSave();
    else if (id === "smooth") vrToggleComfort({ smoothEnabled: !loadComfort().smoothEnabled });
    else if (id === "teleport") vrToggleComfort({ teleportEnabled: !loadComfort().teleportEnabled });
    else if (id === "snap")
      vrToggleComfort({ turn: loadComfort().turn === "snap" ? "smooth" : "snap" });
    else if (id === "vignette") vrToggleComfort({ vignette: !loadComfort().vignette });
    else if (id === "diag") this.showDiag = !this.showDiag;
    this.lastKey = "";
  }

  private redraw() {
    const s = useGameStore.getState();
    const comfort = loadComfort();
    const key = [
      s.dialogueId,
      s.panel,
      s.photoMode,
      s.paused,
      s.hoverName,
      s.day,
      Math.round(s.affection),
      s.coins,
      s.inventory.map((i) => i.id + i.qty).join(","),
      s.cookingSlots.join(","),
      comfort.smoothEnabled,
      comfort.teleportEnabled,
      comfort.turn,
      this.hoverId,
      this.showDiag,
      this.diag?.fps,
    ].join("|");
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.buttons = [];
    const ctx = this.ctx;
    ctx.clearRect(0, 0, PW, PH);

    this.drawStatus(s);

    if (s.dialogueId) this.drawDialogue(s.dialogueId);
    else if (s.photoMode) this.drawPhoto();
    else if (s.panel === "inventory") this.drawInventory(s);
    else if (s.panel === "shop") this.drawShop(s);
    else if (s.panel === "fridge") this.drawFridge(s);
    else if (s.panel === "cook") this.drawCook();
    else if (s.panel === "wardrobe") this.drawWardrobe(s);
    else if (s.panel === "gallery") this.drawGallery(s);
    else if (s.panel === "pause" || s.paused || this.showDiag) this.drawPause(comfort);

    this.tex.needsUpdate = true;
    this.statusTex.needsUpdate = true;
  }

  private drawStatus(s: ReturnType<typeof useGameStore.getState>) {
    const c = this.statusCtx;
    c.clearRect(0, 0, 768, 160);
    round(c, 8, 8, 752, 144, 18);
    c.fillStyle = "rgba(16,14,12,0.88)";
    c.fill();
    c.fillStyle = "#f3efe7";
    c.font = "600 36px system-ui, sans-serif";
    c.fillText(`Day ${s.day}  ${formatClock(s.gameMinutes)}`, 28, 58);
    c.font = "500 28px system-ui, sans-serif";
    c.fillStyle = "#a39b90";
    const hover = s.hoverName ? ` · ${s.hoverName}` : "";
    c.fillText(`♥ ${Math.round(s.affection)}  $ ${s.coins}${hover}`, 28, 108);
  }

  private header(title: string) {
    const ctx = this.ctx;
    round(ctx, 24, 24, PW - 48, PH - 48, 28);
    ctx.fillStyle = "rgba(18,16,14,0.92)";
    ctx.fill();
    ctx.fillStyle = "#f3efe7";
    ctx.font = "600 44px system-ui, sans-serif";
    ctx.fillText(title, 56, 90);
    this.btn("close", PW - 180, 44, 120, 56, "Close");
  }

  private drawDialogue(id: string) {
    const node = getDialogueNode(id);
    if (!node) return;
    this.header(node.speaker);
    const ctx = this.ctx;
    ctx.fillStyle = "#f3efe7";
    ctx.font = "500 34px system-ui, sans-serif";
    wrap(ctx, node.text, 56, 150, PW - 112, 42);
    if (node.choices?.length) {
      node.choices.forEach((ch, i) => {
        this.btn(`dlg:${ch.id}`, 56, 420 + i * 88, PW - 112, 76, ch.label);
      });
    } else {
      this.btn("continue", PW - 280, PH - 130, 220, 72, "Continue");
    }
  }

  private drawInventory(s: ReturnType<typeof useGameStore.getState>) {
    this.header("Inventory");
    const names = Object.fromEntries(
      [...items.decor, ...items.shop, ...items.ingredients].map((i) => [i.id, i.name]),
    );
    if (!s.inventory.length) {
      this.ctx.fillStyle = "#a39b90";
      this.ctx.font = "500 32px system-ui, sans-serif";
      this.ctx.fillText("Empty pockets.", 56, 180);
      return;
    }
    s.inventory.slice(0, 8).forEach((it, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      this.btn(
        `inv:${it.id}`,
        56 + col * 460,
        150 + row * 100,
        440,
        84,
        `${names[it.id] ?? it.id}  ×${it.qty}`,
      );
    });
  }

  private drawShop(s: ReturnType<typeof useGameStore.getState>) {
    this.header(`Shop  ·  ${s.coins} coins`);
    items.shop.slice(0, 6).forEach((it, i) => {
      this.btn(`shop:${it.id}`, 56, 140 + i * 90, PW - 112, 80, `${it.name}  —  ${it.price}`);
    });
  }

  private drawFridge(s: ReturnType<typeof useGameStore.getState>) {
    this.header("Fridge");
    this.ctx.fillStyle = "#a39b90";
    this.ctx.font = "500 26px system-ui, sans-serif";
    this.ctx.fillText(
      `Slots: ${s.cookingSlots.join(", ") || "—"}   ${recipes.map((r) => r.name).join(" · ")}`,
      56,
      150,
    );
    items.ingredients.forEach((ing, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      this.btn(
        `fridge:${ing.id}`,
        56 + col * 460,
        180 + row * 90,
        440,
        78,
        `${ing.name} · ${s.ingredients[ing.id] ?? 0}`,
      );
    });
    this.btn("fridge-clear", 56, PH - 130, 220, 70, "Clear");
  }

  private drawCook() {
    this.header("Cooking");
    this.ctx.fillStyle = "#a39b90";
    this.ctx.font = "500 34px system-ui, sans-serif";
    this.ctx.fillText("The pan is working. Stay a moment.", 56, 220);
  }

  private drawWardrobe(s: ReturnType<typeof useGameStore.getState>) {
    this.header("Wardrobe");
    items.outfits.forEach((o, i) => {
      const open = s.unlockedOutfits.includes(o.id);
      this.btn(
        open ? `fit:${o.id}` : "noop",
        56,
        150 + i * 90,
        PW - 112,
        80,
        `${o.name}${s.outfit === o.id ? "  (on)" : open ? "" : "  locked"}`,
      );
    });
  }

  private drawGallery(s: ReturnType<typeof useGameStore.getState>) {
    this.header("Photographs");
    this.ctx.fillStyle = "#a39b90";
    this.ctx.font = "500 30px system-ui, sans-serif";
    this.ctx.fillText(`${s.photos.length} kept in this save.`, 56, 180);
    this.btn("photo", 56, 230, PW - 112, 80, "Take a photograph");
  }

  private drawPhoto() {
    this.header("Photo mode");
    this.ctx.fillStyle = "#f3efe7";
    this.ctx.font = "500 34px system-ui, sans-serif";
    wrap(this.ctx, "Point at Vivi. Pull the trigger to keep this frame. Grip or Back to cancel.", 56, 180, PW - 112, 42);
  }

  private drawPause(comfort: ReturnType<typeof loadComfort>) {
    this.header("Paused · Comfort");
    this.btn("resume", 56, 140, 420, 72, "Resume");
    this.btn("smooth", 56, 230, 420, 72, `Smooth move: ${comfort.smoothEnabled ? "ON" : "off"}`);
    this.btn("teleport", 500, 230, 420, 72, `Teleport: ${comfort.teleportEnabled ? "ON" : "off"}`);
    this.btn("snap", 56, 320, 420, 72, `Turn: ${comfort.turn}`);
    this.btn("vignette", 500, 320, 420, 72, `Vignette: ${comfort.vignette ? "ON" : "off"}`);
    this.btn("diag", 56, 410, 420, 72, this.showDiag ? "Hide diagnostics" : "XR diagnostics");
    this.btn("reset", 500, 410, 420, 72, "New save");
    if (this.showDiag && this.diag) {
      this.ctx.fillStyle = "#9aada3";
      this.ctx.font = "500 26px ui-monospace, monospace";
      const lines = [
        `XR ${this.diag.xrSession}  ref ${this.diag.referenceSpace}`,
        `L ${this.diag.leftController}  R ${this.diag.rightController}`,
        `trig ${this.diag.trigger}  grip ${this.diag.grip}  ${this.diag.thumbstick}`,
        `FPS ${this.diag.fps}  ${this.diag.frameMs}ms  draws ${this.diag.drawCalls}  tris ${this.diag.triangles}`,
        `VRM ${this.diag.vrm}  audio ${this.diag.audio}`,
      ];
      lines.forEach((ln, i) => this.ctx.fillText(ln, 56, 530 + i * 36));
    }
  }

  private btn(id: string, x: number, y: number, w: number, h: number, label: string) {
    this.buttons.push({ id, x, y, w, h, label });
    const ctx = this.ctx;
    const hover = this.hoverId === id;
    round(ctx, x, y, w, h, 14);
    ctx.fillStyle = hover ? "rgba(154,173,163,0.95)" : "rgba(42,38,34,0.95)";
    ctx.fill();
    ctx.strokeStyle = hover ? "#f3efe7" : "rgba(243,239,231,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = hover ? "#141210" : "#f3efe7";
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillText(label.slice(0, 42), x + 20, y + h / 2 + 10);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.panel.geometry.dispose();
    this.status.geometry.dispose();
    this.tex.dispose();
    this.statusTex.dispose();
    this.panelMat.dispose();
    this.statusMat.dispose();
  }
}

function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}
